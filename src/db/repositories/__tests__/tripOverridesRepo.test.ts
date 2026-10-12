import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { createTrip } from "../tripsRepo";
import { getOverrideForTrip, upsertOverrideForTrip, clearOverrideForTrip } from "../tripOverridesRepo";
import { StaleRevisionError } from "../../../lib/errors";
import { resetTestDb } from "./testSupport";
import type { TripInput } from "../../../modules/trips/validation";

function sampleInput(overrides: Partial<TripInput> = {}): TripInput {
  return {
    name: "Trip",
    destination: "Somewhere",
    country: "Philippines",
    startDate: "2027-01-01",
    endDate: "2027-01-03",
    travelerCount: 2,
    ...overrides,
  };
}

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("tripOverridesRepo", () => {
  it("returns undefined for a trip with no override yet", async () => {
    const trip = await createTrip(sampleInput());
    expect(await getOverrideForTrip(trip.id)).toBeUndefined();
  });

  it("creates an override on first upsert, updates it on the second", async () => {
    const trip = await createTrip(sampleInput());

    const created = await upsertOverrideForTrip(trip.id, {
      currency: "PHP",
      budgetTargetMin: 5000,
      budgetTargetMax: 8000,
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });
    expect(created.revision).toBe(1);
    expect(created.tripId).toBe(trip.id);

    const updated = await upsertOverrideForTrip(
      trip.id,
      {
        currency: "PHP",
        budgetTargetMin: 5000,
        budgetTargetMax: 8000,
        mustHaveAmenities: ["pool", "breakfast"],
        hotelVsAirbnbOpen: true,
        rawOverrideText: "",
      },
      created.revision,
    );
    expect(updated.id).toBe(created.id); // same record, not a second one
    expect(updated.revision).toBe(2);
    expect(updated.mustHaveAmenities).toEqual(["pool", "breakfast"]);
  });

  it("rejects updating an existing override without the current revision", async () => {
    const trip = await createTrip(sampleInput());
    await upsertOverrideForTrip(trip.id, {
      currency: "PHP",
      mustHaveAmenities: [],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });
    await expect(
      upsertOverrideForTrip(trip.id, {
        currency: "PHP",
        mustHaveAmenities: ["spa"],
        hotelVsAirbnbOpen: true,
        rawOverrideText: "",
      }),
    ).rejects.toBeInstanceOf(StaleRevisionError);
  });

  it("clears an override, reverting the trip to profile-only inheritance", async () => {
    const trip = await createTrip(sampleInput());
    const created = await upsertOverrideForTrip(trip.id, {
      currency: "PHP",
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });

    await clearOverrideForTrip(trip.id, created.revision);
    expect(await getOverrideForTrip(trip.id)).toBeUndefined();
  });

  it("clearing a trip with no override is a harmless no-op", async () => {
    const trip = await createTrip(sampleInput());
    await expect(clearOverrideForTrip(trip.id, 1)).resolves.toBeUndefined();
  });

  it("keeps two trips' overrides fully isolated — no leakage through the by-trip index", async () => {
    const tripA = await createTrip(sampleInput({ name: "Trip A" }));
    const tripB = await createTrip(sampleInput({ name: "Trip B" }));

    await upsertOverrideForTrip(tripA.id, {
      currency: "PHP",
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "A's notes",
    });
    await upsertOverrideForTrip(tripB.id, {
      currency: "JPY",
      mustHaveAmenities: ["onsen"],
      hotelVsAirbnbOpen: false,
      rawOverrideText: "B's notes",
    });

    const overrideA = await getOverrideForTrip(tripA.id);
    const overrideB = await getOverrideForTrip(tripB.id);

    expect(overrideA!.tripId).toBe(tripA.id);
    expect(overrideA!.mustHaveAmenities).toEqual(["pool"]);
    expect(overrideB!.tripId).toBe(tripB.id);
    expect(overrideB!.mustHaveAmenities).toEqual(["onsen"]);

    // Editing A must never touch B.
    await upsertOverrideForTrip(
      tripA.id,
      {
        currency: "PHP",
        mustHaveAmenities: ["pool", "breakfast"],
        hotelVsAirbnbOpen: true,
        rawOverrideText: "A's updated notes",
      },
      overrideA!.revision,
    );
    const overrideBAfter = await getOverrideForTrip(tripB.id);
    expect(overrideBAfter).toEqual(overrideB);
  });
});
