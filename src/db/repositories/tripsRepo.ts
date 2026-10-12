import { getReadyDb, withWriteTransaction } from "../client";
import type { Trip, TripOverride, TripStatus } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../lib/errors";
import { validateTripInput, hasErrors, type TripInput } from "../../modules/trips/validation";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function listTrips(options: { includeArchived?: boolean } = {}): Promise<Trip[]> {
  const db = getReadyDb();
  const all = await db.getAll("trips");
  const sorted = [...all].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return options.includeArchived ? sorted : sorted.filter((t) => t.status !== "archived");
}

export async function getTrip(id: string): Promise<Trip | undefined> {
  return getReadyDb().get("trips", id);
}

export async function createTrip(input: TripInput): Promise<Trip> {
  const errors = validateTripInput(input);
  if (hasErrors(errors)) throw new ValidationError(errors);

  const now = nowIso();
  const trip: Trip = {
    id: generateId("trip"),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    name: input.name.trim(),
    destination: input.destination.trim(),
    country: input.country.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    travelerCount: input.travelerCount,
    roomCount: input.roomCount,
    status: "planning",
    notes: input.notes?.trim() || undefined,
  };

  await withWriteTransaction(["trips", "changeLog"], async (tx) => {
    await tx.objectStore("trips").add(trip);
    await tx
      .objectStore("changeLog")
      .add(buildChangeLogEntry({ tripId: trip.id, entityType: "trips", entityId: trip.id, action: "create", after: trip }));
  });

  return trip;
}

export interface TripUpdateInput extends Partial<TripInput> {
  status?: TripStatus;
}

/**
 * `expectedRevision` is the revision the caller last read. If the stored
 * record has since moved on (another tab, another device, a later
 * phase's AI proposal applied in the meantime), this throws
 * StaleRevisionError instead of silently clobbering the newer data — the
 * core data-integrity rule from the master prompt, enforced here rather
 * than trusted to every call site.
 */
export async function updateTrip(id: string, patch: TripUpdateInput, expectedRevision: number): Promise<Trip> {
  return withWriteTransaction(["trips", "changeLog"], async (tx) => {
    const store = tx.objectStore("trips");
    const existing = await store.get(id);
    if (!existing) throw new NotFoundError("Trip", id);
    if (existing.revision !== expectedRevision) throw new StaleRevisionError("Trip", id);

    const merged: TripInput = {
      name: patch.name ?? existing.name,
      destination: patch.destination ?? existing.destination,
      country: patch.country ?? existing.country,
      startDate: patch.startDate ?? existing.startDate,
      endDate: patch.endDate ?? existing.endDate,
      travelerCount: patch.travelerCount ?? existing.travelerCount,
      roomCount: patch.roomCount ?? existing.roomCount,
      notes: patch.notes ?? existing.notes,
    };
    const errors = validateTripInput(merged);
    if (hasErrors(errors)) throw new ValidationError(errors);

    const updated: Trip = {
      ...existing,
      ...merged,
      name: merged.name.trim(),
      destination: merged.destination.trim(),
      country: merged.country.trim(),
      notes: merged.notes?.trim() || undefined,
      status: patch.status ?? existing.status,
      revision: existing.revision + 1,
      updatedAt: nowIso(),
    };

    await store.put(updated);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId: id,
        entityType: "trips",
        entityId: id,
        action: "update",
        before: existing,
        after: updated,
      }),
    );
    return updated;
  });
}

export async function archiveTrip(id: string, expectedRevision: number): Promise<Trip> {
  return updateTrip(id, { status: "archived" }, expectedRevision);
}

/** Reverts to "planning" regardless of what the status was before it was
 * archived — Phase 2 doesn't track pre-archive status history. */
export async function unarchiveTrip(id: string, expectedRevision: number): Promise<Trip> {
  return updateTrip(id, { status: "planning" }, expectedRevision);
}

/**
 * Creates an independent copy of a trip (and its override, if one exists)
 * with fresh IDs. `structuredClone` is used even though `db.get` already
 * returns a deserialized (non-aliased) object, as explicit, future-proof
 * protection against ever sharing nested array/object references between
 * the original and the copy — the exact bug class the "no leakage between
 * trips" requirement is guarding against.
 */
export async function duplicateTrip(id: string): Promise<Trip> {
  const db = getReadyDb();
  const original = await db.get("trips", id);
  if (!original) throw new NotFoundError("Trip", id);
  const originalOverride = await db.getFromIndex("tripOverrides", "by-trip", id);

  const now = nowIso();
  const newTrip: Trip = {
    ...structuredClone(original),
    id: generateId("trip"),
    name: `${original.name} (Copy)`,
    status: "planning",
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };

  await withWriteTransaction(["trips", "tripOverrides", "changeLog"], async (tx) => {
    await tx.objectStore("trips").add(newTrip);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({ tripId: newTrip.id, entityType: "trips", entityId: newTrip.id, action: "create", after: newTrip }),
    );

    if (originalOverride) {
      const newOverride: TripOverride = {
        ...structuredClone(originalOverride),
        id: generateId("override"),
        tripId: newTrip.id,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      await tx.objectStore("tripOverrides").add(newOverride);
      await tx.objectStore("changeLog").add(
        buildChangeLogEntry({
          tripId: newTrip.id,
          entityType: "tripOverrides",
          entityId: newOverride.id,
          action: "create",
          after: newOverride,
        }),
      );
    }
  });

  return newTrip;
}
