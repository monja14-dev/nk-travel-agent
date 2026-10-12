import { describe, it, expect, beforeEach } from "vitest";
import { initDb, ALL_STORE_NAMES } from "../client";
import { exportBackup, restoreBackup } from "../backup";
import { createTrip, getTrip, listTrips } from "../repositories/tripsRepo";
import { getOrCreateDefaultProfile, updateProfile } from "../repositories/travelerProfilesRepo";
import { upsertOverrideForTrip, getOverrideForTrip } from "../repositories/tripOverridesRepo";
import { InvalidBackupError } from "../../lib/errors";
import { resetTestDb } from "../repositories/__tests__/testSupport";

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("backup — export/restore round trip", () => {
  it("restores a full export back to an identical database state", async () => {
    const trip = await createTrip({
      name: "Taiwan Trip",
      destination: "Taipei",
      country: "Taiwan",
      startDate: "2026-10-04",
      endDate: "2026-10-10",
      travelerCount: 2,
    });
    const defaultProfile = await getOrCreateDefaultProfile();
    const profile = await updateProfile(defaultProfile.id, { pace: "relaxed" }, defaultProfile.revision);
    const override = await upsertOverrideForTrip(trip.id, {
      currency: "TWD",
      budgetTargetMin: 40000,
      budgetTargetMax: 60000,
      mustHaveAmenities: ["hot pot nearby"],
      hotelVsAirbnbOpen: true,
      rawOverrideText: "",
    });

    const backup = await exportBackup();
    expect(backup.data.trips).toHaveLength(1);
    expect(backup.data.travelerProfiles).toHaveLength(1);
    expect(backup.data.tripOverrides).toHaveLength(1);

    // Wipe everything, simulating a fresh/corrupted database before restore.
    await resetTestDb();
    expect(await listTrips({ includeArchived: true })).toHaveLength(0);

    const { safetyBackup } = await restoreBackup(backup);

    // The safety backup captured the (now-empty) pre-restore state.
    expect(safetyBackup.data.trips).toHaveLength(0);

    // Restore brought everything back, byte-for-byte.
    expect(await getTrip(trip.id)).toEqual(trip);
    expect(await getOverrideForTrip(trip.id)).toEqual(override);
    const restoredProfile = await getOrCreateDefaultProfile();
    expect(restoredProfile).toEqual(profile);
  });

  it("rejects a malformed backup and leaves existing data completely untouched", async () => {
    const trip = await createTrip({
      name: "Untouched Trip",
      destination: "Taipei",
      country: "Taiwan",
      startDate: "2026-10-04",
      endDate: "2026-10-10",
      travelerCount: 2,
    });

    await expect(restoreBackup({ garbage: true })).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(restoreBackup(null)).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(restoreBackup({ schemaVersion: 1, exportedAt: "now", data: { trips: "not-an-array" } })).rejects.toBeInstanceOf(
      InvalidBackupError,
    );

    // None of the rejected attempts should have modified anything.
    expect(await getTrip(trip.id)).toEqual(trip);
    expect(await listTrips({ includeArchived: true })).toHaveLength(1);
  });

  it("rejects a backup from a newer, unsupported schema version", async () => {
    await expect(
      restoreBackup({ schemaVersion: 999, exportedAt: new Date().toISOString(), data: {} }),
    ).rejects.toBeInstanceOf(InvalidBackupError);
  });

  it("exportBackup covers every known store, even when empty", async () => {
    const backup = await exportBackup();
    // Compared against the live ALL_STORE_NAMES rather than a hardcoded
    // list — a future phase adding another store shouldn't require
    // remembering to update this assertion too; it already would have
    // needed to add that store to ALL_STORE_NAMES for backup/restore to
    // cover it at all, which is what this test actually verifies.
    expect(Object.keys(backup.data).sort()).toEqual([...ALL_STORE_NAMES].sort());
  });
});
