import { parseTimeToMinutes } from "./dateMath";

/**
 * Whole-day, sequence-aware timeline reconstruction and schedule-conflict
 * detection. Builds on dateMath.ts's single-item math by walking a day's
 * items in `order`, applying each item's own `crossesMidnight` (this
 * item's end is the day after its own start) and `newCalendarDay` (this
 * item's start is the day after the *previous* item's — see schema.ts's
 * comment on ItineraryItem.newCalendarDay for why that's a second,
 * independent, explicit flag rather than inferred from comparing
 * wall-clock times). Nothing here infers a day rollover from the clock
 * values themselves — only the two stored flags move the running day
 * offset — so a genuine same-day scheduling overlap is never mistaken
 * for a midnight crossing, and vice versa.
 */

export interface TimelineInputItem {
  id: string;
  order: number;
  startTime?: string;
  endTime?: string;
  crossesMidnight: boolean;
  newCalendarDay: boolean;
}

export interface TimelineEntry {
  id: string;
  /** Minutes since the day bucket's nominal 00:00. Can exceed 1440 once
   * a `newCalendarDay`/`crossesMidnight` rollover has occurred. */
  absStartMinutes: number;
  /** Equal to absStartMinutes when no end time is recorded — never
   * invented, so a timeless item occupies a zero-width window and can
   * never register as "conflicting" with anything. */
  absEndMinutes: number;
  hasEnd: boolean;
}

/** Builds the absolute timeline for one day's items, already sorted by
 * `order` internally (callers don't need to pre-sort). Items with no
 * `startTime` are skipped entirely — there's nothing to place them at. */
export function buildDayTimeline(items: TimelineInputItem[]): TimelineEntry[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  let dayBase = 0;
  const entries: TimelineEntry[] = [];

  for (const item of sorted) {
    if (item.newCalendarDay) dayBase += 1440;
    if (!item.startTime) continue;
    const startOfDay = parseTimeToMinutes(item.startTime);
    if (startOfDay === undefined) continue;

    const absStartMinutes = dayBase + startOfDay;
    if (!item.endTime) {
      entries.push({ id: item.id, absStartMinutes, absEndMinutes: absStartMinutes, hasEnd: false });
      continue;
    }
    const endOfDay = parseTimeToMinutes(item.endTime);
    if (endOfDay === undefined) {
      entries.push({ id: item.id, absStartMinutes, absEndMinutes: absStartMinutes, hasEnd: false });
      continue;
    }
    const absEndMinutes = dayBase + (item.crossesMidnight ? 1440 : 0) + endOfDay;
    entries.push({ id: item.id, absStartMinutes, absEndMinutes, hasEnd: true });
  }

  return entries;
}

export interface ScheduleConflict {
  aId: string;
  bId: string;
  /** How many minutes the two windows overlap by — always > 0. */
  overlapMinutes: number;
}

/** All pairs of items in the same day whose windows genuinely overlap.
 * Items with no usable end time never participate (a zero-width window
 * can't overlap anything) — consistent with "never invent" applied to
 * conflict detection: an item with unknown duration isn't assumed to
 * conflict with anything just because its start happens to fall inside
 * another item's window. */
export function detectScheduleConflicts(items: TimelineInputItem[]): ScheduleConflict[] {
  const entries = buildDayTimeline(items).filter((e) => e.hasEnd && e.absEndMinutes > e.absStartMinutes);
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const overlapStart = Math.max(a.absStartMinutes, b.absStartMinutes);
      const overlapEnd = Math.min(a.absEndMinutes, b.absEndMinutes);
      if (overlapEnd > overlapStart) {
        conflicts.push({ aId: a.id, bId: b.id, overlapMinutes: overlapEnd - overlapStart });
      }
    }
  }

  return conflicts;
}
