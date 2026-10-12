import { describe, it, expect } from "vitest";
import { buildDayTimeline, detectScheduleConflicts, type TimelineInputItem } from "../timeline";

function item(overrides: Partial<TimelineInputItem> & { id: string; order: number }): TimelineInputItem {
  return {
    startTime: undefined,
    endTime: undefined,
    crossesMidnight: false,
    newCalendarDay: false,
    ...overrides,
  };
}

describe("buildDayTimeline", () => {
  it("places same-day items at their plain clock-minute offsets", () => {
    const entries = buildDayTimeline([
      item({ id: "a", order: 0, startTime: "09:00", endTime: "10:00" }),
      item({ id: "b", order: 1, startTime: "11:00", endTime: "12:00" }),
    ]);
    expect(entries).toEqual([
      { id: "a", absStartMinutes: 540, absEndMinutes: 600, hasEnd: true },
      { id: "b", absStartMinutes: 660, absEndMinutes: 720, hasEnd: true },
    ]);
  });

  it("sorts by `order` internally regardless of input array order", () => {
    const entries = buildDayTimeline([
      item({ id: "second", order: 1, startTime: "11:00", endTime: "12:00" }),
      item({ id: "first", order: 0, startTime: "09:00", endTime: "10:00" }),
    ]);
    expect(entries.map((e) => e.id)).toEqual(["first", "second"]);
  });

  it("skips items with no startTime entirely — nothing to place them at", () => {
    const entries = buildDayTimeline([
      item({ id: "no-time", order: 0 }),
      item({ id: "timed", order: 1, startTime: "09:00", endTime: "10:00" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("timed");
  });

  it("gives a timeless item a zero-width window when it has a start but no end", () => {
    const entries = buildDayTimeline([item({ id: "a", order: 0, startTime: "09:00" })]);
    expect(entries).toEqual([{ id: "a", absStartMinutes: 540, absEndMinutes: 540, hasEnd: false }]);
  });

  it("a single item's own crossesMidnight pushes only ITS end into the next day", () => {
    const entries = buildDayTimeline([item({ id: "flight", order: 0, startTime: "23:35", endTime: "02:00", crossesMidnight: true })]);
    expect(entries[0].absStartMinutes).toBe(23 * 60 + 35);
    expect(entries[0].absEndMinutes).toBe(24 * 60 + 2 * 60); // next day's 02:00
  });

  it('the real Taiwan baseline pattern: "Preparation for rest" then a separate "Rest" row marked newCalendarDay', () => {
    // Ground truth extracted from Taiwan_041026.xlsx: two separate rows
    // under "Day 1" — neither row's own start/end crosses midnight, but
    // "Rest" is clearly the next calendar day relative to "Preparation
    // for rest". This is exactly the case `newCalendarDay` exists for.
    const entries = buildDayTimeline([
      item({ id: "prep", order: 0, startTime: "23:01", endTime: "23:59", crossesMidnight: false }),
      item({ id: "rest", order: 1, startTime: "00:00", endTime: "06:00", crossesMidnight: false, newCalendarDay: true }),
    ]);
    const prep = entries.find((e) => e.id === "prep")!;
    const rest = entries.find((e) => e.id === "rest")!;
    expect(prep.absStartMinutes).toBe(23 * 60 + 1);
    expect(prep.absEndMinutes).toBe(23 * 60 + 59);
    // "Rest" starts a full day (1440 min) after the nominal day boundary.
    expect(rest.absStartMinutes).toBe(1440 + 0);
    expect(rest.absEndMinutes).toBe(1440 + 6 * 60);
    // And the two blocks are correctly understood as NOT overlapping.
    expect(rest.absStartMinutes).toBeGreaterThan(prep.absEndMinutes);
  });

  it("newCalendarDay and crossesMidnight compound correctly across three sequential items", () => {
    const entries = buildDayTimeline([
      item({ id: "evening", order: 0, startTime: "20:00", endTime: "23:30" }),
      item({ id: "overnight-flight", order: 1, startTime: "23:40", endTime: "01:00", crossesMidnight: true }),
      item({ id: "next-morning", order: 2, startTime: "08:00", endTime: "09:00", newCalendarDay: true }),
    ]);
    const [evening, flight, morning] = entries;
    expect(evening.absEndMinutes).toBe(23 * 60 + 30);
    expect(flight.absStartMinutes).toBe(23 * 60 + 40);
    expect(flight.absEndMinutes).toBe(1440 + 60); // next day's 01:00
    // "next-morning" is marked newCalendarDay relative to the *previous
    // item* (the flight), not relative to how far crossesMidnight already
    // pushed that item's own end — dayBase only ever moves via the
    // explicit flag, so this lands exactly one day (1440 min) after the
    // nominal start of the sequence, safely after the flight's own end
    // (1500) with no overlap.
    expect(morning.absStartMinutes).toBe(1440 + 8 * 60);
    expect(morning.absStartMinutes).toBeGreaterThan(flight.absEndMinutes);
  });
});

describe("detectScheduleConflicts", () => {
  it("finds no conflicts for sequential, non-overlapping items", () => {
    const conflicts = detectScheduleConflicts([
      item({ id: "a", order: 0, startTime: "09:00", endTime: "10:00" }),
      item({ id: "b", order: 1, startTime: "10:00", endTime: "11:00" }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("flags two items with genuinely overlapping windows", () => {
    const conflicts = detectScheduleConflicts([
      item({ id: "a", order: 0, startTime: "09:00", endTime: "11:00" }),
      item({ id: "b", order: 1, startTime: "10:00", endTime: "12:00" }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({ aId: "a", bId: "b", overlapMinutes: 60 });
  });

  it("does NOT misread the real baseline's newCalendarDay rollover as a conflict", () => {
    // Without the explicit newCalendarDay flag, "Rest" (00:00-06:00) would
    // naively look like it overlaps "Preparation for rest" (23:01-23:59)
    // from the previous evening if compared by raw clock time. With the
    // flag, the timeline correctly places them on different absolute
    // days and detects no conflict.
    const conflicts = detectScheduleConflicts([
      item({ id: "prep", order: 0, startTime: "23:01", endTime: "23:59" }),
      item({ id: "rest", order: 1, startTime: "00:00", endTime: "06:00", newCalendarDay: true }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("DOES flag a genuine same-day double-booking that is NOT marked newCalendarDay", () => {
    // Two items both nominally the same day, entered out of order, that
    // really do overlap — this must never be silently explained away as
    // a midnight rollover just because one of them starts at a small
    // clock time.
    const conflicts = detectScheduleConflicts([
      item({ id: "tour", order: 0, startTime: "08:00", endTime: "12:00" }),
      item({ id: "double-booked", order: 1, startTime: "09:00", endTime: "10:00" }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].aId).toBe("tour");
    expect(conflicts[0].bId).toBe("double-booked");
  });

  it("never flags an item with no end time — a zero-width window can't overlap anything", () => {
    const conflicts = detectScheduleConflicts([
      item({ id: "timeless", order: 0, startTime: "09:00" }),
      item({ id: "normal", order: 1, startTime: "09:00", endTime: "10:00" }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("finds multiple independent conflicts in a busier day", () => {
    const conflicts = detectScheduleConflicts([
      item({ id: "a", order: 0, startTime: "08:00", endTime: "10:00" }),
      item({ id: "b", order: 1, startTime: "09:00", endTime: "11:00" }), // overlaps a
      item({ id: "c", order: 2, startTime: "12:00", endTime: "13:00" }),
      item({ id: "d", order: 3, startTime: "12:30", endTime: "13:30" }), // overlaps c
    ]);
    expect(conflicts).toHaveLength(2);
    const pairs = conflicts.map((c) => [c.aId, c.bId]);
    expect(pairs).toEqual(
      expect.arrayContaining([
        ["a", "b"],
        ["c", "d"],
      ]),
    );
  });

  it("handles an empty day with no items", () => {
    expect(detectScheduleConflicts([])).toEqual([]);
  });
});
