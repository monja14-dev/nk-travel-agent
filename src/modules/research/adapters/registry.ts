import { manualAccommodationAdapter } from "./manualAccommodationAdapter";
import { manualFoodAdapter } from "./manualFoodAdapter";
import type { AccommodationAdapter, FoodAdapter } from "./types";

/**
 * The full set of adapters this app knows about, available or not. Per
 * the owner's explicit decision this phase ("no live providers yet"),
 * the only entry is the manual one — see docs/PHASE_LOG.md for what a
 * future live adapter (e.g. one backed by a Google Places API key)
 * would need to implement, and why none is stubbed in here: a disabled
 * adapter with no real `normalize()` behind it would be dead code
 * pretending to be a feature.
 */
export const ACCOMMODATION_ADAPTERS: AccommodationAdapter[] = [manualAccommodationAdapter];
export const FOOD_ADAPTERS: FoodAdapter[] = [manualFoodAdapter];

/**
 * "integrate only providers for which valid access is available" — this
 * is the one gate that decides it, checked at call time (not baked into
 * the list above) so an adapter whose credentials are removed later
 * disappears from the UI without a code change. The `adapters` parameter
 * defaults to the real registry for every real caller, but lets tests
 * exercise the gating logic itself against a mock adapter (e.g. one that
 * reports itself unavailable, or one whose `normalize()` throws to
 * simulate a provider failure) without needing a real credentialed
 * provider to exist.
 */
export function getAvailableAccommodationAdapters(
  adapters: AccommodationAdapter[] = ACCOMMODATION_ADAPTERS,
): AccommodationAdapter[] {
  return adapters.filter((adapter) => adapter.checkAvailability().available);
}

export function getAvailableFoodAdapters(adapters: FoodAdapter[] = FOOD_ADAPTERS): FoodAdapter[] {
  return adapters.filter((adapter) => adapter.checkAvailability().available);
}
