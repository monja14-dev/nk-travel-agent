/**
 * Phase 7 (UI): consistent money / date formatting for the redesign
 * (spec §2: "consistent number, currency, date, and time formatting").
 * Pure functions, no DB access.
 */

/** Formats an amount in its own currency. Falls back to "1,234 XYZ" if the
 * currency code isn't one Intl recognizes (the schema stores currency as
 * free text, so a typo'd code must degrade, not throw during render).
 * Whole units by default (dashboard totals); pass `maxFractionDigits: 2`
 * for per-item prices like a 12.50 fare, which must not round to 13. */
export function formatMoney(amount: number, currency: string, maxFractionDigits = 0): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      // Both set: older engines throw a RangeError if only the max is
      // lowered below the currency's default minimum (2 for USD/PHP).
      // Whole amounts stay "$12"; fractional ones get a consistent "$12.50".
      minimumFractionDigits: Number.isInteger(amount) ? 0 : maxFractionDigits,
      maximumFractionDigits: maxFractionDigits,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits })} ${currency}`;
  }
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "YYYY-MM-DD" as a UTC midnight Date (never local time, so a
 * trip date can't shift a day depending on the viewer's timezone).
 * Returns null for anything that isn't a real calendar date. */
export function parseISODate(value: string): Date | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // Reject overflow like 2027-02-31 (which Date.UTC silently rolls over).
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

/** Whole days from `start` to `end` counting both endpoints (a trip from
 * the 22nd to the 26th is 5 days). Returns 0 if either date is invalid or
 * end is before start. */
export function daysInclusive(start: string, end: string): number {
  const s = parseISODate(start);
  const e = parseISODate(end);
  if (!s || !e || e < s) return 0;
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

/** Whole days from `fromISO` to `toISO` (negative if `toISO` is earlier).
 * Returns null if either is invalid. */
export function daysBetween(fromISO: string, toISO: string): number | null {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "22–26 Feb 2027", "28 Feb – 3 Mar 2027", or "28 Dec 2026 – 2 Jan 2027".
 * Falls back to the raw strings if either date is unparseable, so bad
 * data is visible rather than silently blank. */
export function formatDateRange(start: string, end: string): string {
  const s = parseISODate(start);
  const e = parseISODate(end);
  if (!s || !e) return `${start} to ${end}`;

  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sm = MONTHS[s.getUTCMonth()];
  const em = MONTHS[e.getUTCMonth()];
  const sy = s.getUTCFullYear();
  const ey = e.getUTCFullYear();

  if (sy === ey && s.getUTCMonth() === e.getUTCMonth()) {
    return sd === ed ? `${sd} ${sm} ${sy}` : `${sd}–${ed} ${sm} ${sy}`;
  }
  if (sy === ey) return `${sd} ${sm} – ${ed} ${em} ${sy}`;
  return `${sd} ${sm} ${sy} – ${ed} ${em} ${ey}`;
}

/** Today's date as local-calendar "YYYY-MM-DD" (what the traveler's wall
 * calendar says, not UTC — a trip starting "tomorrow" should read as
 * tomorrow in the traveler's own timezone). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
