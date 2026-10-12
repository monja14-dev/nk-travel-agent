import { describe, it, expect } from "vitest";
import { buildItineraryContextSnapshot } from "../buildContext";
import type { ItineraryDay, ItineraryItem } from "../../../db/schema";

function day(overrides: Partial<ItineraryDay> & { id: string; date: string }): ItineraryDay {
  return { tripId: "trip_a", revision: 1, createdAt: "", updatedAt: "", dayLabel: "Day", ...overrides };
}

function item(overrides: Partial<ItineraryItem> & { id: string; dayId: string; order: number; title: string }): ItineraryItem {
  return {
    tripId: "trip_a",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    crossesMidnight: false,
    newCalendarDay: false,
    category: "activity",
    bookingStatus: "not_booked",
    ...overrides,
  };
}

describe("buildItineraryContextSnapshot", () => {
  it("returns an empty array for a trip with no days yet", () => {
    expect(buildItineraryContextSnapshot([], [])).toEqual([]);
  });

  it("sorts days by date and nests each day's items sorted by order", () => {
    const days = [day({ id: "day_2", date: "2027-02-11" }), day({ id: "day_1", date: "2027-02-10" })];
    const items = [
      item({ id: "item_b", dayId: "day_1", order: 1, title: "Second" }),
      item({ id: "item_a", dayId: "day_1", order: 0, title: "First" }),
    ];
    const snapshot = buildItineraryContextSnapshot(days, items);
    expect(snapshot.map((d) => d.dayId)).toEqual(["day_1", "day_2"]);
    expect(snapshot[0].items.map((i) => i.title)).toEqual(["First", "Second"]);
    expect(snapshot[1].items).toEqual([]);
  });

  it("includes only the compact fields the model needs, not the full item shape", () => {
    const days = [day({ id: "day_1", date: "2027-02-10" })];
    const items = [
      item({
        id: "item_a",
        dayId: "day_1",
        order: 0,
        title: "Grassland walk",
        startTime: "09:00",
        endTime: "11:00",
        address: "Somewhere in Taipei", // NOT included in the snapshot
        comments: "secret notes", // NOT included either
      }),
    ];
    const snapshot = buildItineraryContextSnapshot(days, items);
    expect(snapshot[0].items[0]).toEqual({
      itemId: "item_a",
      revision: 1,
      order: 0,
      startTime: "09:00",
      endTime: "11:00",
      category: "activity",
      title: "Grassland walk",
      bookingStatus: "not_booked",
    });
  });
});
