import { describe, it, expect } from "vitest";
import { manualAccommodationAdapter } from "../manualAccommodationAdapter";
import { assertNormalized } from "./assertNormalized";

describe("manualAccommodationAdapter — availability", () => {
  it("is always available (no network call of its own)", () => {
    expect(manualAccommodationAdapter.checkAvailability()).toEqual({ available: true });
  });
});

describe("manualAccommodationAdapter — normalization", () => {
  it("normalizes a fully-specified raw input, coercing numeric strings and defaulting attribution", () => {
    const outcome = manualAccommodationAdapter.normalize({
      name: "  Henann Prime Beach Resort  ",
      propertyType: "resort",
      location: "Station 2, Boracay",
      mapUrl: "https://maps.example.com/henann",
      pricePerNight: "6500", // a form field — comes in as a string
      currency: "PHP",
      mandatoryFees: [{ label: "Environmental fee", amount: "100", currency: "PHP" }],
      cancellationPolicy: "Free cancellation up to 48 hours before check-in.",
      rating: "4.5",
      ratingScale: "5",
      reviewCount: "1200",
      notes: "Beachfront, good reviews for cleanliness.",
      sourceUrl: "https://example.com/henann-review",
      sourceLabel: "Travel blog",
      verificationStatus: "estimate",
    });

    assertNormalized(outcome);
    expect(outcome.fieldErrors).toEqual({});
    expect(outcome.candidate).toMatchObject({
      name: "Henann Prime Beach Resort", // the repo trims again on save; the adapter already coerces this cleanly
      propertyType: "resort",
      location: "Station 2, Boracay",
      pricePerNight: 6500,
      currency: "PHP",
      rating: 4.5,
      ratingScale: 5,
      reviewCount: 1200,
    });
    expect(outcome.candidate?.mandatoryFees).toEqual([{ label: "Environmental fee", amount: 100, currency: "PHP", notes: undefined }]);
    expect(outcome.candidate?.attribution.sourceLabel).toBe("Travel blog");
    expect(outcome.candidate?.attribution.verificationStatus).toBe("estimate");
  });

  it("defaults sourceLabel, verificationStatus, and retrievedAt when not provided", () => {
    const before = Date.now();
    const outcome = manualAccommodationAdapter.normalize({ name: "Some Hotel" });
    const after = Date.now();

    assertNormalized(outcome);
    expect(outcome.candidate.attribution.sourceLabel).toBe("Manually researched");
    expect(outcome.candidate.attribution.verificationStatus).toBe("estimate");
    const retrievedMs = new Date(outcome.candidate.attribution.retrievedAt).getTime();
    expect(retrievedMs).toBeGreaterThanOrEqual(before);
    expect(retrievedMs).toBeLessThanOrEqual(after);
  });

  it("leaves unresearched fields genuinely absent rather than defaulting them to a fabricated value", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "Some Hotel" });
    assertNormalized(outcome);
    expect(outcome.candidate.pricePerNight).toBeUndefined();
    expect(outcome.candidate.rating).toBeUndefined();
    expect(outcome.candidate.cancellationPolicy).toBeUndefined();
    expect(outcome.candidate.mandatoryFees).toEqual([]);
  });
});

describe("manualAccommodationAdapter — missing/invalid fields", () => {
  it("fails when name is missing", () => {
    const outcome = manualAccommodationAdapter.normalize({});
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.name).toBeTruthy();
  });

  it("fails when name is only whitespace", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "   " });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.name).toBeTruthy();
  });

  it("reports a field error (not a silent drop) when pricePerNight isn't a number", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "Hotel X", pricePerNight: "cheap" });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.pricePerNight).toBeTruthy();
  });

  it("requires currency when pricePerNight is given", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "Hotel X", pricePerNight: 5000 });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.currency).toBeTruthy();
  });

  it("rejects a rating that exceeds its own stated scale", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "Hotel X", rating: 9, ratingScale: 5 });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.rating).toBeTruthy();
  });

  it("rejects an unrecognized propertyType", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "Hotel X", propertyType: "spaceship" });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors.propertyType).toBeTruthy();
  });

  it("rejects a malformed mandatory fee entry (missing label)", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "Hotel X", mandatoryFees: [{ amount: 100 }] });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors["mandatoryFees[0].label"]).toBeTruthy();
  });

  it("rejects a negative mandatory fee amount", () => {
    const outcome = manualAccommodationAdapter.normalize({
      name: "Hotel X",
      mandatoryFees: [{ label: "Resort fee", amount: -5 }],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors["mandatoryFees[0].amount"]).toBeTruthy();
  });

  it("rejects a sourceUrl that doesn't look like a URL", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "Hotel X", sourceUrl: "not a url" });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors["attribution.sourceUrl"]).toBeTruthy();
  });

  it("rejects an unrecognized verificationStatus", () => {
    const outcome = manualAccommodationAdapter.normalize({ name: "Hotel X", verificationStatus: "guaranteed" });
    expect(outcome.ok).toBe(false);
    expect(outcome.fieldErrors["attribution.verificationStatus"]).toBeTruthy();
  });
});
