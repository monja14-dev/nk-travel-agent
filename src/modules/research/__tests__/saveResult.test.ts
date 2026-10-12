import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../../db/client";
import { resetTestDb } from "../../../db/repositories/__tests__/testSupport";
import { saveAccommodationResult, saveFoodResult } from "../saveResult";
import { manualAccommodationAdapter } from "../adapters/manualAccommodationAdapter";
import { manualFoodAdapter } from "../adapters/manualFoodAdapter";
import { listAccommodationResultsForTrip } from "../../../db/repositories/accommodationResultsRepo";
import { listFoodResultsForTrip } from "../../../db/repositories/foodResultsRepo";
import type { AccommodationAdapter, FoodAdapter } from "../adapters/types";

const TRIP_A = "trip_a";

/** Simulates a provider adapter that's wired up but fails at the moment
 * it's actually called — e.g. a live API adapter whose request throws.
 * No such adapter exists for real in this phase (see docs/PHASE_LOG.md),
 * so this is how "provider failures" gets exercised without one. */
const throwingAccommodationAdapter: AccommodationAdapter = {
  id: "broken-provider",
  label: "Broken Test Provider",
  checkAvailability: () => ({ available: true }),
  normalize: () => {
    throw new Error("simulated provider outage");
  },
};

const throwingFoodAdapter: FoodAdapter = {
  id: "broken-provider",
  label: "Broken Test Provider",
  checkAvailability: () => ({ available: true }),
  normalize: () => {
    throw new Error("simulated provider outage");
  },
};

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("saveAccommodationResult", () => {
  it("saves a valid raw input end-to-end", async () => {
    const outcome = await saveAccommodationResult(TRIP_A, manualAccommodationAdapter, {
      name: "Henann Prime Beach Resort",
      pricePerNight: "6500",
      currency: "PHP",
    });
    expect(outcome.status).toBe("saved");
    if (outcome.status === "saved") {
      expect(outcome.result.name).toBe("Henann Prime Beach Resort");
    }
    expect(await listAccommodationResultsForTrip(TRIP_A)).toHaveLength(1);
  });

  it("reports missing fields as 'invalid' rather than throwing, and saves nothing", async () => {
    const outcome = await saveAccommodationResult(TRIP_A, manualAccommodationAdapter, {});
    expect(outcome.status).toBe("invalid");
    if (outcome.status === "invalid") {
      expect(outcome.fieldErrors.name).toBeTruthy();
    }
    expect(await listAccommodationResultsForTrip(TRIP_A)).toHaveLength(0);
  });

  it("reports a duplicate as 'duplicate' (not a thrown error) and doesn't create a second record", async () => {
    await saveAccommodationResult(TRIP_A, manualAccommodationAdapter, { name: "Shangri-La" });
    const outcome = await saveAccommodationResult(TRIP_A, manualAccommodationAdapter, { name: "SHANGRI-LA" });

    expect(outcome.status).toBe("duplicate");
    if (outcome.status === "duplicate") {
      expect(outcome.existingId).toBeTruthy();
    }
    expect(await listAccommodationResultsForTrip(TRIP_A)).toHaveLength(1);
  });

  it("handles a provider adapter that throws during normalize() without crashing or writing anything", async () => {
    const outcome = await saveAccommodationResult(TRIP_A, throwingAccommodationAdapter, { name: "Anything" });
    expect(outcome.status).toBe("adapter-error");
    if (outcome.status === "adapter-error") {
      expect(outcome.message).toContain("Broken Test Provider");
      expect(outcome.message).toContain("simulated provider outage");
    }
    expect(await listAccommodationResultsForTrip(TRIP_A)).toHaveLength(0);
  });
});

describe("saveFoodResult", () => {
  it("saves a valid raw input end-to-end", async () => {
    const outcome = await saveFoodResult(TRIP_A, manualFoodAdapter, { name: "Aplaya Restaurant", category: "must-try" });
    expect(outcome.status).toBe("saved");
    expect(await listFoodResultsForTrip(TRIP_A)).toHaveLength(1);
  });

  it("reports a duplicate across categories as 'duplicate'", async () => {
    await saveFoodResult(TRIP_A, manualFoodAdapter, { name: "Aplaya Restaurant", category: "must-try" });
    const outcome = await saveFoodResult(TRIP_A, manualFoodAdapter, { name: "aplaya restaurant", category: "budget-eats" });
    expect(outcome.status).toBe("duplicate");
    expect(await listFoodResultsForTrip(TRIP_A)).toHaveLength(1);
  });

  it("handles a provider adapter that throws during normalize()", async () => {
    const outcome = await saveFoodResult(TRIP_A, throwingFoodAdapter, { name: "Anything", category: "must-try" });
    expect(outcome.status).toBe("adapter-error");
    expect(await listFoodResultsForTrip(TRIP_A)).toHaveLength(0);
  });
});
