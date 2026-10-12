import { describe, it, expect } from "vitest";
import { getAvailableAccommodationAdapters, getAvailableFoodAdapters, ACCOMMODATION_ADAPTERS, FOOD_ADAPTERS } from "../registry";
import type { AccommodationAdapter, FoodAdapter } from "../types";

/**
 * "integrate only providers for which valid access is available" — this
 * is the gate that enforces it. Exercised here against mock adapters
 * (not a real credentialed provider, since none exists this phase) to
 * prove the filtering logic itself is correct.
 */
describe("getAvailableAccommodationAdapters", () => {
  it("excludes an adapter that reports itself unavailable", () => {
    const available: AccommodationAdapter = {
      id: "available",
      label: "Available",
      checkAvailability: () => ({ available: true }),
      normalize: () => ({ ok: false, fieldErrors: {} }),
    };
    const unavailable: AccommodationAdapter = {
      id: "unavailable",
      label: "Unavailable",
      checkAvailability: () => ({ available: false, reason: "no API key configured" }),
      normalize: () => ({ ok: false, fieldErrors: {} }),
    };

    const result = getAvailableAccommodationAdapters([available, unavailable]);
    expect(result.map((a) => a.id)).toEqual(["available"]);
  });

  it("the real registry's default (manual) adapter is always available", () => {
    expect(getAvailableAccommodationAdapters()).toHaveLength(ACCOMMODATION_ADAPTERS.length);
  });
});

describe("getAvailableFoodAdapters", () => {
  it("excludes an adapter that reports itself unavailable", () => {
    const unavailable: FoodAdapter = {
      id: "unavailable",
      label: "Unavailable",
      checkAvailability: () => ({ available: false, reason: "no credentials" }),
      normalize: () => ({ ok: false, fieldErrors: {} }),
    };
    expect(getAvailableFoodAdapters([unavailable])).toHaveLength(0);
  });

  it("the real registry's default (manual) adapter is always available", () => {
    expect(getAvailableFoodAdapters()).toHaveLength(FOOD_ADAPTERS.length);
  });
});
