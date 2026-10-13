import { describe, expect, it } from "vitest";
import type { ItineraryDay, ItineraryItem } from "../../../db/schema";
import {
  OUTSIDE_TRIP_DATES_LABEL,
  buildStudioRows,
  mapsSearchUrl,
  safeHttpUrl,
  summarizeStudio,
} from "../studioRows";

const day = (id: string, date: string, dayLabel: string): ItineraryDay =>
  ({ id, tripId: "t1", date, dayLabel }) as unknown as ItineraryDay;

let seq = 0;
function item(over: Partial<ItineraryItem> & { dayId: string; order: number }): ItineraryItem {
  seq += 1;
  return {
    id: `i${seq}`,
    tripId: "t1",
    crossesMidnight: false,
    newCalendarDay: false,
    category: "activity",
    title: `Item ${seq}`,
    bookingStatus: "not_booked",
    ...over,
  } as unknown as ItineraryItem;
}

const NOW = new Date("2027-01-10T00:00:00Z");

describe("buildStudioRows", () => {
  it("orders days by date and items by saved order, regardless of input order", () => {
    const d1 = day("d1", "2027-02-22", "Day 1");
    const d2 = day("d2", "2027-02-23", "Day 2");
    const a = item({ dayId: "d2", order: 0, title: "Day2-first" });
    const b = item({ dayId: "d1", order: 1, title: "Day1-second" });
    const c = item({ dayId: "d1", order: 0, title: "Day1-first" });
    const rows = buildStudioRows([d2, d1], [a, b, c], NOW);
    expect(rows.map((r) => r.title)).toEqual(["Day1-first", "Day1-second", "Day2-first"]);
    expect(rows[0].date).toBe("2027-02-22");
    expect(rows[0].dayLabel).toBe("Day 1");
  });

  it("never invents values: missing fields are null", () => {
    const [r] = buildStudioRows([day("d1", "2027-02-22", "Day 1")], [item({ dayId: "d1", order: 0 })], NOW);
    expect(r.start).toBeNull();
    expect(r.end).toBeNull();
    expect(r.duration).toBeNull();
    expect(r.address).toBeNull();
    expect(r.mapsUrl).toBeNull();
    expect(r.travelTime).toBeNull();
    expect(r.farePlanned).toBeNull();
    expect(r.costPlanned).toBeNull();
    expect(r.source).toBeNull();
    expect(r.actualStatus).toBeNull();
    expect(r.conflict).toBe(false);
  });

  it("derives duration (including across midnight) and formats fare/cost with cents", () => {
    const rows = buildStudioRows(
      [day("d1", "2027-02-22", "Day 1")],
      [
        item({ dayId: "d1", order: 0, startTime: "09:00", endTime: "10:30" }),
        item({
          dayId: "d1",
          order: 1,
          startTime: "23:35",
          endTime: "02:00",
          crossesMidnight: true,
          travelTimeMinutes: 45,
          farePlanned: 12.5,
          fareActual: 13,
          activityCostPlanned: 100,
          currency: "USD",
        }),
      ],
      NOW,
    );
    expect(rows[0].duration).toBe("1h 30m");
    expect(rows[1].duration).toBe("2h 25m");
    expect(rows[1].endNextDay).toBe(true);
    expect(rows[1].travelTime).toBe("45m");
    expect(rows[1].farePlanned).toBe("$12.50");
    expect(rows[1].fareActual).toBe("$13");
    expect(rows[1].costPlanned).toBe("$100");
    expect(rows[1].costActual).toBeNull();
  });

  it("flags only genuinely overlapping items as conflicts", () => {
    const rows = buildStudioRows(
      [day("d1", "2027-02-22", "Day 1")],
      [
        item({ dayId: "d1", order: 0, title: "A", startTime: "09:00", endTime: "11:00" }),
        item({ dayId: "d1", order: 1, title: "B", startTime: "10:30", endTime: "12:00" }),
        item({ dayId: "d1", order: 2, title: "C", startTime: "12:00", endTime: "13:00" }),
      ],
      NOW,
    );
    expect(rows.map((r) => [r.title, r.conflict])).toEqual([
      ["A", true],
      ["B", true],
      ["C", false],
    ]);
  });

  it("keeps items on a day outside the trip's dates, listed last and marked", () => {
    const rows = buildStudioRows(
      [day("d1", "2027-02-22", "Day 1")],
      [item({ dayId: "gone", order: 0, title: "Orphan" }), item({ dayId: "d1", order: 0, title: "Normal" })],
      NOW,
    );
    expect(rows.map((r) => r.title)).toEqual(["Normal", "Orphan"]);
    expect(rows[1].onTripDay).toBe(false);
    expect(rows[1].dayLabel).toBe(OUTSIDE_TRIP_DATES_LABEL);
    expect(rows[1].date).toBe("");
  });

  it("carries source + verification, ages old data to stale, and drops non-http links", () => {
    const rows = buildStudioRows(
      [day("d1", "2027-02-22", "Day 1")],
      [
        item({
          dayId: "d1",
          order: 0,
          attribution: {
            sourceLabel: "Official site",
            sourceUrl: "https://example.com/tickets",
            retrievedAt: "2027-01-05T00:00:00Z",
            verificationStatus: "verified",
          },
        }),
        item({
          dayId: "d1",
          order: 1,
          attribution: {
            sourceLabel: "Old note",
            sourceUrl: "javascript:alert(1)",
            retrievedAt: "2026-10-01T00:00:00Z",
            verificationStatus: "verified",
          },
        }),
      ],
      NOW,
    );
    expect(rows[0].source).toEqual({ label: "Official site", href: "https://example.com/tickets", status: "verified" });
    expect(rows[1].source?.href).toBeNull();
    expect(rows[1].source?.status).toBe("stale");
  });
});

describe("mapsSearchUrl / safeHttpUrl", () => {
  it("builds an encoded search link and ignores blank addresses", () => {
    expect(mapsSearchUrl("1 Main St & Co")).toBe(
      "https://www.google.com/maps/search/?api=1&query=1%20Main%20St%20%26%20Co",
    );
    expect(mapsSearchUrl("   ")).toBeNull();
  });

  it("only allows http(s) links", () => {
    expect(safeHttpUrl("https://a.example/x")).toBe("https://a.example/x");
    expect(safeHttpUrl("HTTP://a.example")).toBe("HTTP://a.example");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("summarizeStudio", () => {
  it("reports zeros for an empty plan", () => {
    expect(summarizeStudio([day("d1", "2027-02-22", "Day 1")], [])).toEqual({
      dayCount: 1,
      daysPlanned: 0,
      activityCount: 0,
      doneCount: 0,
      conflictPairs: 0,
      untimedCount: 0,
      outsideTripCount: 0,
    });
  });

  it("counts planned days, done items, untimed items, conflicts and orphans", () => {
    const days = [day("d1", "2027-02-22", "Day 1"), day("d2", "2027-02-23", "Day 2"), day("d3", "2027-02-24", "Day 3")];
    const items = [
      item({ dayId: "d1", order: 0, startTime: "09:00", endTime: "11:00", actualStatus: "done" }),
      item({ dayId: "d1", order: 1, startTime: "10:00", endTime: "12:00" }),
      item({ dayId: "d2", order: 0 }),
      item({ dayId: "gone", order: 0, startTime: "08:00" }),
    ];
    const s = summarizeStudio(days, items);
    expect(s.dayCount).toBe(3);
    expect(s.daysPlanned).toBe(2); // d1, d2 — the orphan's day doesn't count
    expect(s.activityCount).toBe(4);
    expect(s.doneCount).toBe(1);
    expect(s.conflictPairs).toBe(1);
    expect(s.untimedCount).toBe(1);
    expect(s.outsideTripCount).toBe(1);
  });
});
