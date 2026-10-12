import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../../db/client";
import { createTrip, getTrip, updateTrip } from "../../../db/repositories/tripsRepo";
import { getOverrideForTrip, upsertOverrideForTrip } from "../../../db/repositories/tripOverridesRepo";
import { applyProposal } from "../applyProposal";
import { resetTestDb } from "../../../db/repositories/__tests__/testSupport";
import type { TripInput } from "../../trips/validation";
import type { TripUpdateProposal, TripOverrideProposal } from "../types";

function sampleTripInput(overrides: Partial<TripInput> = {}): TripInput {
  return {
    name: "Japan Trip",
    destination: "Tokyo",
    country: "Japan",
    startDate: "2027-02-22",
    endDate: "2027-02-26",
    travelerCount: 2,
    ...overrides,
  };
}

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("applyProposal — trip-update", () => {
  it("applies a valid, non-stale proposal", async () => {
    const trip = await createTrip(sampleTripInput());
    const proposal: TripUpdateProposal = {
      kind: "trip-update",
      tripId: trip.id,
      expectedRevision: trip.revision,
      changes: { notes: "Book teamLab tickets early." },
      rationale: "Popular exhibits sell out.",
    };

    const result = await applyProposal(proposal);
    expect(result).toEqual({ status: "applied" });

    const updated = await getTrip(trip.id);
    expect(updated?.notes).toBe("Book teamLab tickets early.");
    expect(updated?.revision).toBe(trip.revision + 1);
  });

  it("rejects a stale proposal — the trip changed after the AI generated it — and leaves the trip untouched", async () => {
    const trip = await createTrip(sampleTripInput());

    // Simulate something else (the person editing the trip directly)
    // moving the trip's revision on after the AI computed its proposal
    // against the original revision.
    const afterDirectEdit = await updateTrip(trip.id, { name: "Japan Trip (renamed)" }, trip.revision);

    const staleProposal: TripUpdateProposal = {
      kind: "trip-update",
      tripId: trip.id,
      expectedRevision: trip.revision, // stale — the trip has since moved to afterDirectEdit.revision
      changes: { notes: "This should never be written." },
      rationale: "Stale rationale.",
    };

    const result = await applyProposal(staleProposal);
    expect(result).toEqual({ status: "stale" });

    const current = await getTrip(trip.id);
    expect(current).toEqual(afterDirectEdit);
    expect(current?.notes).toBeUndefined();
  });

  it("reports not-found for a trip id that doesn't exist", async () => {
    const proposal: TripUpdateProposal = {
      kind: "trip-update",
      tripId: "trip_does-not-exist",
      expectedRevision: 1,
      changes: { notes: "x" },
      rationale: "y",
    };
    const result = await applyProposal(proposal);
    expect(result).toEqual({ status: "not-found" });
  });

  it("reports invalid for a proposal whose changes fail validation, and writes nothing", async () => {
    const trip = await createTrip(sampleTripInput());
    const proposal: TripUpdateProposal = {
      kind: "trip-update",
      tripId: trip.id,
      expectedRevision: trip.revision,
      changes: { endDate: "2020-01-01" }, // before the trip's startDate
      rationale: "Bad proposal.",
    };

    const result = await applyProposal(proposal);
    expect(result.status).toBe("invalid");

    const current = await getTrip(trip.id);
    expect(current).toEqual(trip);
  });
});

describe("applyProposal — trip-override-upsert", () => {
  it("creates a new override when none exists and expectedRevision is null", async () => {
    const trip = await createTrip(sampleTripInput());
    const proposal: TripOverrideProposal = {
      kind: "trip-override-upsert",
      tripId: trip.id,
      expectedRevision: null,
      changes: { currency: "JPY", budgetTargetMin: 100000, mustHaveAmenities: ["onsen"] },
      rationale: "Matches what you said about budget.",
    };

    const result = await applyProposal(proposal);
    expect(result).toEqual({ status: "applied" });

    const override = await getOverrideForTrip(trip.id);
    expect(override?.currency).toBe("JPY");
    expect(override?.budgetTargetMin).toBe(100000);
    expect(override?.mustHaveAmenities).toEqual(["onsen"]);
    expect(override?.revision).toBe(1);
  });

  it("rejects a stale override proposal (expected null, but one now exists) without modifying it", async () => {
    const trip = await createTrip(sampleTripInput());
    const existing = await upsertOverrideForTrip(trip.id, {
      currency: "PHP",
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });

    const staleProposal: TripOverrideProposal = {
      kind: "trip-override-upsert",
      tripId: trip.id,
      expectedRevision: null, // stale — an override now exists
      changes: { currency: "JPY" },
      rationale: "Stale.",
    };

    const result = await applyProposal(staleProposal);
    expect(result).toEqual({ status: "stale" });

    const current = await getOverrideForTrip(trip.id);
    expect(current).toEqual(existing);
  });

  it("rejects a stale override proposal (revision moved on) without modifying it", async () => {
    const trip = await createTrip(sampleTripInput());
    const created = await upsertOverrideForTrip(trip.id, {
      currency: "PHP",
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });
    const afterDirectEdit = await upsertOverrideForTrip(
      trip.id,
      { currency: "PHP", mustHaveAmenities: ["pool", "breakfast"], hotelVsAirbnbOpen: true, rawOverrideText: "" },
      created.revision,
    );

    const staleProposal: TripOverrideProposal = {
      kind: "trip-override-upsert",
      tripId: trip.id,
      expectedRevision: created.revision, // stale — it's since moved to afterDirectEdit.revision
      changes: { currency: "JPY" },
      rationale: "Stale.",
    };

    const result = await applyProposal(staleProposal);
    expect(result).toEqual({ status: "stale" });

    const current = await getOverrideForTrip(trip.id);
    expect(current).toEqual(afterDirectEdit);
  });

  it("merges a partial proposal onto the existing override, preserving fields it doesn't mention", async () => {
    const trip = await createTrip(sampleTripInput());
    const existing = await upsertOverrideForTrip(trip.id, {
      currency: "PHP",
      budgetTargetMin: 40000,
      budgetTargetMax: 60000,
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "Original notes.",
    });

    const proposal: TripOverrideProposal = {
      kind: "trip-override-upsert",
      tripId: trip.id,
      expectedRevision: existing.revision,
      changes: { budgetTargetMax: 70000 }, // only this one field
      rationale: "A bit more flexibility.",
    };

    const result = await applyProposal(proposal);
    expect(result).toEqual({ status: "applied" });

    const updated = await getOverrideForTrip(trip.id);
    expect(updated?.budgetTargetMax).toBe(70000);
    // Everything else preserved, not wiped by the partial proposal.
    expect(updated?.currency).toBe("PHP");
    expect(updated?.budgetTargetMin).toBe(40000);
    expect(updated?.mustHaveAmenities).toEqual(["pool"]);
    expect(updated?.hotelVsAirbnbOpen).toBe(true);
    expect(updated?.rawOverrideText).toBe("Original notes.");
  });
});
