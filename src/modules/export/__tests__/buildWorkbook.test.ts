import { describe, it, expect } from "vitest";
import * as ExcelJS from "exceljs"; // see buildWorkbook.ts's comment on why not a default import
import { buildTripWorkbook } from "../buildWorkbook";
import type { TripExportData } from "../types";
import type { Trip, ItineraryDay, ItineraryItem } from "../../../db/schema";

/** Asserts a cell holds a formula with exactly this text — checked via
 * the `.formula` property rather than a deep-equal against the cell's
 * whole value object, since ExcelJS's internal formula-value shape (it
 * may carry a `result`/`shareType` alongside `formula`) isn't part of
 * this app's contract and shouldn't make an otherwise-correct formula
 * fail a test. */
function expectFormula(cell: ExcelJS.Cell, expected: string) {
  const value = cell.value as { formula?: string } | null;
  expect(value && typeof value === "object" ? value.formula : value).toBe(expected);
}

const EXPECTED_SHEET_NAMES = [
  "Trip Overview",
  "High-Level Itinerary",
  "Detailed Itinerary",
  "Reminders",
  "Budget",
  "Bookings",
  "Change Log",
  "Research Sources",
];

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip_a",
    revision: 1,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
    name: "Taiwan Trip",
    destination: "Taipei",
    country: "Taiwan",
    startDate: "2027-02-10",
    endDate: "2027-02-11",
    travelerCount: 2,
    status: "planning",
    ...overrides,
  };
}

function emptyExportData(overrides: Partial<TripExportData> = {}): TripExportData {
  return {
    trip: baseTrip(),
    days: [],
    items: [],
    expenses: [],
    bookings: [],
    reminders: [],
    researchSources: [],
    accommodationResults: [],
    foodResults: [],
    changeLog: [],
    generatedAt: "2027-01-15T12:00:00.000Z",
    ...overrides,
  };
}

function day(overrides: Partial<ItineraryDay> & { id: string; date: string }): ItineraryDay {
  return {
    tripId: "trip_a",
    revision: 1,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
    dayLabel: "Day",
    ...overrides,
  };
}

function item(overrides: Partial<ItineraryItem> & { id: string; dayId: string; order: number; title: string }): ItineraryItem {
  return {
    tripId: "trip_a",
    revision: 1,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
    crossesMidnight: false,
    newCalendarDay: false,
    category: "activity",
    bookingStatus: "not_booked",
    ...overrides,
  };
}

async function reload(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return reloaded;
}

describe("buildTripWorkbook — structure", () => {
  it("creates exactly the 8 required sheets, in order", () => {
    const workbook = buildTripWorkbook(emptyExportData());
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual(EXPECTED_SHEET_NAMES);
  });

  it("freezes the header row on every sheet", () => {
    const workbook = buildTripWorkbook(emptyExportData());
    for (const ws of workbook.worksheets) {
      expect(ws.views?.[0]?.state, ws.name).toBe("frozen");
      expect((ws.views?.[0] as { ySplit?: number })?.ySplit, ws.name).toBe(1);
    }
  });

  it("adds an autofilter over the header on every tabular sheet except Trip Overview", () => {
    const workbook = buildTripWorkbook(emptyExportData());
    for (const ws of workbook.worksheets) {
      if (ws.name === "Trip Overview") continue;
      expect(ws.autoFilter, ws.name).toBeTruthy();
    }
  });

  it("round-trips through a real XLSX buffer without throwing, and keeps the same sheet names", async () => {
    const workbook = buildTripWorkbook(emptyExportData());
    const reloaded = await reload(workbook);
    expect(reloaded.worksheets.map((ws) => ws.name)).toEqual(EXPECTED_SHEET_NAMES);
  });
});

describe("buildTripWorkbook — Trip Overview", () => {
  it("writes the trip's fields and a trip-length formula derived from the date cells", () => {
    const workbook = buildTripWorkbook(emptyExportData());
    const ws = workbook.getWorksheet("Trip Overview")!;
    expect(ws.getCell("B2").value).toBe("Taiwan Trip");
    expect(ws.getCell("B3").value).toBe("Taipei");
    expect((ws.getCell("B5").value as Date).toISOString().slice(0, 10)).toBe("2027-02-10");
    expect((ws.getCell("B6").value as Date).toISOString().slice(0, 10)).toBe("2027-02-11");
    expectFormula(ws.getCell("B7"), "=B6-B5+1");
    expect(ws.getCell("B8").value).toBe(2); // traveler count — Budget sheet formulas depend on this exact cell
  });
});

describe("buildTripWorkbook — Detailed Itinerary", () => {
  function twoItemFixture(): TripExportData {
    const d = day({ id: "day_1", date: "2027-02-10", dayLabel: "Day 1" });
    return emptyExportData({
      days: [d],
      items: [
        item({
          id: "item_1",
          dayId: "day_1",
          order: 0,
          title: "Qingtiangang grassland",
          startTime: "09:00",
          endTime: "11:00",
          category: "activity",
          farePlanned: 100,
          activityCostPlanned: 50,
          currency: "TWD",
        }),
        item({
          id: "item_2",
          dayId: "day_1",
          order: 1,
          title: "Lunch",
          startTime: "12:00",
          endTime: "13:00",
          category: "food",
          farePlanned: 0,
          activityCostPlanned: 300,
          currency: "TWD",
        }),
      ],
    });
  }

  it("writes one row per item, sorted by day date then order, with a computed duration", () => {
    const workbook = buildTripWorkbook(twoItemFixture());
    const ws = workbook.getWorksheet("Detailed Itinerary")!;
    expect(ws.getCell("J2").value).toBe("Qingtiangang grassland"); // title column
    expect(ws.getCell("F2").value).toBe("2h"); // duration column, formatted
    expect(ws.getCell("J3").value).toBe("Lunch");
  });

  it("adds a totals row with SUM formulas over the four cost columns", () => {
    const workbook = buildTripWorkbook(twoItemFixture());
    const ws = workbook.getWorksheet("Detailed Itinerary")!;
    // 2 data rows (rows 2-3) -> totals row is row 4.
    expectFormula(ws.getCell("P4"), "=SUM(P2:P3)");
    expectFormula(ws.getCell("R4"), "=SUM(R2:R3)");
  });

  it("handles an EMPTY itinerary without error, still producing a well-formed totals row", () => {
    const workbook = buildTripWorkbook(emptyExportData());
    const ws = workbook.getWorksheet("Detailed Itinerary")!;
    // No data rows -> lastDataRow is clamped to 2, totals row is row 3.
    expectFormula(ws.getCell("P3"), "=SUM(P2:P2)");
    expect(ws.rowCount).toBeGreaterThanOrEqual(3);
  });

  it("handles a LARGE itinerary (300 items) without error and keeps the totals formula range in sync", () => {
    const d = day({ id: "day_1", date: "2027-02-10", dayLabel: "Day 1" });
    const items: ItineraryItem[] = [];
    for (let i = 0; i < 300; i++) {
      items.push(item({ id: `item_${i}`, dayId: "day_1", order: i, title: `Item ${i}`, farePlanned: 1, currency: "TWD" }));
    }
    const workbook = buildTripWorkbook(emptyExportData({ days: [d], items }));
    const ws = workbook.getWorksheet("Detailed Itinerary")!;
    expect(ws.getCell("J301").value).toBe("Item 299"); // last data row = 1 (header) + 300
    expectFormula(ws.getCell("P302"), "=SUM(P2:P301)");
  });

  it("applies formula-injection sanitization to a malicious title/comments value", () => {
    const d = day({ id: "day_1", date: "2027-02-10", dayLabel: "Day 1" });
    const workbook = buildTripWorkbook(
      emptyExportData({
        days: [d],
        items: [
          item({
            id: "item_1",
            dayId: "day_1",
            order: 0,
            title: "=cmd|'/C calc'!A1",
            comments: "@SUM(1,1)",
          }),
        ],
      }),
    );
    const ws = workbook.getWorksheet("Detailed Itinerary")!;
    expect(ws.getCell("J2").value).toBe("'=cmd|'/C calc'!A1");
    expect(typeof ws.getCell("J2").value).toBe("string"); // never a formula object
    expect(ws.getCell("Z2").value).toBe("'@SUM(1,1)");
  });

  it("preserves unicode and quote characters exactly", () => {
    const d = day({ id: "day_1", date: "2027-02-10", dayLabel: "Day 1" });
    const title = `Dinner at "Din Tai Fung" — 鼎泰豐`;
    const workbook = buildTripWorkbook(
      emptyExportData({ days: [d], items: [item({ id: "item_1", dayId: "day_1", order: 0, title })] }),
    );
    const ws = workbook.getWorksheet("Detailed Itinerary")!;
    expect(ws.getCell("J2").value).toBe(title);
  });
});

describe("buildTripWorkbook — High-Level Itinerary", () => {
  it("writes a COUNTIF/SUMIF formula per day referencing the Detailed Itinerary sheet", () => {
    const d1 = day({ id: "day_1", date: "2027-02-10", dayLabel: "Day 1" });
    const d2 = day({ id: "day_2", date: "2027-02-11", dayLabel: "Day 2" });
    const workbook = buildTripWorkbook(
      emptyExportData({
        days: [d1, d2],
        items: [item({ id: "item_1", dayId: "day_1", order: 0, title: "X", farePlanned: 10, currency: "TWD" })],
      }),
    );
    const ws = workbook.getWorksheet("High-Level Itinerary")!;
    expectFormula(ws.getCell("E2"), "=COUNTIF('Detailed Itinerary'!A2:A2,A2)");
    expectFormula(ws.getCell("H2"), "=SUMIF('Detailed Itinerary'!A2:A2,A2,'Detailed Itinerary'!P2:P2)");
  });

  it("handles a trip with days but zero items", () => {
    const d1 = day({ id: "day_1", date: "2027-02-10", dayLabel: "Day 1" });
    const workbook = buildTripWorkbook(emptyExportData({ days: [d1] }));
    const ws = workbook.getWorksheet("High-Level Itinerary")!;
    expect(ws.getCell("B2").value).toBe("Day 1");
  });
});

describe("buildTripWorkbook — Budget", () => {
  it("writes a per-currency breakdown with live SUMIF/COUNTIFS formulas and per-person division", () => {
    const workbook = buildTripWorkbook(
      emptyExportData({
        trip: baseTrip({ travelerCount: 2 }),
        expenses: [
          { id: "e1", tripId: "trip_a", revision: 1, createdAt: "", updatedAt: "", kind: "variable", category: "food", label: "Dinner", plannedAmount: 1000, currency: "PHP" },
          { id: "e2", tripId: "trip_a", revision: 1, createdAt: "", updatedAt: "", kind: "fixed", category: "flight", label: "Flight", plannedAmount: 50, actualAmount: 55, currency: "USD" },
        ],
      }),
    );
    const ws = workbook.getWorksheet("Budget")!;
    // 2 expense rows -> data rows 2-3, totals row 4, breakdown header row 6.
    expectFormula(ws.getCell("D4"), "=SUM(D2:D3)");
    expect(ws.getCell("A7").value).toBe("PHP");
    expectFormula(ws.getCell("B7"), "=SUMIF(F2:F3,A7,D2:D3)");
    expectFormula(ws.getCell("E7"), "=B7/'Trip Overview'!$B$8");
    expect(ws.getCell("A8").value).toBe("USD");
  });

  it("handles zero expenses without producing a malformed range", () => {
    const workbook = buildTripWorkbook(emptyExportData());
    const ws = workbook.getWorksheet("Budget")!;
    expectFormula(ws.getCell("D3"), "=SUM(D2:D2)");
  });
});

describe("buildTripWorkbook — Reminders", () => {
  it("writes a checked-count formula", () => {
    const workbook = buildTripWorkbook(
      emptyExportData({
        reminders: [
          { id: "r1", tripId: "trip_a", revision: 1, createdAt: "", updatedAt: "", section: "Bring", label: "Passport", checked: true },
          { id: "r2", tripId: "trip_a", revision: 1, createdAt: "", updatedAt: "", section: "Bring", label: "Adapter", checked: false },
        ],
      }),
    );
    const ws = workbook.getWorksheet("Reminders")!;
    expectFormula(ws.getCell("G1"), "=COUNTIF(D2:D3,TRUE)");
  });
});

describe("buildTripWorkbook — Research Sources", () => {
  it("consolidates research sources, accommodation/food attributions, and itinerary item attributions", () => {
    const workbook = buildTripWorkbook(
      emptyExportData({
        researchSources: [
          { id: "rs1", tripId: "trip_a", revision: 1, createdAt: "", updatedAt: "", topic: "Boracay environmental fee", verificationStatus: "verified" },
        ],
        accommodationResults: [
          {
            id: "a1",
            tripId: "trip_a",
            revision: 1,
            createdAt: "",
            updatedAt: "",
            name: "Henann Resort",
            mandatoryFees: [],
            attribution: { sourceLabel: "Manually researched", retrievedAt: "2027-01-01T00:00:00.000Z", verificationStatus: "estimate" },
          },
        ],
      }),
    );
    const ws = workbook.getWorksheet("Research Sources")!;
    expect(ws.getCell("A2").value).toBe("General");
    expect(ws.getCell("B2").value).toBe("Boracay environmental fee");
    expect(ws.getCell("A3").value).toBe("Accommodation");
    expect(ws.getCell("B3").value).toBe("Henann Resort");
  });
});

describe("buildTripWorkbook — Change Log", () => {
  it("writes before/after as sanitized, length-capped JSON", () => {
    const workbook = buildTripWorkbook(
      emptyExportData({
        changeLog: [
          {
            id: "cl1",
            tripId: "trip_a",
            entityType: "itineraryItems",
            entityId: "item_1",
            action: "update",
            source: "user",
            before: { title: "Old" },
            after: { title: "New" },
            timestamp: "2027-01-02T00:00:00.000Z",
          },
        ],
      }),
    );
    const ws = workbook.getWorksheet("Change Log")!;
    expect(ws.getCell("F2").value).toBe('{"title":"Old"}');
    expect(ws.getCell("G2").value).toBe('{"title":"New"}');
  });

  it("truncates a pathologically large before/after payload rather than writing an unbounded cell", () => {
    const huge = { blob: "x".repeat(5000) };
    const workbook = buildTripWorkbook(
      emptyExportData({
        changeLog: [
          { id: "cl1", tripId: "trip_a", entityType: "x", entityId: "x", action: "create", source: "user", after: huge, timestamp: "2027-01-02T00:00:00.000Z" },
        ],
      }),
    );
    const ws = workbook.getWorksheet("Change Log")!;
    const value = ws.getCell("G2").value as string;
    expect(value.length).toBeLessThan(2100);
    expect(value.endsWith("…(truncated)")).toBe(true);
  });
});
