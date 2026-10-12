import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../client";
import { exportBackup, restoreBackup } from "../backup";
import { createTrip, getTrip, listTrips } from "../repositories/tripsRepo";
import { InvalidBackupError } from "../../lib/errors";
import { resetTestDb } from "../repositories/__tests__/testSupport";

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

/**
 * Phase 6 — closes a gap found by audit: validateBackupPayload only ever
 * checked "is this store's entry an array", never whether the records
 * *inside* that array look like real records. A shape-valid-but-content-
 * invalid backup (hand-edited, or truncated by a text editor) used to
 * sail past validation and only fail once restoreBackup() reached
 * `store.put()` on a record missing its own keyPath ("id") — a raw
 * IndexedDB DataError thrown mid-transaction, not the clean
 * InvalidBackupError this module exists to give *before* anything is
 * touched.
 */
describe("backup — per-record shape validation (Phase 6)", () => {
  it("rejects a backup whose records are missing the 'id' keyPath, before touching any data", async () => {
    const trip = await createTrip({
      name: "Untouched Trip",
      destination: "Taipei",
      country: "Taiwan",
      startDate: "2026-10-04",
      endDate: "2026-10-10",
      travelerCount: 2,
    });

    await expect(
      restoreBackup({
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        data: { trips: [{ name: "No id field at all" }] },
      }),
    ).rejects.toBeInstanceOf(InvalidBackupError);

    await expect(
      restoreBackup({
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        data: { trips: [{ id: 12345, name: "id is a number, not a string" }] },
      }),
    ).rejects.toBeInstanceOf(InvalidBackupError);

    await expect(
      restoreBackup({
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        data: { trips: ["not even an object"] },
      }),
    ).rejects.toBeInstanceOf(InvalidBackupError);

    // None of the rejected attempts touched the real data — the whole
    // point of validating before the transaction opens.
    expect(await getTrip(trip.id)).toEqual(trip);
    expect(await listTrips({ includeArchived: true })).toHaveLength(1);
  });

  it("still accepts a backup whose records are well-formed, including ones with only the required fields", async () => {
    const trip = await createTrip({
      name: "Fine Trip",
      destination: "Taipei",
      country: "Taiwan",
      startDate: "2026-10-04",
      endDate: "2026-10-10",
      travelerCount: 2,
    });
    const backup = await exportBackup();

    await resetTestDb();
    await expect(restoreBackup(backup)).resolves.toBeTruthy();
    expect(await getTrip(trip.id)).toEqual(trip);
  });
});
