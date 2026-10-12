import { describe, it, expect, beforeEach, vi } from "vitest";
import { initDb } from "../../client";
import { createTrip } from "../tripsRepo";
import { getOrCreateDefaultProfile, updateProfile } from "../travelerProfilesRepo";
import { resetTestDb } from "./testSupport";

/**
 * These tests simulate a real app reload (closing the tab / refreshing the
 * page), not just calling a function again. `vi.resetModules()` throws away
 * vitest's module cache so the NEXT `import()` re-executes client.ts from
 * scratch, producing a brand-new module-level `state`/`openPromise`
 * singleton — exactly what happens to in-memory JS state on a page reload.
 *
 * Crucially, fake-indexeddb's underlying storage is a separate global keyed
 * by the database's fixed name, and is untouched by resetModules() — just
 * like a real browser's IndexedDB survives a page reload even though all
 * JS module state is thrown away. If data only "persisted" because of the
 * module-level singleton rather than being truly durable, these tests would
 * fail.
 */

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("reload persistence", () => {
  it("a trip created before a simulated reload is still readable after it", async () => {
    const created = await createTrip({
      name: "Persisted Trip",
      destination: "Taipei",
      country: "Taiwan",
      startDate: "2027-03-01",
      endDate: "2027-03-05",
      travelerCount: 2,
    });

    vi.resetModules();

    const freshClient = await import("../../client");
    const freshTripsRepo = await import("../tripsRepo");
    await freshClient.initDb();

    const reread = await freshTripsRepo.getTrip(created.id);
    expect(reread).toEqual(created);
  });

  it("an edited traveler profile survives a simulated reload — the edit is not lost to a fresh re-seed", async () => {
    const original = await getOrCreateDefaultProfile();
    const edited = await updateProfile(original.id, { pace: "relaxed" }, original.revision);

    vi.resetModules();

    const freshClient = await import("../../client");
    const freshProfilesRepo = await import("../travelerProfilesRepo");
    await freshClient.initDb();

    // Must return the EDITED profile, not silently re-seed a fresh default
    // and lose the edit — this is the master prompt's "never replace
    // existing data with defaults on startup" rule, exercised for real
    // across a simulated reload rather than just within one process.
    const reloaded = await freshProfilesRepo.getOrCreateDefaultProfile();
    expect(reloaded).toEqual(edited);
    expect(reloaded.pace).toBe("relaxed");
  });

  it("a failed/missing init is never treated as an empty database by a fresh module instance", async () => {
    const created = await createTrip({
      name: "Should Not Disappear",
      destination: "Taipei",
      country: "Taiwan",
      startDate: "2027-04-01",
      endDate: "2027-04-04",
      travelerCount: 2,
    });

    vi.resetModules();
    const freshClient = await import("../../client");

    // Before the fresh module's initDb() has resolved, it must refuse
    // access rather than report an empty/absent database.
    expect(() => freshClient.getReadyDb()).toThrow();

    await freshClient.initDb();
    const freshTripsRepo = await import("../tripsRepo");
    expect(await freshTripsRepo.getTrip(created.id)).toEqual(created);
  });
});
