import { initDb, ALL_STORE_NAMES } from "../../client";

/** Clears every store before each test so tests in the same file don't
 * see each other's data — vitest isolates fake-indexeddb per test FILE
 * (fresh global per file), but not per `it()` within one file, since the
 * db client is a module-level singleton for the whole file's run. */
export async function resetTestDb(): Promise<void> {
  const db = await initDb();
  const tx = db.transaction(ALL_STORE_NAMES, "readwrite");
  await Promise.all(ALL_STORE_NAMES.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}
