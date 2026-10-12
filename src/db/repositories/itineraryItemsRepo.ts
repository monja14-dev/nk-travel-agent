import { getReadyDb, withWriteTransaction } from "../client";
import type { ItineraryItem } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../lib/errors";
import { validateItineraryItemInput, hasErrors, type ItineraryItemInput } from "../../modules/itinerary/validation";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function listItemsForDay(dayId: string): Promise<ItineraryItem[]> {
  const items = await getReadyDb().getAllFromIndex("itineraryItems", "by-day", dayId);
  return [...items].sort((a, b) => a.order - b.order);
}

export async function listItemsForTrip(tripId: string): Promise<ItineraryItem[]> {
  return getReadyDb().getAllFromIndex("itineraryItems", "by-trip", tripId);
}

export async function getItem(id: string): Promise<ItineraryItem | undefined> {
  return getReadyDb().get("itineraryItems", id);
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toRecord(
  tripId: string,
  dayId: string,
  id: string,
  revision: number,
  createdAt: string,
  updatedAt: string,
  input: ItineraryItemInput,
): ItineraryItem {
  return {
    id,
    tripId,
    dayId,
    revision,
    createdAt,
    updatedAt,
    order: input.order,
    startTime: input.startTime,
    endTime: input.endTime,
    crossesMidnight: input.crossesMidnight,
    newCalendarDay: input.newCalendarDay,
    durationMinutes: input.durationMinutes,
    travelTimeMinutes: input.travelTimeMinutes,
    category: input.category,
    title: input.title.trim(),
    description: trimOrUndefined(input.description),
    address: trimOrUndefined(input.address),
    transportNotes: trimOrUndefined(input.transportNotes),
    openingHours: trimOrUndefined(input.openingHours),
    bookingStatus: input.bookingStatus,
    farePlanned: input.farePlanned,
    fareActual: input.fareActual,
    activityCostPlanned: input.activityCostPlanned,
    activityCostActual: input.activityCostActual,
    currency: trimOrUndefined(input.currency),
    attribution: input.attribution
      ? {
          sourceLabel: input.attribution.sourceLabel.trim(),
          sourceUrl: trimOrUndefined(input.attribution.sourceUrl),
          retrievedAt: input.attribution.retrievedAt,
          verificationStatus: input.attribution.verificationStatus,
        }
      : undefined,
    comments: trimOrUndefined(input.comments),
    actualStatus: input.actualStatus,
  };
}

export async function createItem(tripId: string, dayId: string, input: ItineraryItemInput): Promise<ItineraryItem> {
  const errors = validateItineraryItemInput(input);
  if (hasErrors(errors)) throw new ValidationError(errors);

  return withWriteTransaction(["itineraryItems", "itineraryDays", "changeLog"], async (tx) => {
    const day = await tx.objectStore("itineraryDays").get(dayId);
    if (!day || day.tripId !== tripId) throw new NotFoundError("Itinerary day", dayId);

    const now = nowIso();
    const id = generateId("item");
    const item = toRecord(tripId, dayId, id, 1, now, now, input);

    await tx.objectStore("itineraryItems").add(item);
    await tx
      .objectStore("changeLog")
      .add(buildChangeLogEntry({ tripId, entityType: "itineraryItems", entityId: id, action: "create", after: item }));
    return item;
  });
}

export async function updateItem(
  id: string,
  patch: Partial<ItineraryItemInput>,
  expectedRevision: number,
): Promise<ItineraryItem> {
  return withWriteTransaction(["itineraryItems", "changeLog"], async (tx) => {
    const store = tx.objectStore("itineraryItems");
    const existing = await store.get(id);
    if (!existing) throw new NotFoundError("Itinerary item", id);
    if (existing.revision !== expectedRevision) throw new StaleRevisionError("Itinerary item", id);

    const merged: ItineraryItemInput = {
      order: patch.order ?? existing.order,
      startTime: "startTime" in patch ? patch.startTime : existing.startTime,
      endTime: "endTime" in patch ? patch.endTime : existing.endTime,
      crossesMidnight: patch.crossesMidnight ?? existing.crossesMidnight,
      newCalendarDay: patch.newCalendarDay ?? existing.newCalendarDay,
      durationMinutes: "durationMinutes" in patch ? patch.durationMinutes : existing.durationMinutes,
      travelTimeMinutes: "travelTimeMinutes" in patch ? patch.travelTimeMinutes : existing.travelTimeMinutes,
      category: patch.category ?? existing.category,
      title: patch.title ?? existing.title,
      description: "description" in patch ? patch.description : existing.description,
      address: "address" in patch ? patch.address : existing.address,
      transportNotes: "transportNotes" in patch ? patch.transportNotes : existing.transportNotes,
      openingHours: "openingHours" in patch ? patch.openingHours : existing.openingHours,
      bookingStatus: patch.bookingStatus ?? existing.bookingStatus,
      farePlanned: "farePlanned" in patch ? patch.farePlanned : existing.farePlanned,
      fareActual: "fareActual" in patch ? patch.fareActual : existing.fareActual,
      activityCostPlanned: "activityCostPlanned" in patch ? patch.activityCostPlanned : existing.activityCostPlanned,
      activityCostActual: "activityCostActual" in patch ? patch.activityCostActual : existing.activityCostActual,
      currency: "currency" in patch ? patch.currency : existing.currency,
      attribution: "attribution" in patch ? patch.attribution : existing.attribution,
      comments: "comments" in patch ? patch.comments : existing.comments,
      actualStatus: "actualStatus" in patch ? patch.actualStatus : existing.actualStatus,
    };
    const errors = validateItineraryItemInput(merged);
    if (hasErrors(errors)) throw new ValidationError(errors);

    const now = nowIso();
    const updated = toRecord(existing.tripId, existing.dayId, id, existing.revision + 1, existing.createdAt, now, merged);

    await store.put(updated);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId: existing.tripId,
        entityType: "itineraryItems",
        entityId: id,
        action: "update",
        before: existing,
        after: updated,
      }),
    );
    return updated;
  });
}

/** Idempotent — silently no-ops on an already-gone id, matching every
 * other delete in this app (Phase 2's clearOverrideForTrip, Phase 4's
 * accommodation/food result deletes). */
export async function deleteItem(id: string): Promise<void> {
  await withWriteTransaction(["itineraryItems", "changeLog"], async (tx) => {
    const store = tx.objectStore("itineraryItems");
    const existing = await store.get(id);
    if (!existing) return;
    await store.delete(id);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId: existing.tripId,
        entityType: "itineraryItems",
        entityId: id,
        action: "delete",
        before: existing,
      }),
    );
  });
}

/**
 * Manual reordering: `orderedIds` must be exactly the current set of
 * item ids for `dayId` (same members, any order) — a mismatch (an id
 * that's since been deleted, or one left out) throws rather than
 * silently reassigning `order` around a stale snapshot, since that could
 * duplicate an order value or lose an item from the sequence entirely.
 * Each item's `order` becomes its index in `orderedIds`; only items
 * whose order actually changes are written (and revision-bumped).
 */
export async function reorderItems(dayId: string, orderedIds: string[]): Promise<ItineraryItem[]> {
  return withWriteTransaction(["itineraryItems", "changeLog"], async (tx) => {
    const store = tx.objectStore("itineraryItems");
    const current = await store.index("by-day").getAll(dayId);

    const currentIds = new Set(current.map((i) => i.id));
    const orderedSet = new Set(orderedIds);
    if (currentIds.size !== orderedSet.size || [...currentIds].some((id) => !orderedSet.has(id))) {
      throw new ValidationError({
        orderedIds: "The item list has changed since it was loaded — reload and try reordering again.",
      });
    }

    const now = nowIso();
    const byId = new Map(current.map((i) => [i.id, i]));
    const updated: ItineraryItem[] = [];
    for (let index = 0; index < orderedIds.length; index++) {
      const existing = byId.get(orderedIds[index])!;
      if (existing.order === index) {
        updated.push(existing);
        continue;
      }
      const next: ItineraryItem = { ...existing, order: index, revision: existing.revision + 1, updatedAt: now };
      await store.put(next);
      await tx.objectStore("changeLog").add(
        buildChangeLogEntry({
          tripId: existing.tripId,
          entityType: "itineraryItems",
          entityId: existing.id,
          action: "update",
          before: existing,
          after: next,
        }),
      );
      updated.push(next);
    }
    return updated;
  });
}
