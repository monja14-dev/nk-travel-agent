/**
 * Pure time/duration math for a single ItineraryItem — no DB access, no
 * knowledge of other items. modules/itinerary/timeline.ts builds on top
 * of this for whole-day, sequence-aware calculations (conflict
 * detection); this file only ever reasons about one item's own
 * start/end/crossesMidnight.
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parses a strict 24h "HH:MM" string into minutes since 00:00, or
 * `undefined` if it isn't well-formed — never throws, since this is
 * called from both validation (which wants a boolean) and display code
 * (which wants to degrade gracefully). */
export function parseTimeToMinutes(time: string): number | undefined {
  const match = TIME_RE.exec(time);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTimeString(time: string): boolean {
  return parseTimeToMinutes(time) !== undefined;
}

/**
 * This item's own duration, given its own start/end/crossesMidnight —
 * `undefined` when either time is missing (never invented) or malformed.
 * `crossesMidnight` is trusted as-is: if true, the end is always treated
 * as being on the day after the start, regardless of how the raw
 * HH:MM values compare; if false, a stored end-before-start combination
 * is a data inconsistency this function won't silently "fix" — it
 * returns undefined, and modules/itinerary/validation.ts is what
 * surfaces that as a field error instead of a wrong number.
 */
export function computeDurationMinutes(
  startTime: string | undefined,
  endTime: string | undefined,
  crossesMidnight: boolean,
): number | undefined {
  if (!startTime || !endTime) return undefined;
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === undefined || end === undefined) return undefined;

  if (crossesMidnight) {
    return 24 * 60 - start + end;
  }
  if (end < start) return undefined; // inconsistent — not crossesMidnight, yet end precedes start
  return end - start;
}

/** True exactly when the stored start/end/crossesMidnight combination is
 * internally consistent enough to compute a duration from — i.e. either
 * time is missing (nothing to check), or `computeDurationMinutes` above
 * can resolve a real number. Used by validation to reject the one
 * combination that's definitely wrong (end before start without the
 * flag) without rejecting the common, legitimate "times not entered
 * yet" case. */
export function isTimeRangeConsistent(
  startTime: string | undefined,
  endTime: string | undefined,
  crossesMidnight: boolean,
): boolean {
  if (!startTime || !endTime) return true;
  return computeDurationMinutes(startTime, endTime, crossesMidnight) !== undefined;
}

/** "4h 4m" / "45m" / "0m" — for display and for the XLSX export, which
 * wants a human string rather than a raw minute count in the detailed
 * itinerary sheet (matching the baseline workbook's "Duration (Hrs &
 * Mins)" column). */
export function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}
