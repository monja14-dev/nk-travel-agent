import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../../db/client";
import { resetTestDb } from "../../../db/repositories/__tests__/testSupport";
import { ensureDaysForTripRange } from "../../../db/repositories/itineraryDaysRepo";
import { createItem } from "../../../db/repositories/itineraryItemsRepo";
import { previewProposal } from "../previewProposal";
import type { ItineraryItemProposal } from "../types";

const TRIP_A = "trip_a";

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("previewProposal — itinerary-item-upsert (create)", () => {
  it("previews a new item's changes against `from: undefined`, never stale", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: day.id,
      itemId: null,
      expectedRevision: null,
      changes: { title: "Night Market", category: "food" },
      rationale: "y",
    };
    const preview = await previewProposal(proposal);
    expect(preview.notFound).toBe(false);
    expect(preview.isStale).toBe(false);
    expect(preview.currentRevision).toBeNull();
    expect(preview.changes).toEqual(
      expect.arrayContaining([
        { field: "title", from: undefined, to: "Night Market" },
        { field: "category", from: undefined, to: "food" },
      ]),
    );
  });

  it("reports notFound when the target day doesn't exist", async () => {
    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: "day_missing",
      itemId: null,
      expectedRevision: null,
      changes: { title: "X" },
      rationale: "y",
    };
    const preview = await previewProposal(proposal);
    expect(preview.notFound).toBe(true);
  });
});

describe("previewProposal — itinerary-item-upsert (update)", () => {
  it("diffs against the item's CURRENT stored values, read fresh (not the AI's stale snapshot)", async () => {
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
      rationale: "y",
    };
    const preview = await previewProposal(proposal);
    expect(preview.notFound).toBe(false);
    expect(preview.isStale).toBe(false);
    expect(preview.currentRevision).toBe(item.revision);
    expect(preview.changes).toEqual([{ field: "bookingStatus", from: "not_booked", to: "confirmed" }]);
  });

  it("flags isStale when the item's revision has moved on since the proposal was generated", async () => {
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
      expectedRevision: item.revision - 1,
      changes: { bookingStatus: "confirmed" },
      rationale: "y",
    };
    const preview = await previewProposal(proposal);
    expect(preview.isStale).toBe(true);
    expect(preview.currentRevision).toBe(item.revision);
  });

  it("reports notFound when the item no longer exists", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: day.id,
      itemId: "item_missing",
      expectedRevision: 1,
      changes: { bookingStatus: "confirmed" },
      rationale: "y",
    };
    const preview = await previewProposal(proposal);
    expect(preview.notFound).toBe(true);
  });
});
