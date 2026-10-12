import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 6 — "test database failures." Everything else in this test suite
 * exercises the db client against a real (fake) IndexedDB that always
 * succeeds. This file is the one place that actually makes `openDB()`
 * itself fail, to prove the failure-handling code in client.ts (written
 * since Phase 1, never previously exercised by a real failing open) does
 * what its own comments claim: a failed open must surface as `"error"`,
 * never be silently treated as an empty database, and a later retry must
 * be able to recover once the underlying problem goes away.
 *
 * `vi.mock("idb")` only affects *this test file's* module graph — each
 * vitest test file gets its own fresh module registry (see
 * reloadPersistence.test.ts's header comment) — so every other test file
 * keeps using the real `idb` + fake-indexeddb combination untouched.
 */

const openDBMock = vi.fn();

vi.mock("idb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("idb")>();
  return { ...actual, openDB: (...args: unknown[]) => openDBMock(...args) };
});

beforeEach(() => {
  vi.resetModules();
  openDBMock.mockReset();
});

describe("db client — open failure handling", () => {
  it("a rejected openDB() surfaces as status 'error' with the real message, not a silent empty database", async () => {
    openDBMock.mockRejectedValue(new Error("simulated IDB open failure: disk quota exceeded"));

    const client = await import("../client");

    await expect(client.initDb()).rejects.toThrow("simulated IDB open failure");

    const { status, error } = client.getDbStatus();
    expect(status).toBe("error");
    expect(error).toContain("simulated IDB open failure");
  });

  it("getReadyDb() keeps refusing access after a failed open — never falls back to treating it as ready/empty", async () => {
    openDBMock.mockRejectedValue(new Error("simulated IDB open failure"));

    const client = await import("../client");
    await client.initDb().catch(() => undefined);

    expect(() => client.getReadyDb()).toThrow(/not "ready"/);
  });

  it("withWriteTransaction is blocked by the same guard — a failed open can never be written through", async () => {
    openDBMock.mockRejectedValue(new Error("simulated IDB open failure"));

    const client = await import("../client");
    await client.initDb().catch(() => undefined);

    await expect(
      client.withWriteTransaction(["trips"], async (tx) => tx.objectStore("trips").count()),
    ).rejects.toThrow(/not "ready"/);
  });

  it("a transient open failure is recoverable: a later initDb() call after the problem clears re-opens cleanly", async () => {
    const actualIdb = await vi.importActual<typeof import("idb")>("idb");
    openDBMock
      .mockRejectedValueOnce(new Error("simulated transient IDB open failure"))
      .mockImplementationOnce((...args: Parameters<typeof actualIdb.openDB>) => actualIdb.openDB(...args));

    const client = await import("../client");

    await expect(client.initDb()).rejects.toThrow("simulated transient IDB open failure");
    expect(client.getDbStatus().status).toBe("error");

    // The retry — same call, now that the mock lets the real openDB
    // through — must actually succeed rather than staying wedged in the
    // first failure's error state forever.
    const db = await client.initDb();
    expect(db).toBeTruthy();
    expect(client.getDbStatus().status).toBe("ready");
    expect(() => client.getReadyDb()).not.toThrow();
  });
});
