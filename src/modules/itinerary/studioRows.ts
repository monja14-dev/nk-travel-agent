import type {
  BookingStatus,
  ItineraryDay,
  ItineraryItem,
  ItineraryItemCategory,
  ResearchVerificationStatus,
} from "../../db/schema";
import { formatMoney } from "../../lib/format";
import { safeHttpUrl } from "../../lib/url";
import { getDisplayVerificationStatus } from "../research/verification";
import { computeDurationMinutes, formatDurationMinutes } from "./dateMath";
import { detectScheduleConflicts } from "./timeline";

/**
 * Phase 7 (UI): the Itinerary Studio's read model. Turns saved days +
 * items into display rows for the spreadsheet-style view (columns follow
 * the Taiwan_041026 workbook: date/day, start/end/duration, activity,
 * category, address, transport, travel time, fare, cost, booking status,
 * opening hours, comments, source + verification, actual status).
 *
 * Pure: no DB access, and nothing here writes back — the studio edits
 * through the same repositories as before. Missing values stay null so
 * the UI shows "—", never an invented number.
 */

export { safeHttpUrl };

export const OUTSIDE_TRIP_DATES_LABEL = "Outside trip dates";

export interface StudioSource {
  label: string;
  /** Only http(s) URLs are ever exposed as a link. */
  href: string | null;
  /** Verification status as of now (a stored "verified" older than 30 days
   * reads "stale" — same rule the research modules use). */
  status: ResearchVerificationStatus;
}

export interface StudioRow {
  itemId: string;
  dayId: string;
  /** ISO date, or "" for an item whose day is outside the trip's dates. */
  date: string;
  dayLabel: string;
  start: string | null;
  end: string | null;
  /** This item's own end falls on the next calendar day. */
  endNextDay: boolean;
  /** This item starts on the calendar day after the previous item. */
  startsNextDay: boolean;
  duration: string | null;
  title: string;
  category: ItineraryItemCategory;
  address: string | null;
  mapsUrl: string | null;
  transport: string | null;
  travelTime: string | null;
  farePlanned: string | null;
  fareActual: string | null;
  costPlanned: string | null;
  costActual: string | null;
  bookingStatus: BookingStatus;
  openingHours: string | null;
  comments: string | null;
  source: StudioSource | null;
  actualStatus: string | null;
  /** Overlaps another item's time window in the same day. */
  conflict: boolean;
  /** False when the item's day isn't one of the trip's days. */
  onTripDay: boolean;
}

/** A search link for an address — an integration point, not an embedded
 * map: nothing is sent anywhere until the person clicks it, and no API
 * key is involved. */
export function mapsSearchUrl(address: string): string | null {
  const q = address.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function money(amount: number | undefined, currency: string | undefined): string | null {
  if (amount === undefined) return null;
  return currency ? formatMoney(amount, currency, 2) : amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** One row per item: days in date order, items in their saved `order`.
 * Items whose day isn't among `days` (e.g. the trip's dates were edited
 * afterwards) are kept — listed last under "Outside trip dates" — rather
 * than silently dropped. */
export function buildStudioRows(days: ItineraryDay[], items: ItineraryItem[], now: Date = new Date()): StudioRow[] {
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const dayIds = new Set(sortedDays.map((d) => d.id));

  const byDay = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    const bucket = byDay.get(item.dayId) ?? [];
    bucket.push(item);
    byDay.set(item.dayId, bucket);
  }
  for (const bucket of byDay.values()) bucket.sort((a, b) => a.order - b.order);

  const rows: StudioRow[] = [];

  const toRow = (item: ItineraryItem, date: string, dayLabel: string, onTripDay: boolean, conflicting: Set<string>): StudioRow => {
    const durationMinutes =
      item.durationMinutes ?? computeDurationMinutes(item.startTime, item.endTime, item.crossesMidnight);
    const attribution = item.attribution;
    return {
      itemId: item.id,
      dayId: item.dayId,
      date,
      dayLabel,
      start: item.startTime ?? null,
      end: item.endTime ?? null,
      endNextDay: item.crossesMidnight,
      startsNextDay: item.newCalendarDay,
      duration: durationMinutes === undefined ? null : formatDurationMinutes(durationMinutes),
      title: item.title,
      category: item.category,
      address: orNull(item.address),
      mapsUrl: item.address ? mapsSearchUrl(item.address) : null,
      transport: orNull(item.transportNotes),
      travelTime: item.travelTimeMinutes === undefined ? null : formatDurationMinutes(item.travelTimeMinutes),
      farePlanned: money(item.farePlanned, item.currency),
      fareActual: money(item.fareActual, item.currency),
      costPlanned: money(item.activityCostPlanned, item.currency),
      costActual: money(item.activityCostActual, item.currency),
      bookingStatus: item.bookingStatus,
      openingHours: orNull(item.openingHours),
      comments: orNull(item.comments),
      source: attribution
        ? {
            label: attribution.sourceLabel,
            href: safeHttpUrl(attribution.sourceUrl),
            status: getDisplayVerificationStatus(attribution, now),
          }
        : null,
      actualStatus: item.actualStatus ?? null,
      conflict: conflicting.has(item.id),
      onTripDay,
    };
  };

  for (const day of sortedDays) {
    const dayItems = byDay.get(day.id) ?? [];
    const conflicting = new Set(detectScheduleConflicts(dayItems).flatMap((c) => [c.aId, c.bId]));
    for (const item of dayItems) rows.push(toRow(item, day.date, day.dayLabel, true, conflicting));
  }

  for (const [dayId, dayItems] of byDay) {
    if (dayIds.has(dayId)) continue;
    const conflicting = new Set(detectScheduleConflicts(dayItems).flatMap((c) => [c.aId, c.bId]));
    for (const item of dayItems) rows.push(toRow(item, "", OUTSIDE_TRIP_DATES_LABEL, false, conflicting));
  }

  return rows;
}

export interface StudioSummary {
  dayCount: number;
  /** Trip days with at least one activity. */
  daysPlanned: number;
  activityCount: number;
  /** Explicitly marked done — never inferred from dates. */
  doneCount: number;
  /** Overlapping pairs across all days. */
  conflictPairs: number;
  /** Activities with no start time (they sit in the plan but aren't on the clock). */
  untimedCount: number;
  /** Activities attached to a day outside the trip's dates. */
  outsideTripCount: number;
}

export function summarizeStudio(days: ItineraryDay[], items: ItineraryItem[]): StudioSummary {
  const dayIds = new Set(days.map((d) => d.id));
  const byDay = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    const bucket = byDay.get(item.dayId) ?? [];
    bucket.push(item);
    byDay.set(item.dayId, bucket);
  }

  let conflictPairs = 0;
  let daysPlanned = 0;
  for (const [dayId, dayItems] of byDay) {
    conflictPairs += detectScheduleConflicts(dayItems).length;
    if (dayIds.has(dayId)) daysPlanned += 1;
  }

  return {
    dayCount: days.length,
    daysPlanned,
    activityCount: items.length,
    doneCount: items.filter((i) => i.actualStatus === "done").length,
    conflictPairs,
    untimedCount: items.filter((i) => !i.startTime).length,
    outsideTripCount: items.filter((i) => !dayIds.has(i.dayId)).length,
  };
}
