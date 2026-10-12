import { getReadyDb, withWriteTransaction } from "../client";
import type { TripOverride } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { StaleRevisionError } from "../../lib/errors";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function getOverrideForTrip(tripId: string): Promise<TripOverride | undefined> {
  return getReadyDb().getFromIndex("tripOverrides", "by-trip", tripId);
}

export interface TripOverrideInput {
  currency: string;
  budgetTargetMin?: number;
  budgetTargetMax?: number;
  mustHaveAmenities: string[];
  hotelVsAirbnbOpen: boolean;
  rawOverrideText: string;
}

/**
 * Create-or-update in one call — the UI just wants to "save this trip's
 * preferences" without first checking whether an override record exists
 * yet. `expectedRevision` is required (and checked) only when one already
 * exists; there's nothing to conflict with on first creation.
 */
export async function upsertOverrideForTrip(
  tripId: string,
  input: TripOverrideInput,
  expectedRevision?: number,
): Promise<TripOverride> {
  return withWriteTransaction(["tripOverrides", "changeLog"], async (tx) => {
    const store = tx.objectStore("tripOverrides");
    const existing = await store.index("by-trip").get(tripId);
    const now = nowIso();

    if (existing) {
      if (expectedRevision === undefined || existing.revision !== expectedRevision) {
        throw new StaleRevisionError("Trip override", existing.id);
      }
      const updated: TripOverride = { ...existing, ...input, revision: existing.revision + 1, updatedAt: now };
      await store.put(updated);
      await tx.objectStore("changeLog").add(
        buildChangeLogEntry({
          tripId,
          entityType: "tripOverrides",
          entityId: updated.id,
          action: "update",
          before: existing,
          after: updated,
        }),
      );
      return updated;
    }

    const created: TripOverride = {
      id: generateId("override"),
      tripId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    await store.add(created);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({ tripId, entityType: "tripOverrides", entityId: created.id, action: "create", after: created }),
    );
    return created;
  });
}

/** Deletes the override, reverting the trip to pure profile inheritance.
 * A no-op (not an error) if there's nothing to clear — idempotent. */
export async function clearOverrideForTrip(tripId: string, expectedRevision: number): Promise<void> {
  await withWriteTransaction(["tripOverrides", "changeLog"], async (tx) => {
    const store = tx.objectStore("tripOverrides");
    const existing = await store.index("by-trip").get(tripId);
    if (!existing) return;
    if (existing.revision !== expectedRevision) throw new StaleRevisionError("Trip override", existing.id);

    await store.delete(existing.id);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId,
        entityType: "tripOverrides",
        entityId: existing.id,
        action: "delete",
        before: existing,
      }),
    );
  });
}
