import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import { runMigrations } from "./migrations";
import {
  SCHEMA_VERSION,
  type Trip,
  type TravelerProfile,
  type TripOverride,
  type ItineraryDay,
  type ItineraryItem,
  type Expense,
  type Booking,
  type ResearchSource,
  type Reminder,
  type ChangeLogEntry,
  type BackupMeta,
} from "./schema";

const DB_NAME = "nk-travel-agent";

export interface NkTravelAgentDB extends DBSchema {
  trips: { key: string; value: Trip; indexes: { "by-status": string } };
  travelerProfiles: { key: string; value: TravelerProfile };
  tripOverrides: { key: string; value: TripOverride; indexes: { "by-trip": string } };
  itineraryDays: {
    key: string;
    value: ItineraryDay;
    indexes: { "by-trip": string; "by-trip-date": [string, string] };
  };
  itineraryItems: { key: string; value: ItineraryItem; indexes: { "by-trip": string; "by-day": string } };
  expenses: { key: string; value: Expense; indexes: { "by-trip": string } };
  bookings: { key: string; value: Booking; indexes: { "by-trip": string } };
  researchSources: { key: string; value: ResearchSource; indexes: { "by-trip": string } };
  reminders: { key: string; value: Reminder; indexes: { "by-trip": string } };
  changeLog: {
    key: string;
    value: ChangeLogEntry;
    indexes: { "by-trip": string; "by-timestamp": string };
  };
  backupMeta: { key: string; value: BackupMeta };
}

export type DbStatus = "idle" | "loading" | "ready" | "error" | "read-only";

/**
 * The set of valid store names, written out explicitly rather than derived
 * via `keyof NkTravelAgentDB`. `keyof` on a type extending idb's `DBSchema`
 * collapses to plain `string` (confirmed by compiler output, not assumed —
 * `DBSchema` carries a string index signature that absorbs the specific
 * keys), so a derived alias silently stops being a literal union. This
 * list must be kept in sync with the stores created in migrations.ts.
 */
export type StoreName =
  | "trips"
  | "travelerProfiles"
  | "tripOverrides"
  | "itineraryDays"
  | "itineraryItems"
  | "expenses"
  | "bookings"
  | "researchSources"
  | "reminders"
  | "changeLog"
  | "backupMeta";

/** Runtime array form of StoreName, for code that needs to iterate every
 * store (export/backup). Kept next to the type above — update both together. */
export const ALL_STORE_NAMES: StoreName[] = [
  "trips",
  "travelerProfiles",
  "tripOverrides",
  "itineraryDays",
  "itineraryItems",
  "expenses",
  "bookings",
  "researchSources",
  "reminders",
  "changeLog",
  "backupMeta",
];

interface DbState {
  status: DbStatus;
  error: string | null;
  db: IDBPDatabase<NkTravelAgentDB> | null;
}

const state: DbState = { status: "idle", error: null, db: null };
let openPromise: Promise<IDBPDatabase<NkTravelAgentDB>> | null = null;

/**
 * Opens (or returns the already-open) database. Safe to call multiple
 * times — concurrent callers share one in-flight open rather than racing
 * separate upgrade transactions.
 *
 * Per the local-first data-integrity rules: a failed open must NEVER be
 * treated as "empty database" by the caller. It surfaces as a rejected
 * promise and `status: "error"`, and all writes stay blocked until this
 * resolves successfully.
 */
export function initDb(): Promise<IDBPDatabase<NkTravelAgentDB>> {
  if (state.db) return Promise.resolve(state.db);
  if (openPromise) return openPromise;

  state.status = "loading";
  openPromise = openDB<NkTravelAgentDB>(DB_NAME, SCHEMA_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      runMigrations(db, oldVersion, newVersion, tx);
    },
    blocked() {
      state.status = "error";
      state.error = "Database upgrade blocked by another open tab. Close other tabs and reload.";
    },
    blocking() {
      // Another, newer tab wants to upgrade. Degrade to read-only rather
      // than silently keep accepting writes against a stale schema.
      state.status = "read-only";
    },
    terminated() {
      state.status = "error";
      state.error = "Database connection was unexpectedly terminated.";
      state.db = null;
      openPromise = null;
    },
  })
    .then((db) => {
      state.db = db;
      state.status = "ready";
      state.error = null;
      return db;
    })
    .catch((err: unknown) => {
      state.status = "error";
      state.error = err instanceof Error ? err.message : String(err);
      openPromise = null;
      throw err;
    });

  return openPromise;
}

export function getDbStatus(): { status: DbStatus; error: string | null } {
  return { status: state.status, error: state.error };
}

/**
 * The single gate every read AND write goes through. Reads aren't exempt:
 * there's no db handle to read from before `initDb()` resolves, and after
 * a `terminated` event `state.db` is null again, so this is the one place
 * that check lives rather than repeated (and potentially forgotten) in
 * every repository function.
 */
export function getReadyDb(): IDBPDatabase<NkTravelAgentDB> {
  if (state.status !== "ready" || !state.db) {
    throw new Error(
      `Refusing to access the database: status is "${state.status}", not "ready". ` +
        `(This is the write-gating guard from the data-integrity rules — it is ` +
        `not a bug. Call/await initDb() first.)`,
    );
  }
  return state.db;
}

// NOTE: deliberately NOT generic over the exact tuple of store names.
// Forwarding a generic array type through a second generic function (idb's
// own overloaded `.transaction()`) is a known TypeScript inference dead
// end — the compiler can't resolve which overload applies and reports the
// mismatch against a widened `string[]`. Using the concrete `StoreName[]`
// union type here is what actually compiles; the cost is that `tx` inside
// `fn` is typed against all possible stores rather than just the ones
// opened, which only affects autocomplete, not correctness (IndexedDB
// itself still enforces at runtime which stores a transaction can touch).
export async function withWriteTransaction<T>(
  storeNames: StoreName[],
  fn: (tx: IDBPTransaction<NkTravelAgentDB, StoreName[], "readwrite">) => Promise<T>,
): Promise<T> {
  const db = getReadyDb();
  const tx = db.transaction(storeNames, "readwrite");
  const result = await fn(tx);
  await tx.done;
  return result;
}
