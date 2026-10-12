import { describe, it, expect } from "vitest";
import {
  buildTripContextSnapshot,
  buildProfileContextSnapshot,
  buildOverrideContextSnapshot,
} from "../buildContext";
import type { Trip, TravelerProfile, TripOverride } from "../../../db/schema";

const now = "2026-01-01T00:00:00.000Z";

describe("buildContext snapshots", () => {
  it("builds a trip snapshot with only the fields the gateway needs", () => {
    const trip: Trip = {
      id: "trip_1",
      revision: 2,
      createdAt: now,
      updatedAt: now,
      name: "Japan Trip",
      destination: "Tokyo",
      country: "Japan",
      startDate: "2027-02-22",
      endDate: "2027-02-26",
      travelerCount: 2,
      roomCount: 1,
      status: "planning",
      notes: "Bring jackets.",
    };
    expect(buildTripContextSnapshot(trip)).toEqual({
      id: "trip_1",
      revision: 2,
      name: "Japan Trip",
      destination: "Tokyo",
      country: "Japan",
      startDate: "2027-02-22",
      endDate: "2027-02-26",
      travelerCount: 2,
      roomCount: 1,
      status: "planning",
      notes: "Bring jackets.",
    });
  });

  it("builds a profile snapshot", () => {
    const profile: TravelerProfile = {
      id: "profile-default",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      name: "NK Couple Profile",
      priorityOrder: ["experience", "value"],
      accommodationPreferences: "Clean and comfortable.",
      foodPreferences: "Authentic local food.",
      pace: "comfortable",
      rawProfileText: "Value for money.",
    };
    expect(buildProfileContextSnapshot(profile)).toEqual({
      revision: 1,
      priorityOrder: ["experience", "value"],
      accommodationPreferences: "Clean and comfortable.",
      foodPreferences: "Authentic local food.",
      pace: "comfortable",
    });
  });

  it("builds an override snapshot when one exists", () => {
    const override: TripOverride = {
      id: "override_1",
      tripId: "trip_1",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      budgetTargetMin: 40000,
      budgetTargetMax: 60000,
      currency: "PHP",
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    };
    expect(buildOverrideContextSnapshot(override)).toEqual({
      revision: 1,
      currency: "PHP",
      budgetTargetMin: 40000,
      budgetTargetMax: 60000,
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
    });
  });

  it("returns null when there's no override", () => {
    expect(buildOverrideContextSnapshot(undefined)).toBeNull();
  });
});
