import type { Booking, Expense, ItineraryItem, Reminder, Trip } from "../../db/schema";
import { listBookingsForTrip } from "../../db/repositories/bookingsRepo";
import { listExpensesForTrip } from "../../db/repositories/expensesRepo";
import { listItemsForTrip } from "../../db/repositories/itineraryItemsRepo";
import { listRemindersForTrip } from "../../db/repositories/remindersRepo";
import { computeBudgetTotals, type CurrencyBudgetTotals } from "../budget/budgetMath";
import { daysBetween, daysInclusive } from "../../lib/format";

/**
 * Phase 7 (UI): real, derived dashboard metrics for one trip. Everything
 * here is computed from saved records (spec §4: "every displayed metric
 * must come from actual application data") — nothing is estimated or
 * defaulted to look healthy. A trip with no itinerary items reports 0
 * planned days, not a made-up percentage.
 *
 * `summarizeTrip` is pure (records in, numbers out) so it's unit tested
 * without IndexedDB; `loadTripSummary` is the thin async wrapper that
 * reads the five record types through the existing repositories — no new
 * queries, no schema change.
 */

export interface TripSummary {
  tripId: string;
  /** Calendar days the trip spans (start..end inclusive); 0 if the dates are invalid. */
  tripDays: number;
  /** How many distinct itinerary days have at least one activity. */
  daysPlanned: number;
  activityCount: number;
  /** Activities explicitly marked actualStatus "done" — never inferred from dates. */
  activitiesDone: number;
  bookings: { total: number; confirmed: number; pending: number; notBooked: number; cancelled: number };
  reminders: { total: number; checked: number };
  budget: CurrencyBudgetTotals[];
}

export function summarizeTrip(
  trip: Trip,
  items: ItineraryItem[],
  bookings: Booking[],
  reminders: Reminder[],
  expenses: Expense[],
): TripSummary {
  return {
    tripId: trip.id,
    tripDays: daysInclusive(trip.startDate, trip.endDate),
    daysPlanned: new Set(items.map((i) => i.dayId)).size,
    activityCount: items.length,
    activitiesDone: items.filter((i) => i.actualStatus === "done").length,
    bookings: {
      total: bookings.length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      pending: bookings.filter((b) => b.status === "pending").length,
      notBooked: bookings.filter((b) => b.status === "not_booked").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
    },
    reminders: { total: reminders.length, checked: reminders.filter((r) => r.checked).length },
    budget: computeBudgetTotals(expenses, trip.travelerCount),
  };
}

export async function loadTripSummary(trip: Trip): Promise<TripSummary> {
  const [items, bookings, reminders, expenses] = await Promise.all([
    listItemsForTrip(trip.id),
    listBookingsForTrip(trip.id),
    listRemindersForTrip(trip.id),
    listExpensesForTrip(trip.id),
  ]);
  return summarizeTrip(trip, items, bookings, reminders, expenses);
}

export type TripTiming =
  | { kind: "upcoming"; daysUntil: number }
  | { kind: "in-progress"; day: number; of: number }
  | { kind: "ended"; daysAgo: number }
  | { kind: "unknown" };

/** Where "today" falls relative to the trip's own dates. Purely
 * date-based; it does not read or change the trip's stored `status`. */
export function tripTiming(trip: Trip, today: string): TripTiming {
  const untilStart = daysBetween(today, trip.startDate);
  const sinceEnd = daysBetween(trip.endDate, today);
  const total = daysInclusive(trip.startDate, trip.endDate);
  if (untilStart === null || sinceEnd === null || total === 0) return { kind: "unknown" };
  if (untilStart > 0) return { kind: "upcoming", daysUntil: untilStart };
  if (sinceEnd > 0) return { kind: "ended", daysAgo: sinceEnd };
  return { kind: "in-progress", day: -untilStart + 1, of: total };
}

/** Dashboard ordering: trips happening now, then upcoming (soonest
 * first), then past trips (most recent first), then ones with unreadable
 * dates last. Stable for ties. Does not mutate the input. */
export function sortTripsForDashboard(trips: Trip[], today: string): Trip[] {
  const rank = (t: Trip): [number, number] => {
    const timing = tripTiming(t, today);
    switch (timing.kind) {
      case "in-progress":
        return [0, 0];
      case "upcoming":
        return [1, timing.daysUntil];
      case "ended":
        return [2, timing.daysAgo];
      case "unknown":
        return [3, 0];
    }
  };
  return trips
    .map((trip, index) => ({ trip, index, r: rank(trip) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.index - b.index)
    .map((x) => x.trip);
}
