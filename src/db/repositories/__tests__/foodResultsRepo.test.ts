import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { resetTestDb } from "./testSupport";
import { createFoodResult, listFoodResultsForTrip, deleteFoodResult } from "../foodResultsRepo";
import { ValidationError, DuplicateResultError } from "../../../lib/errors";
import type { FoodResultInput } from "../../../modules/research/validation";

const TRIP_A = "trip_a";
const TRIP_B = "trip_b";

function sampleInput(overrides: Partial<FoodResultInput> = {}): FoodResultInput {
  return {
    name: "Aplaya Restaurant",
    category: "must-try",
    dishes: [],
    attribution: {
      sourceLabel: "Manually researched",
      verificationStatus: "estimate",
      retrievedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("foodResultsRepo — create/list", () => {
  it("creates a result with a stable id and revision 1", async () => {
    const result = await createFoodResult(TRIP_A, sampleInput());
    expect(result.id).toMatch(/^food_/);
    expect(result.revision).toBe(1);
  });

  it("lists only results for the requested trip", async () => {
    await createFoodResult(TRIP_A, sampleInput({ name: "Place A" }));
    await createFoodResult(TRIP_B, sampleInput({ name: "Place B" }));
    const forA = await listFoodResultsForTrip(TRIP_A);
    expect(forA).toHaveLength(1);
    expect(forA[0].name).toBe("Place A");
  });

  it("rejects invalid input and writes nothing", async () => {
    await expect(createFoodResult(TRIP_A, sampleInput({ name: "" }))).rejects.toBeInstanceOf(ValidationError);
    expect(await listFoodResultsForTrip(TRIP_A)).toHaveLength(0);
  });
});

describe("foodResultsRepo — duplicate detection", () => {
  it("rejects a second result whose name normalizes the same, even in a different category", async () => {
    const first = await createFoodResult(TRIP_A, sampleInput({ name: "Aplaya Restaurant", category: "must-try" }));

    await expect(
      createFoodResult(TRIP_A, sampleInput({ name: "aplaya restaurant", category: "budget-eats" })),
    ).rejects.toBeInstanceOf(DuplicateResultError);

    const results = await listFoodResultsForTrip(TRIP_A);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(first.id);
  });

  it("the same name is NOT a duplicate across two different trips", async () => {
    await createFoodResult(TRIP_A, sampleInput({ name: "Jollibee" }));
    const second = await createFoodResult(TRIP_B, sampleInput({ name: "Jollibee" }));
    expect(second.name).toBe("Jollibee");
  });
});

describe("foodResultsRepo — delete", () => {
  it("removes a result", async () => {
    const result = await createFoodResult(TRIP_A, sampleInput());
    await deleteFoodResult(result.id);
    expect(await listFoodResultsForTrip(TRIP_A)).toHaveLength(0);
  });

  it("is idempotent", async () => {
    await expect(deleteFoodResult("food_does-not-exist")).resolves.toBeUndefined();
  });
});
