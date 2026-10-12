import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../../db/client";
import { resetTestDb } from "../../../db/repositories/__tests__/testSupport";
import { ensureDaysForTripRange } from "../../../db/repositories/itineraryDaysRepo";
import { createItem, getItem, listItemsForDay } from "../../../db/repositories/itineraryItemsRepo";
import { applyProposal } from "../applyProposal";
import type { ItineraryItemProposal } from "../types";

const TRIP_A = "trip_a";

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("applyProposal — itinerary-item-upsert (create)", () => {
  it("creates a new item when itemId is null, defaulting order to the current item count", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    await createItem(TRIP_A, day.id, { order: 0, crossesMidnight: false, newCalendarDay: false, category: "activity", title: "Existing item", bookingStatus: "not_booked" });

    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: day.id,
      itemId: null,
      expectedRevision: null,
      changes: { title: "Shilin Night Market", category: "food", startTime: "18:00", endTime: "20:00" },
      rationale: "Fits the evening free slot.",
    };

    const result = await applyProposal(proposal);
    expect(result).toEqual({ status: "applied" });

    const items = await listItemsForDay(day.id);
    expect(items).toHaveLength(2);
    const created = items.find((i) => i.title === "Shilin Night Market")!;
    expect(created.order).toBe(1); // defaulted to existingItems.length at proposal time
    expect(created.category).toBe("food");
    expect(created.bookingStatus).toBe("not_booked"); // defaulted
  });

  it("rejects a create proposal with no title", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: day.id,
      itemId: null,
      expectedRevision: null,
      changes: { category: "food" },
      rationale: "y",
    };
    const result = await applyProposal(proposal);
    expect(result.status).toBe("invalid");
    expect(await listItemsForDay(day.id)).toHaveLength(0);
  });

  it("returns not-found when the target day doesn't exist", async () => {
    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: "day_does-not-exist",
      itemId: null,
      expectedRevision: null,
      changes: { title: "X" },
      rationale: "y",
    };
    const result = await applyProposal(proposal);
    expect(result.status).toBe("not-found");
  });

  it("surfaces a validation failure from createItem (e.g. a cost without a currency)", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: day.id,
      itemId: null,
      expectedRevision: null,
      changes: { title: "X", farePlanned: 100 }, // no currency
      rationale: "y",
    };
    const result = await applyProposal(proposal);
    expect(result.status).toBe("invalid");
  });
});

describe("applyProposal — itinerary-item-upsert (update)", () => {
  it("applies a valid, non-stale update", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, {
      order: 0,
      crossesMidnight: false,
      newCalendarDay: false,
      category: "activity",
      title: "Grassland walk",
      bookingStatus: "not_booked",
    });

    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: day.id,
      itemId: item.id,
      expectedRevision: item.revision,
      changes: { bookingStatus: "confirmed" },
      rationale: "Confirmed with the tour operator.",
    };

    const result = await applyProposal(proposal);
    expect(result).toEqual({ status: "applied" });
    const updated = await getItem(item.id);
    expect(updated?.bookingStatus).toBe("confirmed");
    expect(updated?.revision).toBe(item.revision + 1);
  });

  it("rejects a stale update — the item changed since the AI last saw it — and leaves it untouched", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, {
      order: 0,
      crossesMidnight: false,
      newCalendarDay: false,
      category: "activity",
      title: "Grassland walk",
      bookingStatus: "not_booked",
    });

    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: day.id,
      itemId: item.id,
      expectedRevision: item.revision - 1, // stale on purpose
      changes: { bookingStatus: "confirmed" },
      rationale: "y",
    };

    const result = await applyProposal(proposal);
    expect(result).toEqual({ status: "stale" });
    expect((await getItem(item.id))?.bookingStatus).toBe("not_booked");
  });

  it("returns not-found when the item no longer exists", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: day.id,
      itemId: "item_does-not-exist",
      expectedRevision: 1,
      changes: { bookingStatus: "confirmed" },
      rationale: "y",
    };
    expect(await applyProposal(proposal)).toEqual({ status: "not-found" });
  });
});
