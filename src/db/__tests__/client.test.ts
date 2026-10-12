import { describe, it, expect, beforeAll } from "vitest";
import { initDb, getDbStatus, withWriteTransaction } from "../client";
import { SCHEMA_VERSION, type Trip } from "../schema";

/**
 * Phase 1 smoke test for the db layer. This is intentionally small: it
 * exists to prove the schema/migration/client wiring actually works under
 * a real (fake) IndexedDB, not to cover every store. Expand per-module as
 * each module (Stay Hunter, Budget, etc.) gets built.
 */
describe("db client", () => {
  beforeAll(async () => {
    await initDb();
  });

  it("opens the database and reports status ready", () => {
    const { status, error } = getDbStatus();
    expect(status).toBe("ready");
    expect(error).toBeNull();
  });

  it("creates all stores from the Phase 1 migration (schema version 1)", async () => {
    // Exercises the store the migration should have created — if the
    // migration didn't run, this transaction throws immediately.
    const result = await withWriteTransaction(["trips"], async (tx) => {
      return tx.objectStore("trips").count();
    });
    expect(result).toBe(0);
  });

  it("creates the Phase 4 stores from the version-2 migration", async () => {
    expect(SCHEMA_VERSION).toBe(2);
    const result = await withWriteTransaction(["accommodationResults", "foodResults"], async (tx) => {
      return Promise.all([
        tx.objectStore("accommodationResults").count(),
        tx.objectStore("foodResults").count(),
      ]);
    });
    expect(result).toEqual([0, 0]);
  });

  it("round-trips a trip record and preserves its fields", async () => {
    const now = new Date().toISOString();
    const trip: Trip = {
      id: "trip-boracay-2027-02",
      name: "Boracay Honeymoon",
      destination: "Boracay",
      country: "Philippines",
      startDate: "2027-02-10",
      endDate: "2027-02-13",
      travelerCount: 2,
      roomCount: 1,
      status: "planning",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };

    await withWriteTransaction(["trips"], async (tx) => {
      await tx.objectStore("trips").put(trip);
    });

    const stored = await withWriteTransaction(["trips"], async (tx) => {
      return tx.objectStore("trips").get(trip.id);
    });

    expect(stored).toEqual(trip);
  });
});
