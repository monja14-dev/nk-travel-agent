import { getReadyDb, withWriteTransaction } from "../client";
import type { AccommodationResult } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { ValidationError, DuplicateResultError } from "../../lib/errors";
import {
  validateAccommodationResultInput,
  hasErrors,
  type AccommodationResultInput,
} from "../../modules/research/validation";
import { normalizeNameForDedup } from "./dedup";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function listAccommodationResultsForTrip(tripId: string): Promise<AccommodationResult[]> {
  return getReadyDb().getAllFromIndex("accommodationResults", "by-trip", tripId);
}

/**
 * Creates a new saved accommodation option for a trip. Validated here
 * (not just trusted from whichever adapter produced `input`) and checked
 * against every existing result for this trip for a same-name duplicate
 * (see dedup.ts) — a silent duplicate row is exactly the kind of mess
 * this comparison table exists to prevent.
 */
export async function createAccommodationResult(
  tripId: string,
  input: AccommodationResultInput,
): Promise<AccommodationResult> {
  const errors = validateAccommodationResultInput(input);
  if (hasErrors(errors)) throw new ValidationError(errors);

  return withWriteTransaction(["accommodationResults", "changeLog"], async (tx) => {
    const store = tx.objectStore("accommodationResults");
    const existingForTrip = await store.index("by-trip").getAll(tripId);
    const normalizedName = normalizeNameForDedup(input.name);
    const duplicate = existingForTrip.find((r) => normalizeNameForDedup(r.name) === normalizedName);
    if (duplicate) {
      throw new DuplicateResultError("accommodation option", input.name, duplicate.id);
    }

    const now = nowIso();
    const result: AccommodationResult = {
      id: generateId("accom"),
      tripId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ...input,
      name: input.name.trim(),
    };
    await store.add(result);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId,
        entityType: "accommodationResults",
        entityId: result.id,
        action: "create",
        after: result,
      }),
    );
    return result;
  });
}

/** Idempotent — deleting an id that's already gone is a no-op, not an
 * error, matching clearOverrideForTrip's precedent. No edit action exists
 * yet for a saved result (Phase 4 scope); removing and re-adding stands
 * in for "correcting" one. */
export async function deleteAccommodationResult(id: string): Promise<void> {
  await withWriteTransaction(["accommodationResults", "changeLog"], async (tx) => {
    const store = tx.objectStore("accommodationResults");
    const existing = await store.get(id);
    if (!existing) return;
    await store.delete(id);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId: existing.tripId,
        entityType: "accommodationResults",
        entityId: id,
        action: "delete",
        before: existing,
      }),
    );
  });
}
