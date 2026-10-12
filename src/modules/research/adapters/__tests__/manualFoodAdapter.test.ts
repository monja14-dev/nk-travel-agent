import { describe, it, expect } from "vitest";
import { manualFoodAdapter } from "../manualFoodAdapter";
import { assertNormalized } from "./assertNormalized";

describe("manualFoodAdapter — availability", () => {
  it("is always available", () => {
    expect(manualFoodAdapter.checkAvailability()).toEqual({ available: true });
  });
});

describe("manualFoodAdapter — normalization", () => {
  it("normalizes a fully-specified raw input, including a comma-separated dishes string", () => {
    const outcome = manualFoodAdapter.normalize({
      name: "  Aplaya Restaurant  ",
      category: "must-try",
      dishes: "Chicken inasal, Crispy pata, Kinilaw",
      cuisine: "Filipino",
      priceRange: "~400-700 PHP/person",
      location: "Station 1, Boracay",
      rating: "4.7",
      ratingScale: "5",
      reviewCount: "850",
      sourceUrl: "https://example.com/aplaya",
      sourceLabel: "Food blog",
      verificationStatus: "verified",
    });

    assertNormalized(outcome);
    expect(outcome.fieldErrors).toEqual({});
    expect(outcome.candidate).toMatchObject({
      name: "Aplaya Restaurant",
      category: "must-try",
      dishes: ["Chicken inasal", "Crispy pata", "Kinilaw"],
      cuisine: "Filipino",
      priceRange: "~400-700 PHP/person",
      rating: 4.7,
      reviewCount: 850,
    });
    expect(outcome.candidate?.attribution.verificationStatus).toBe("verified");
  });

  it("also accepts dishes as a real array (not just a comma string)", () => {
    const outcome = manualFoodAdapter.normalize({ name: "X", category: "budget-eats", dishes: ["Siopao", "Lumpia"] });
    assertNormalized(outcome);
    expect(outcome.candidate.dishes).toEqual(["Siopao", "Lumpia"]);
  });

  it("leaves dishes as an empty array (not an error) when none are known yet", () => {
    const outcome = manualFoodAdapter.normalize({ name: "X", category: "hidden-gems" });
    assertNormalized(outcome);
    expect(outcome.candidate.dishes).toEqual([]);
  });

  it("defaults attribution the same way the accommodation adapter does", () => {
    const outcome = manualFoodAdapter.normalize({ name: "X", category: "local-favorites" });
    assertNormalized(outcome);
    expect(outcome.candidate.attribution.sourceLabel).toBe("Manually researched");
    expect(outcome.candidate.attribution.verificationStatus).toBe("estimate");
  });
});

describe("manualFoodAdapter — missing/invalid fields", () => {
  it("fails when name is missing", () => {
    const outcome = manualFoodAdapter.normalize({ category: "must-try" });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.name).toBeTruthy();
  });

  it("fails when category is missing — unlike accommodation fields, this one has no safe default", () => {
    const outcome = manualFoodAdapter.normalize({ name: "X" });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.category).toBeTruthy();
  });

  it("fails when category isn't one of the five Food Hunter categories", () => {
    const outcome = manualFoodAdapter.normalize({ name: "X", category: "michelin-star" });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.category).toBeTruthy();
  });

  it("rejects a dishes value that's neither an array nor a string", () => {
    const outcome = manualFoodAdapter.normalize({ name: "X", category: "must-try", dishes: 42 });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.dishes).toBeTruthy();
  });

  it("rejects a non-numeric rating", () => {
    const outcome = manualFoodAdapter.normalize({ name: "X", category: "must-try", rating: "amazing" });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.rating).toBeTruthy();
  });
});
