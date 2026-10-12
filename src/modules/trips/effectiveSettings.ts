import type { TravelerProfile, TripOverride } from "../../db/schema";

/**
 * What "inheritance" actually means in this app: a trip has no settings
 * of its own by default — it reads the couple's TravelerProfile. A
 * TripOverride, when one exists for that trip, takes precedence field by
 * field, per the master prompt's rule that trip-specific instructions
 * override the general profile for that trip only, without changing the
 * profile itself.
 *
 * Pure and DB-free on purpose: it's the one piece of "business logic" in
 * this phase worth unit-testing in isolation from IndexedDB.
 */

export type SettingSource = "override" | "app-default";

export interface EffectiveTripSettings {
  priorityOrder: string[];
  accommodationPreferences: string;
  foodPreferences: string;
  pace: TravelerProfile["pace"];
  currency: string;
  budgetTargetMin?: number;
  budgetTargetMax?: number;
  mustHaveAmenities: string[];
  hotelVsAirbnbOpen: boolean;
  /**
   * Note: these have no profile-level fallback in the schema at all
   * (TravelerProfile carries no budget/amenity/lodging-type fields) — the
   * non-override value is a hardcoded app default, not something read
   * from the profile. Only priorityOrder/accommodationPreferences/
   * foodPreferences/pace actually come from the profile, and they have
   * no override mechanism yet, so they aren't listed here.
   */
  sources: {
    budget: SettingSource;
    mustHaveAmenities: SettingSource;
    hotelVsAirbnbOpen: SettingSource;
  };
}

const DEFAULT_CURRENCY = "PHP";

export function getEffectiveTripSettings(
  profile: TravelerProfile,
  override: TripOverride | undefined,
): EffectiveTripSettings {
  const hasBudgetOverride =
    override !== undefined &&
    (override.budgetTargetMin !== undefined || override.budgetTargetMax !== undefined);

  return {
    // These four currently have no per-trip override mechanism in the
    // schema — they always come from the profile. Listed explicitly
    // (not spread) so adding a trip-level override for one later is a
    // one-line change here, not a silent gap.
    priorityOrder: profile.priorityOrder,
    accommodationPreferences: profile.accommodationPreferences,
    foodPreferences: profile.foodPreferences,
    pace: profile.pace,

    currency: override?.currency ?? DEFAULT_CURRENCY,
    budgetTargetMin: hasBudgetOverride ? override!.budgetTargetMin : undefined,
    budgetTargetMax: hasBudgetOverride ? override!.budgetTargetMax : undefined,
    mustHaveAmenities: override ? override.mustHaveAmenities : [],
    hotelVsAirbnbOpen: override ? override.hotelVsAirbnbOpen : true,

    sources: {
      budget: hasBudgetOverride ? "override" : "app-default",
      mustHaveAmenities: override ? "override" : "app-default",
      hotelVsAirbnbOpen: override ? "override" : "app-default",
    },
  };
}
