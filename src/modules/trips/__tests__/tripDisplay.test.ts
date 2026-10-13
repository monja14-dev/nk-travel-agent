import { describe, expect, it } from "vitest";
import type { Trip } from "../../../db/schema";
import type { TripSummary } from "../tripSummary";
import {
  bookingsCaption,
  budgetDisplay,
  itineraryCaption,
  remindersCaption,
  timingLabel,
  tripMeta,
} from "../tripDisplay";

const trip = (over: Partial<Trip> = {}): Trip =>
  ({
    id: "t1",
    name: "Japan",
    destination: "Tokyo",
    country: "Japan",
    startDate: "2027-02-22",
    endDate: "2027-02-26",
    travelerCount: 2,
    status: "planning",
    ...over,
  }) as unknown as Trip;

const summary = (over: Partial<TripSummary> = {}): TripSummary => ({
  tripId: "t1",
  tripDays: 5,
  daysPlanned: 0,
  activityCount: 0,
  activitiesDone: 0,
  bookings: { total: 0, confirmed: 0, pending: 0, notBooked: 0, cancelled: 0 },
  reminders: { total: 0, checked: 0 },
  budget: [],
  ...over,
});

const money = (over: Partial<TripSummary["budget"][number]> = {}): TripSummary["budget"][number] => ({
  currency: "PHP",
  totalPlanned: 1000,
  totalActualKnown: 400,
  missingActualCount: 0,
  perPersonPlanned: 500,
  perPersonActualKnown: 200,
  ...over,
});

describe("timingLabel", () => {
  it("words each timing kind, singular and plural", () => {
    expect(timingLabel({ kind: "upcoming", daysUntil: 1 })).toBe("Starts tomorrow");
    expect(timingLabel({ kind: "upcoming", daysUntil: 12 })).toBe("Starts in 12 days");
    expect(timingLabel({ kind: "in-progress", day: 2, of: 5 })).toBe("Day 2 of 5");
    expect(timingLabel({ kind: "ended", daysAgo: 1 })).toBe("Ended yesterday");
    expect(timingLabel({ kind: "ended", daysAgo: 9 })).toBe("Ended 9 days ago");
    expect(timingLabel({ kind: "unknown" })).toBeNull();
  });
});

describe("tripMeta", () => {
  it("joins dates, travelers and (only when set) rooms", () => {
    expect(tripMeta(trip())).toBe("22–26 Feb 2027 · 2 travelers");
    expect(tripMeta(trip({ travelerCount: 1, roomCount: 1 }))).toBe("22–26 Feb 2027 · 1 traveler · 1 room");
    expect(tripMeta(trip({ roomCount: 2 }))).toBe("22–26 Feb 2027 · 2 travelers · 2 rooms");
  });
});

describe("captions", () => {
  it("say 'none yet' for an empty trip instead of showing a percentage", () => {
    const s = summary();
    expect(itineraryCaption(s)).toBe("No activities yet");
    expect(bookingsCaption(s)).toBe("None tracked yet");
    expect(remindersCaption(s)).toBe("None yet");
  });

  it("report real counts once records exist", () => {
    const s = summary({
      daysPlanned: 3,
      activityCount: 7,
      bookings: { total: 4, confirmed: 2, pending: 1, notBooked: 1, cancelled: 0 },
      reminders: { total: 3, checked: 1 },
    });
    expect(itineraryCaption(s)).toBe("3 of 5 days · 7 activities");
    expect(bookingsCaption(s)).toBe("2 of 4 confirmed");
    expect(remindersCaption(s)).toBe("1 of 3 done");
  });
});

describe("budgetDisplay", () => {
  it("shows 'No expenses yet' with an empty bar when nothing is saved", () => {
    expect(budgetDisplay([])).toEqual({ caption: "No expenses yet", fraction: 0, tone: "accent" });
  });

  it("shows logged spend against planned, flagging unlogged expenses", () => {
    const d = budgetDisplay([money({ missingActualCount: 2 })]);
    expect(d.fraction).toBeCloseTo(0.4);
    expect(d.tone).toBe("accent");
    expect(d.caption).toContain("2 unlogged");
  });

  it("turns warning when logged spend exceeds the plan", () => {
    expect(budgetDisplay([money({ totalActualKnown: 1500 })]).tone).toBe("warning");
  });

  it("never adds currencies together — extra ones are only counted", () => {
    const d = budgetDisplay([money(), money({ currency: "JPY" }), money({ currency: "USD" })]);
    expect(d.caption).toContain("+2 more currencies");
    expect(budgetDisplay([money(), money({ currency: "JPY" })]).caption).toContain("+1 more currency");
  });

  it("does not divide by a zero plan", () => {
    expect(budgetDisplay([money({ totalPlanned: 0, totalActualKnown: 0 })]).fraction).toBe(0);
  });
});
