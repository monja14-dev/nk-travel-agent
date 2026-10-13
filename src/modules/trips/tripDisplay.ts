import type { Trip } from "../../db/schema";
import { formatDateRange, formatMoney } from "../../lib/format";
import type { TripSummary, TripTiming } from "./tripSummary";

/**
 * Phase 7 (UI): display-text helpers shared by the Dashboard and the trip
 * workspace, so a trip reads identically on both. Pure — no DB access —
 * and every string is derived from real counts; nothing is a placeholder.
 */

export function timingLabel(timing: TripTiming): string | null {
  switch (timing.kind) {
    case "upcoming":
      return timing.daysUntil === 1 ? "Starts tomorrow" : `Starts in ${timing.daysUntil} days`;
    case "in-progress":
      return `Day ${timing.day} of ${timing.of}`;
    case "ended":
      return timing.daysAgo === 1 ? "Ended yesterday" : `Ended ${timing.daysAgo} days ago`;
    case "unknown":
      return null;
  }
}

export function tripMeta(trip: Trip): string {
  const parts = [
    formatDateRange(trip.startDate, trip.endDate),
    `${trip.travelerCount} traveler${trip.travelerCount === 1 ? "" : "s"}`,
  ];
  if (trip.roomCount) parts.push(`${trip.roomCount} room${trip.roomCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function itineraryCaption(s: TripSummary): string {
  if (s.activityCount === 0) return "No activities yet";
  return `${s.daysPlanned} of ${s.tripDays} days · ${s.activityCount} activities`;
}

export function bookingsCaption(s: TripSummary): string {
  return s.bookings.total === 0 ? "None tracked yet" : `${s.bookings.confirmed} of ${s.bookings.total} confirmed`;
}

export function remindersCaption(s: TripSummary): string {
  return s.reminders.total === 0 ? "None yet" : `${s.reminders.checked} of ${s.reminders.total} done`;
}

/** Budget line for the first currency (the rest are counted, not summed —
 * different currencies are never added together). Spent is only what has
 * actually been logged; unlogged expenses are called out, not guessed. */
export function budgetDisplay(budget: TripSummary["budget"]): {
  caption: string;
  fraction: number;
  tone: "accent" | "warning";
} {
  if (budget.length === 0) return { caption: "No expenses yet", fraction: 0, tone: "accent" };
  const [first, ...rest] = budget;
  const unlogged = first.missingActualCount > 0 ? ` · ${first.missingActualCount} unlogged` : "";
  const more = rest.length > 0 ? ` · +${rest.length} more currenc${rest.length === 1 ? "y" : "ies"}` : "";
  return {
    caption: `${formatMoney(first.totalActualKnown, first.currency)} of ${formatMoney(first.totalPlanned, first.currency)}${unlogged}${more}`,
    fraction: first.totalPlanned > 0 ? first.totalActualKnown / first.totalPlanned : 0,
    tone: first.totalActualKnown > first.totalPlanned ? "warning" : "accent",
  };
}
