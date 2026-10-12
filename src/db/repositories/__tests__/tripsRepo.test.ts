import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import {
  createTrip,
  getTrip,
  listTrips,
  updateTrip,
  archiveTrip,
  unarchiveTrip,
  duplicateTrip,
} from "../tripsRepo";
import { upsertOverrideForTrip, getOverrideForTrip } from "../tripOverridesRepo";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../../lib/errors";
import { resetTestDb } from "./testSupport";
import type { TripInput } from "../../../modules/trips/validation";

function sampleInput(overrides: Partial<TripInput> = {}): TripInput {
  return {
    name: "Boracay Honeymoon",
    destination: "Boracay",
    country: "Philippines",
    startDate: "2027-02-10",
    endDate: "2027-02-13",
    travelerCount: 2,
    roomCount: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("tripsRepo — CRUD", () => {
  it("creates a trip with a stable id, revision 1, and status 'planning'", async () => {
    const trip = await createTrip(sampleInput());
    expect(trip.id).toMatch(/^trip_/);
    expect(trip.revision).toBe(1);
    expect(trip.status).toBe("planning");
    expect(trip.name).toBe("Boracay Honeymoon");
  });

  it("rejects an invalid trip and writes nothing", async () => {
    await expect(createTrip(sampleInput({ name: "" }))).rejects.toBeInstanceOf(ValidationError);
    expect(await listTrips({ includeArchived: true })).toHaveLength(0);
  });

  it("reads back a created trip by id", async () => {
    const trip = await createTrip(sampleInput());
    const fetched = await getTrip(trip.id);
    expect(fetched).toEqual(trip);
  });

  it("returns undefined for a trip that doesn't exist", async () => {
    expect(await getTrip("trip_does-not-exist")).toBeUndefined();
  });

  it("updates a trip, bumping its revision and updatedAt", async () => {
    const trip = await createTrip(sampleInput());
    // nowIso() has millisecond resolution; on a fast machine the create and
    // update below can otherwise land in the same millisecond, making this
    // assertion flaky even though the real conflict-detection field
    // (revision) is correct either way. A tiny delay makes the clock tick.
    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = await updateTrip(trip.id, { name: "Boracay Honeymoon (Updated)" }, trip.revision);

    expect(updated.revision).toBe(2);
    expect(updated.name).toBe("Boracay Honeymoon (Updated)");
    expect(updated.updatedAt).not.toBe(trip.updatedAt);
    // Unchanged fields are preserved, not wiped by a partial update.
    expect(updated.destination).toBe(trip.destination);
  });

  it("rejects an update with a validation error and leaves the stored record untouched", async () => {
    const trip = await createTrip(sampleInput());
    await expect(updateTrip(trip.id, { travelerCount: 0 }, trip.revision)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await getTrip(trip.id)).toEqual(trip);
  });

  it("rejects updating a trip that doesn't exist", async () => {
    await expect(updateTrip("trip_nope", { name: "x" }, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a stale write and does not corrupt the record that won the race", async () => {
    const trip = await createTrip(sampleInput());
    const afterFirstEdit = await updateTrip(trip.id, { name: "First edit" }, trip.revision);

    // Simulates a second tab/device still holding the old revision.
    await expect(updateTrip(trip.id, { name: "Stale edit" }, trip.revision)).rejects.toBeInstanceOf(
      StaleRevisionError,
    );

    const final = await getTrip(trip.id);
    expect(final).toEqual(afterFirstEdit);
    expect(final?.name).toBe("First edit");
  });
});

describe("tripsRepo — listing", () => {
  it("shows an empty list with nothing created", async () => {
    expect(await listTrips()).toEqual([]);
  });

  it("excludes archived trips by default, includes them with includeArchived", async () => {
    const active = await createTrip(sampleInput({ name: "Active Trip" }));
    const toArchive = await createTrip(sampleInput({ name: "Will Be Archived" }));
    await archiveTrip(toArchive.id, toArchive.revision);

    const defaultList = await listTrips();
    expect(defaultList.map((t) => t.id)).toEqual([active.id]);

    const fullList = await listTrips({ includeArchived: true });
    expect(fullList.map((t) => t.id).sort()).toEqual([active.id, toArchive.id].sort());
  });
});

describe("tripsRepo — archiving", () => {
  it("archives and then unarchives a trip", async () => {
    const trip = await createTrip(sampleInput());
    const archived = await archiveTrip(trip.id, trip.revision);
    expect(archived.status).toBe("archived");
    expect((await listTrips()).map((t) => t.id)).not.toContain(trip.id);

    const unarchived = await unarchiveTrip(archived.id, archived.revision);
    expect(unarchived.status).toBe("planning");
    expect((await listTrips()).map((t) => t.id)).toContain(trip.id);
  });
});

describe("tripsRepo — duplication and cross-trip isolation", () => {
  it("creates an independent copy with a new id and '(Copy)' name", async () => {
    const original = await createTrip(sampleInput());
    const copy = await duplicateTrip(original.id);

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe(`${original.name} (Copy)`);
    expect(copy.status).toBe("planning");
    expect(copy.revision).toBe(1);
    // Original is untouched by the act of duplicating it.
    expect(await getTrip(original.id)).toEqual(original);
  });

  it("copies the trip's override to the duplicate, as an independent record", async () => {
    const original = await createTrip(sampleInput());
    await upsertOverrideForTrip(original.id, {
      currency: "PHP",
      budgetTargetMin: 5000,
      budgetTargetMax: 8000,
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "Must have a pool.",
    });

    const copy = await duplicateTrip(original.id);
    const copyOverride = await getOverrideForTrip(copy.id);
    const originalOverride = await getOverrideForTrip(original.id);

    expect(copyOverride).toBeDefined();
    expect(copyOverride!.id).not.toBe(originalOverride!.id);
    expect(copyOverride!.tripId).toBe(copy.id);
    expect(copyOverride!.mustHaveAmenities).toEqual(["pool"]);
  });

  it("does not leak edits from the duplicate back onto the original (no shared references)", async () => {
    const original = await createTrip(sampleInput());
    await upsertOverrideForTrip(original.id, {
      currency: "PHP",
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });

    const copy = await duplicateTrip(original.id);
    const copyOverride = (await getOverrideForTrip(copy.id))!;

    // Edit the DUPLICATE's override...
    await upsertOverrideForTrip(
      copy.id,
      {
        currency: "PHP",
        mustHaveAmenities: ["pool", "breakfast"],
        hotelVsAirbnbOpen: false,
        rawOverrideText: "changed",
      },
      copyOverride.revision,
    );

    // ...and the ORIGINAL's override must be completely unaffected.
    const originalOverrideAfter = await getOverrideForTrip(original.id);
    expect(originalOverrideAfter!.mustHaveAmenities).toEqual(["pool"]);
    expect(originalOverrideAfter!.hotelVsAirbnbOpen).toBe(true);
    expect(originalOverrideAfter!.rawOverrideText).toBe("");
  });

  it("does not create an override on the duplicate when the original had none", async () => {
    const original = await createTrip(sampleInput());
    const copy = await duplicateTrip(original.id);
    expect(await getOverrideForTrip(copy.id)).toBeUndefined();
  });
});
