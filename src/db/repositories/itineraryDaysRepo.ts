import { getReadyDb, withWriteTransaction } from "../client";
import type { ItineraryDay } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../lib/errors";
import { validateItineraryDayInput, hasErrors, type ItineraryDayInput } from "../../modules/itinerary/validation";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function listDaysForTrip(tripId: string): Promise<ItineraryDay[]> {
  const days = await getReadyDb().getAllFromIndex("itineraryDays", "by-trip", tripId);
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getDay(id: string): Promise<ItineraryDay | undefined> {
  return getReadyDb().get("itineraryDays", id);
}

/** All calendar dates from `start` to `end` inclusive, "YYYY-MM-DD". */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

/**
 * Idempotently makes sure every calendar date in [startDate, endDate] has
 * an `ItineraryDay` for this trip, then returns the full, sorted list.
 * This is how the detailed itinerary screen bootstraps itself from a
 * trip's own date range — the AI and the person only ever upsert items
 * *within* an existing day; neither ever needs to propose creating a day,
 * which keeps the AI-proposal surface (modules/ai) smaller and simpler.
 * Safe to call on every screen load: dates that already have a day are
 * left completely untouched (not even their revision bumps).
 */
export async function ensureDaysForTripRange(
  tripId: string,
  startDate: string,
  endDate: string,
): Promise<ItineraryDay[]> {
  const wanted = dateRange(startDate, endDate);
  await withWriteTransaction(["itineraryDays", "changeLog"], async (tx) => {
    const store = tx.objectStore("itineraryDays");
    const index = store.index("by-trip-date");
    const now = nowIso();
    for (let i = 0; i < wanted.length; i++) {
      const date = wanted[i];
      const existing = await index.get([tripId, date]);
      if (existing) continue;
      const day: ItineraryDay = {
        id: generateId("day"),
        tripId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        date,
        dayLabel: `Day ${i + 1}`,
      };
      await store.add(day);
      await tx
        .objectStore("changeLog")
        .add(buildChangeLogEntry({ tripId, entityType: "itineraryDays", entityId: day.id, action: "create", after: day }));
    }
  });
  return listDaysForTrip(tripId);
}

export type ItineraryDayUpdateInput = Partial<Pick<ItineraryDayInput, "dayLabel" | "summary" | "remarks">>;

export async function updateDay(
  id: string,
  patch: ItineraryDayUpdateInput,
  expectedRevision: number,
): Promise<ItineraryDay> {
  return withWriteTransaction(["itineraryDays", "changeLog"], async (tx) => {
    const store = tx.objectStore("itineraryDays");
    const existing = await store.get(id);
    if (!existing) throw new NotFoundError("Itinerary day", id);
    if (existing.revision !== expectedRevision) throw new StaleRevisionError("Itinerary day", id);

    const merged: ItineraryDayInput = {
      date: existing.date,
      dayLabel: patch.dayLabel ?? existing.dayLabel,
      summary: patch.summary ?? existing.summary,
      remarks: patch.remarks ?? existing.remarks,
    };
    const errors = validateItineraryDayInput(merged);
    if (hasErrors(errors)) throw new ValidationError(errors);

    const updated: ItineraryDay = {
      ...existing,
      dayLabel: merged.dayLabel.trim(),
      summary: merged.summary?.trim() || undefined,
      remarks: merged.remarks?.trim() || undefined,
      revision: existing.revision + 1,
      updatedAt: nowIso(),
    };
    await store.put(updated);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId: existing.tripId,
        entityType: "itineraryDays",
        entityId: id,
        action: "update",
        before: existing,
        after: updated,
      }),
    );
    return updated;
  });
}
