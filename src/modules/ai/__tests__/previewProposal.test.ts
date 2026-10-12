import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../../db/client";
import { createTrip, updateTrip } from "../../../db/repositories/tripsRepo";
import { upsertOverrideForTrip } from "../../../db/repositories/tripOverridesRepo";
import { previewProposal } from "../previewProposal";
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

describe("previewProposal — trip-update", () => {
  it("reports not stale and the real from/to values for a current proposal", async () => {
    const trip = await createTrip(sampleTripInput());
    const proposal: TripUpdateProposal = {
      kind: "trip-update",
      tripId: trip.id,
      expectedRevision: trip.revision,
      changes: { name: "Japan Trip (Updated)", travelerCount: 3 },
      rationale: "why",
    };

    const preview = await previewProposal(proposal);
    expect(preview.notFound).toBe(false);
    expect(preview.isStale).toBe(false);
    expect(preview.currentRevision).toBe(trip.revision);
    expect(preview.changes).toEqual(
      expect.arrayContaining([
        { field: "name", from: "Japan Trip", to: "Japan Trip (Updated)" },
        { field: "travelerCount", from: 2, to: 3 },
      ]),
    );
  });

  it("reports stale when the trip has moved on since the proposal's expectedRevision", async () => {
    const trip = await createTrip(sampleTripInput());
    await updateTrip(trip.id, { name: "Renamed" }, trip.revision);

    const proposal: TripUpdateProposal = {
      kind: "trip-update",
      tripId: trip.id,
      expectedRevision: trip.revision, // now stale
      changes: { name: "Something else" },
      rationale: "why",
    };

    const preview = await previewProposal(proposal);
    expect(preview.isStale).toBe(true);
  });

  it("reports notFound for a trip that doesn't exist", async () => {
    const proposal: TripUpdateProposal = {
      kind: "trip-update",
      tripId: "trip_nope",
      expectedRevision: 1,
      changes: { name: "x" },
      rationale: "y",
    };
    const preview = await previewProposal(proposal);
    expect(preview.notFound).toBe(true);
  });
});

describe("previewProposal — trip-override-upsert", () => {
  it("reports not stale when no override exists and expectedRevision is null", async () => {
    const trip = await createTrip(sampleTripInput());
    const proposal: TripOverrideProposal = {
      kind: "trip-override-upsert",
      tripId: trip.id,
      expectedRevision: null,
      changes: { currency: "JPY" },
      rationale: "why",
    };

    const preview = await previewProposal(proposal);
    expect(preview.isStale).toBe(false);
    expect(preview.currentRevision).toBeNull();
    expect(preview.changes).toEqual([{ field: "currency", from: undefined, to: "JPY" }]);
  });

  it("reports stale when the override's revision has moved on", async () => {
    const trip = await createTrip(sampleTripInput());
    const created = await upsertOverrideForTrip(trip.id, {
      currency: "PHP",
      mustHaveAmenities: [],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });

    const proposal: TripOverrideProposal = {
      kind: "trip-override-upsert",
      tripId: trip.id,
      expectedRevision: created.revision + 1, // doesn't match the real current revision
      changes: { currency: "JPY" },
      rationale: "why",
    };

    const preview = await previewProposal(proposal);
    expect(preview.isStale).toBe(true);
    expect(preview.currentRevision).toBe(created.revision);
  });
});
