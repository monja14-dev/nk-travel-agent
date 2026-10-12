import { describe, it, expect } from "vitest";
import { getEffectiveTripSettings } from "../effectiveSettings";
import type { TravelerProfile, TripOverride } from "../../../db/schema";

function makeProfile(overrides: Partial<TravelerProfile> = {}): TravelerProfile {
  return {
    id: "profile-default",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    name: "NK Couple Profile",
    priorityOrder: ["experience", "value", "quality", "convenience", "authenticity", "comfort", "photography"],
    accommodationPreferences: "Clean, comfortable, well-located 3-4 star or well-reviewed Airbnb.",
    foodPreferences: "Authentic local food, not just tourist spots.",
    pace: "comfortable",
    rawProfileText: "Value for money, not lowest price.",
    ...overrides,
  };
}

function makeOverride(overrides: Partial<TripOverride> = {}): TripOverride {
  return {
    id: "override-1",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tripId: "trip-1",
    currency: "PHP",
    mustHaveAmenities: [],
    hotelVsAirbnbOpen: true,
    rawOverrideText: "",
    ...overrides,
  };
}

describe("getEffectiveTripSettings", () => {
  it("falls back entirely to the profile when there is no override", () => {
    const profile = makeProfile();
    const result = getEffectiveTripSettings(profile, undefined);

    expect(result.priorityOrder).toEqual(profile.priorityOrder);
    expect(result.pace).toBe("comfortable");
    expect(result.mustHaveAmenities).toEqual([]);
    expect(result.hotelVsAirbnbOpen).toBe(true);
    expect(result.budgetTargetMin).toBeUndefined();
    expect(result.sources.budget).toBe("app-default");
    expect(result.sources.mustHaveAmenities).toBe("app-default");
  });

  it("lets a per-trip override take precedence for overridable fields", () => {
    const profile = makeProfile();
    const override = makeOverride({
      budgetTargetMin: 5000,
      budgetTargetMax: 8000,
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: false,
    });

    const result = getEffectiveTripSettings(profile, override);

    expect(result.budgetTargetMin).toBe(5000);
    expect(result.budgetTargetMax).toBe(8000);
    expect(result.mustHaveAmenities).toEqual(["pool"]);
    expect(result.hotelVsAirbnbOpen).toBe(false);
    expect(result.sources.budget).toBe("override");
    expect(result.sources.mustHaveAmenities).toBe("override");
    expect(result.sources.hotelVsAirbnbOpen).toBe("override");

    // Fields with no override mechanism still come from the profile even
    // when an override record exists for other fields.
    expect(result.priorityOrder).toEqual(profile.priorityOrder);
    expect(result.pace).toBe(profile.pace);
  });

  it("does not mutate the profile or override objects it reads", () => {
    const profile = makeProfile();
    const override = makeOverride({ mustHaveAmenities: ["pool"] });
    const profileSnapshot = JSON.stringify(profile);
    const overrideSnapshot = JSON.stringify(override);

    getEffectiveTripSettings(profile, override);

    expect(JSON.stringify(profile)).toBe(profileSnapshot);
    expect(JSON.stringify(override)).toBe(overrideSnapshot);
  });
});
