import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../../db/client";
import { resetTestDb } from "../../../db/repositories/__tests__/testSupport";
import { ensureDaysForTripRange } from "../../../db/repositories/itineraryDaysRepo";
import { createItem, getItem } from "../../../db/repositories/itineraryItemsRepo";
import { applyProposal } from "../applyProposal";
import { previewProposal } from "../previewProposal";
import type { ItineraryItemProposal } from "../types";

const TRIP_A = "trip_a";
const TRIP_B = "trip_b";

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

/**
 * Phase 6 audit finding: previewProposal/applyProposal's itinerary-item
 * branches fetched the target item by id alone (getItem(id), with no
 * per-trip scoping — unlike createItem, which already checks the day's
 * own tripId) and only ever compared `expectedRevision`, never
 * `current.tripId` against `proposal.tripId`. A proposal naming the
 * wrong trip for a real item/day that actually belongs to a *different*
 * trip would have been shown and applied as an ordinary, non-stale
 * change — silently writing to the wrong trip. These tests set up two
 * real trips and send proposals with a deliberately mismatched tripId to
 * confirm the fix: treated the same as "doesn't exist", and the other
 * trip's data is left completely untouched.
 */
describe("trip isolation — itinerary-item-upsert proposals (Phase 6)", () => {
  it("previewProposal refuses to preview an update whose proposal.tripId doesn't match the item's real trip", async () => {
    const [dayA] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const [dayB] = await ensureDaysForTripRange(TRIP_B, "2027-02-10", "2027-02-10");
    const itemB = await createItem(TRIP_B, dayB.id, {
      order: 0,
      crossesMidnight: false,
      newCalendarDay: false,
      category: "activity",
      title: "Trip B's own item",
      bookingStatus: "not_booked",
    });

    const crossTripProposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A, // claims Trip A...
      dayId: dayA.id,
      itemId: itemB.id, // ...but this item is really Trip B's
      expectedRevision: itemB.revision,
      changes: { bookingStatus: "confirmed" },
      rationale: "y",
    };

    const preview = await previewProposal(crossTripProposal);
    expect(preview.notFound).toBe(true);
    expect(preview.changes).toEqual([]);
  });

  it("previewProposal refuses to preview a create whose proposal.tripId doesn't match the target day's real trip", async () => {
    const [dayB] = await ensureDaysForTripRange(TRIP_B, "2027-02-10", "2027-02-10");

    const crossTripProposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A, // claims Trip A...
      dayId: dayB.id, // ...but this day belongs to Trip B
      itemId: null,
      expectedRevision: null,
      changes: { title: "Snuck in" },
      rationale: "y",
    };

    const preview = await previewProposal(crossTripProposal);
    expect(preview.notFound).toBe(true);
  });

  it("applyProposal refuses to apply an update whose proposal.tripId doesn't match the item's real trip, and leaves it untouched", async () => {
    const [dayA] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const [dayB] = await ensureDaysForTripRange(TRIP_B, "2027-02-10", "2027-02-10");
    const itemB = await createItem(TRIP_B, dayB.id, {
      order: 0,
      crossesMidnight: false,
      newCalendarDay: false,
      category: "activity",
      title: "Trip B's own item",
      bookingStatus: "not_booked",
    });

    const crossTripProposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: dayA.id,
      itemId: itemB.id,
      expectedRevision: itemB.revision,
      changes: { bookingStatus: "confirmed" },
      rationale: "y",
    };

    const result = await applyProposal(crossTripProposal);
    expect(result).toEqual({ status: "not-found" });

    // Trip B's item must be exactly as it was — never touched by a
    // proposal that only ever claimed to be about Trip A.
    const reread = await getItem(itemB.id);
    expect(reread).toEqual(itemB);
    expect(reread?.bookingStatus).toBe("not_booked");
  });

  it("a correctly-scoped proposal (matching tripId) still applies normally — the fix doesn't break the ordinary case", async () => {
    const [dayA] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const itemA = await createItem(TRIP_A, dayA.id, {
      order: 0,
      crossesMidnight: false,
      newCalendarDay: false,
      category: "activity",
      title: "Trip A's own item",
      bookingStatus: "not_booked",
    });

    const proposal: ItineraryItemProposal = {
      kind: "itinerary-item-upsert",
      tripId: TRIP_A,
      dayId: dayA.id,
      itemId: itemA.id,
      expectedRevision: itemA.revision,
      changes: { bookingStatus: "confirmed" },
      rationale: "y",
    };

    const preview = await previewProposal(proposal);
    expect(preview.notFound).toBe(false);
    expect(preview.isStale).toBe(false);

    const result = await applyProposal(proposal);
    expect(result).toEqual({ status: "applied" });
    expect((await getItem(itemA.id))?.bookingStatus).toBe("confirmed");
  });
});
