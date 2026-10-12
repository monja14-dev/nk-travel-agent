import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../../db/client";
import { createTrip } from "../../../db/repositories/tripsRepo";
import { getOrCreateDefaultProfile, updateProfile } from "../../../db/repositories/travelerProfilesRepo";
import {
  upsertOverrideForTrip,
  getOverrideForTrip,
  clearOverrideForTrip,
} from "../../../db/repositories/tripOverridesRepo";
import { getEffectiveTripSettings } from "../effectiveSettings";
import { resetTestDb } from "../../../db/repositories/__tests__/testSupport";
import type { TripInput } from "../validation";

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

describe("profile inheritance — real repos through real IndexedDB", () => {
  it("a trip with no override inherits the couple's profile and app defaults", async () => {
    const trip = await createTrip(sampleInput());
    const profile = await getOrCreateDefaultProfile();
    const override = await getOverrideForTrip(trip.id);

    const effective = getEffectiveTripSettings(profile, override);

    expect(effective.priorityOrder).toEqual(profile.priorityOrder);
    expect(effective.pace).toBe(profile.pace);
    expect(effective.sources.budget).toBe("app-default");
    expect(effective.sources.mustHaveAmenities).toBe("app-default");
    expect(effective.mustHaveAmenities).toEqual([]);
  });

  it("a per-trip override takes precedence for that trip only, read back through real repos", async () => {
    const tripA = await createTrip(sampleInput({ name: "Trip A" }));
    const tripB = await createTrip(sampleInput({ name: "Trip B" }));
    const profile = await getOrCreateDefaultProfile();

    await upsertOverrideForTrip(tripA.id, {
      currency: "TWD",
      budgetTargetMin: 40000,
      budgetTargetMax: 60000,
      mustHaveAmenities: ["hot pot nearby"],
      hotelVsAirbnbOpen: false,
      rawOverrideText: "Taiwan trip specifics.",
    });

    const overrideA = await getOverrideForTrip(tripA.id);
    const overrideB = await getOverrideForTrip(tripB.id);

    const effectiveA = getEffectiveTripSettings(profile, overrideA);
    const effectiveB = getEffectiveTripSettings(profile, overrideB);

    // Trip A gets the override...
    expect(effectiveA.currency).toBe("TWD");
    expect(effectiveA.budgetTargetMax).toBe(60000);
    expect(effectiveA.mustHaveAmenities).toEqual(["hot pot nearby"]);
    expect(effectiveA.hotelVsAirbnbOpen).toBe(false);
    expect(effectiveA.sources.budget).toBe("override");

    // ...Trip B is completely unaffected, still on app defaults.
    expect(effectiveB.currency).toBe("PHP");
    expect(effectiveB.mustHaveAmenities).toEqual([]);
    expect(effectiveB.hotelVsAirbnbOpen).toBe(true);
    expect(effectiveB.sources.budget).toBe("app-default");

    // Both still see the same shared profile fields.
    expect(effectiveA.priorityOrder).toEqual(effectiveB.priorityOrder);
  });

  it("editing the shared profile changes every trip's effective settings; clearing an override reverts just that trip", async () => {
    const trip = await createTrip(sampleInput());
    const profileBefore = await getOrCreateDefaultProfile();

    const override = await upsertOverrideForTrip(trip.id, {
      currency: "JPY",
      mustHaveAmenities: ["onsen"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });

    const effectiveWithOverride = getEffectiveTripSettings(profileBefore, override);
    expect(effectiveWithOverride.sources.mustHaveAmenities).toBe("override");

    // Editing the profile is reflected immediately for this trip too, for
    // the fields the override doesn't touch.
    const updatedProfile = await updateProfile(profileBefore.id, { pace: "relaxed" }, profileBefore.revision);
    const effectiveAfterProfileEdit = getEffectiveTripSettings(updatedProfile, override);
    expect(effectiveAfterProfileEdit.pace).toBe("relaxed");
    expect(effectiveAfterProfileEdit.mustHaveAmenities).toEqual(["onsen"]); // override still holds

    // Clearing the override reverts this trip to profile/app defaults only.
    await clearOverrideForTrip(trip.id, override.revision);
    const overrideAfterClear = await getOverrideForTrip(trip.id);
    const effectiveAfterClear = getEffectiveTripSettings(updatedProfile, overrideAfterClear);

    expect(overrideAfterClear).toBeUndefined();
    expect(effectiveAfterClear.mustHaveAmenities).toEqual([]);
    expect(effectiveAfterClear.sources.mustHaveAmenities).toBe("app-default");
    expect(effectiveAfterClear.pace).toBe("relaxed"); // the profile edit persists
  });
});
