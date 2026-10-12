import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { resetTestDb } from "./testSupport";
import {
  createAccommodationResult,
  listAccommodationResultsForTrip,
  deleteAccommodationResult,
} from "../accommodationResultsRepo";
import { ValidationError, DuplicateResultError } from "../../../lib/errors";
import type { AccommodationResultInput } from "../../../modules/research/validation";

const TRIP_A = "trip_a";
const TRIP_B = "trip_b";

function sampleInput(overrides: Partial<AccommodationResultInput> = {}): AccommodationResultInput {
  return {
    name: "Henann Prime Beach Resort",
    mandatoryFees: [],
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

describe("accommodationResultsRepo — create/list", () => {
  it("creates a result with a stable id and revision 1", async () => {
    const result = await createAccommodationResult(TRIP_A, sampleInput());
    expect(result.id).toMatch(/^accom_/);
    expect(result.revision).toBe(1);
    expect(result.tripId).toBe(TRIP_A);
  });

  it("lists only results for the requested trip (cross-trip isolation)", async () => {
    await createAccommodationResult(TRIP_A, sampleInput({ name: "Hotel A" }));
    await createAccommodationResult(TRIP_B, sampleInput({ name: "Hotel B" }));

    const forA = await listAccommodationResultsForTrip(TRIP_A);
    expect(forA).toHaveLength(1);
    expect(forA[0].name).toBe("Hotel A");
  });

  it("rejects invalid input and writes nothing", async () => {
    await expect(createAccommodationResult(TRIP_A, sampleInput({ name: "" }))).rejects.toBeInstanceOf(ValidationError);
    expect(await listAccommodationResultsForTrip(TRIP_A)).toHaveLength(0);
  });

  it("leaves no partial record behind when a cross-field validation fails (price without currency)", async () => {
    await expect(
      createAccommodationResult(TRIP_A, sampleInput({ pricePerNight: 5000, currency: undefined })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await listAccommodationResultsForTrip(TRIP_A)).toHaveLength(0);
  });
});

describe("accommodationResultsRepo — duplicate detection", () => {
  it("rejects a second result whose name normalizes the same as an existing one for this trip", async () => {
    const first = await createAccommodationResult(TRIP_A, sampleInput({ name: "Henann Prime Beach Resort" }));

    await expect(
      createAccommodationResult(TRIP_A, sampleInput({ name: "  HENANN PRIME BEACH RESORT  " })),
    ).rejects.toBeInstanceOf(DuplicateResultError);

    // Nothing was added — still just the one original result.
    const results = await listAccommodationResultsForTrip(TRIP_A);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(first.id);
  });

  it("the same name is NOT a duplicate across two different trips", async () => {
    await createAccommodationResult(TRIP_A, sampleInput({ name: "Same Hotel" }));
    const second = await createAccommodationResult(TRIP_B, sampleInput({ name: "Same Hotel" }));
    expect(second.name).toBe("Same Hotel");
  });

  it("a DuplicateResultError carries the existing record's id", async () => {
    const first = await createAccommodationResult(TRIP_A, sampleInput({ name: "Shangri-La" }));
    try {
      await createAccommodationResult(TRIP_A, sampleInput({ name: "Shangri-La" }));
      expect.fail("expected a DuplicateResultError");
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateResultError);
      expect((err as DuplicateResultError).existingId).toBe(first.id);
    }
  });
});

describe("accommodationResultsRepo — delete", () => {
  it("removes a result", async () => {
    const result = await createAccommodationResult(TRIP_A, sampleInput());
    await deleteAccommodationResult(result.id);
    expect(await listAccommodationResultsForTrip(TRIP_A)).toHaveLength(0);
  });

  it("is idempotent — deleting an already-gone id is not an error", async () => {
    await expect(deleteAccommodationResult("accom_does-not-exist")).resolves.toBeUndefined();
  });
});
