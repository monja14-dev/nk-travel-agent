import { describe, it, expect } from "vitest";
import { runMigrations } from "../migrations";
import type { IDBPDatabase, IDBPTransaction } from "idb";
import type { NkTravelAgentDB, StoreName } from "../client";

/**
 * Phase 6 — "test migrations." The migration runner's own refuse-rather-
 * than-skip guard (migrations.ts: "Refusing to open the database rather
 * than silently skip a version") was previously only exercised
 * indirectly — every test that opens a real db always does so at the
 * current SCHEMA_VERSION, where every version in range 1..SCHEMA_VERSION
 * has a registered migration, so the guard's `if (!migrate)` branch has
 * never actually been hit by a real test run. This calls runMigrations()
 * directly against a target version with a deliberate gap, so a future
 * version bump that forgets to add its migration function fails loudly
 * here instead of only in production.
 */
describe("runMigrations — version-gap guard", () => {
  it("throws rather than silently skipping an unregistered schema version", () => {
    // Real migrations are only registered for versions 1 and 2. Asking to
    // migrate up to version 5 must fail at version 3 — the first gap —
    // rather than silently stop at 2 and report success.
    expect(() =>
      runMigrations(
        undefined as unknown as IDBPDatabase<NkTravelAgentDB>,
        2,
        5,
        undefined as unknown as IDBPTransaction<NkTravelAgentDB, StoreName[], "versionchange">,
      ),
    ).toThrow(/No migration registered for schema version 3/);
  });

  it("running from version 0 to the current version 2 runs cleanly (no gap in the real migration table)", async () => {
    // Uses a real fake-indexeddb database so migrations 1 and 2 can
    // actually execute their createObjectStore calls, not just be found.
    const { openDB } = await import("idb");
    const db = await openDB<NkTravelAgentDB>("phase6-migration-check", 2, {
      upgrade(db, oldVersion, newVersion, tx) {
        runMigrations(db, oldVersion, newVersion, tx as unknown as IDBPTransaction<NkTravelAgentDB, StoreName[], "versionchange">);
      },
    });
    expect(db.objectStoreNames.contains("trips")).toBe(true);
    expect(db.objectStoreNames.contains("accommodationResults")).toBe(true);
    db.close();
  });
});
