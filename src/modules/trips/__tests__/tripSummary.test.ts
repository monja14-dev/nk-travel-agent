import { describe, expect, it } from "vitest";
import type { Booking, Expense, ItineraryItem, Reminder, Trip } from "../../../db/schema";
import { sortTripsForDashboard, summarizeTrip, tripTiming } from "../tripSummary";

// Minimal fixtures: only the fields these pure functions read. Cast
// through unknown so the tests don't have to restate every BaseRecord /
// optional field of each record type.
function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: "t1",
    name: "Japan",
    destination: "Tokyo",
    country: "Japan",
    startDate: "2027-02-22",
    endDate: "2027-02-26",
    travelerCount: 2,
    status: "planning",
    ...over,
  } as unknown as Trip;
}
const item = (dayId: string, actualStatus?: ItineraryItem["actualStatus"]) =>
  ({ dayId, actualStatus }) as unknown as ItineraryItem;
const booking = (status: Booking["status"]) => ({ status }) as unknown as Booking;
const reminder = (checked: boolean) => ({ checked }) as unknown as Reminder;
const expense = (plannedAmount: number, actualAmount: number | undefined, currency = "PHP") =>
  ({ plannedAmount, actualAmount, currency }) as unknown as Expense;

describe("summarizeTrip", () => {
  it("reports zeros — not invented progress — for a trip with no saved data", () => {
    const s = summarizeTrip(trip(), [], [], [], []);
    expect(s.tripDays).toBe(5);
    expect(s.daysPlanned).toBe(0);
    expect(s.activityCount).toBe(0);
    expect(s.activitiesDone).toBe(0);
    expect(s.bookings).toEqual({ total: 0, confirmed: 0, pending: 0, notBooked: 0, cancelled: 0 });
    expect(s.reminders).toEqual({ total: 0, checked: 0 });
    expect(s.budget).toEqual([]);
  });

  it("counts distinct planned days, done activities, bookings by status, and checked reminders", () => {
    const s = summarizeTrip(
      trip(),
      [item("d1", "done"), item("d1"), item("d2", "skipped"), item("d3", "done")],
      [booking("confirmed"), booking("confirmed"), booking("pending"), booking("not_booked"), booking("cancelled")],
      [reminder(true), reminder(false), reminder(true)],
      [],
    );
    expect(s.daysPlanned).toBe(3);
    expect(s.activityCount).toBe(4);
    expect(s.activitiesDone).toBe(2);
    expect(s.bookings).toEqual({ total: 5, confirmed: 2, pending: 1, notBooked: 1, cancelled: 1 });
    expect(s.reminders).toEqual({ total: 3, checked: 2 });
  });

  it("keeps budget per currency and only sums logged actuals", () => {
    const s = summarizeTrip(
      trip({ travelerCount: 2 }),
      [],
      [],
      [],
      [expense(1000, 800), expense(500, undefined), expense(200, 150, "USD")],
    );
    const php = s.budget.find((b) => b.currency === "PHP");
    const usd = s.budget.find((b) => b.currency === "USD");
    expect(php).toMatchObject({ totalPlanned: 1500, totalActualKnown: 800, missingActualCount: 1 });
    expect(usd).toMatchObject({ totalPlanned: 200, totalActualKnown: 150, missingActualCount: 0 });
  });

  it("reports 0 trip days for unreadable dates instead of NaN", () => {
    expect(summarizeTrip(trip({ startDate: "nope" }), [], [], [], []).tripDays).toBe(0);
  });
});

describe("tripTiming", () => {
  const t = trip(); // 2027-02-22 .. 2027-02-26 (5 days)

  it("upcoming: counts days until the start date", () => {
    expect(tripTiming(t, "2027-02-12")).toEqual({ kind: "upcoming", daysUntil: 10 });
    expect(tripTiming(t, "2027-02-21")).toEqual({ kind: "upcoming", daysUntil: 1 });
  });

  it("in-progress: first day, middle day, and last day (end date is inclusive)", () => {
    expect(tripTiming(t, "2027-02-22")).toEqual({ kind: "in-progress", day: 1, of: 5 });
    expect(tripTiming(t, "2027-02-24")).toEqual({ kind: "in-progress", day: 3, of: 5 });
    expect(tripTiming(t, "2027-02-26")).toEqual({ kind: "in-progress", day: 5, of: 5 });
  });

  it("ended: the day after the end date onward", () => {
    expect(tripTiming(t, "2027-02-27")).toEqual({ kind: "ended", daysAgo: 1 });
  });

  it("unknown: unreadable trip dates or an inverted range", () => {
    expect(tripTiming(trip({ startDate: "bad" }), "2027-02-24")).toEqual({ kind: "unknown" });
    expect(tripTiming(trip({ startDate: "2027-03-01", endDate: "2027-02-01" }), "2027-02-24")).toEqual({
      kind: "unknown",
    });
  });
});

describe("sortTripsForDashboard", () => {
  const today = "2027-03-10";
  const ended = trip({ id: "ended", startDate: "2027-01-01", endDate: "2027-01-05" });
  const endedLonger = trip({ id: "endedOlder", startDate: "2026-06-01", endDate: "2026-06-05" });
  const soon = trip({ id: "soon", startDate: "2027-03-15", endDate: "2027-03-18" });
  const later = trip({ id: "later", startDate: "2027-08-01", endDate: "2027-08-09" });
  const now = trip({ id: "now", startDate: "2027-03-09", endDate: "2027-03-12" });
  const broken = trip({ id: "broken", startDate: "bad" });

  it("orders in-progress, then upcoming soonest-first, then past most-recent-first, then unreadable", () => {
    const sorted = sortTripsForDashboard([ended, later, broken, endedLonger, soon, now], today);
    expect(sorted.map((x) => x.id)).toEqual(["now", "soon", "later", "ended", "endedOlder", "broken"]);
  });

  it("does not mutate the input array", () => {
    const input = [later, soon];
    sortTripsForDashboard(input, today);
    expect(input.map((x) => x.id)).toEqual(["later", "soon"]);
  });
});
