import type { IDBPDatabase, IDBPTransaction } from "idb";
import type { NkTravelAgentDB, StoreName } from "./client";
import { SCHEMA_VERSION } from "./schema";

/**
 * One function per schema version. Each function must be safe to run on a
 * real user database — only ADD stores/indexes here, never drop or rename
 * one in place. A future breaking change gets a new version number and an
 * explicit data-migration step, not an edit to an existing function.
 */
type MigrationFn = (
  db: IDBPDatabase<NkTravelAgentDB>,
  tx: IDBPTransaction<NkTravelAgentDB, StoreName[], "versionchange">,
) => void;

const migrations: Record<number, MigrationFn> = {
  1: (db) => {
    const trips = db.createObjectStore("trips", { keyPath: "id" });
    trips.createIndex("by-status", "status");

    db.createObjectStore("travelerProfiles", { keyPath: "id" });

    const tripOverrides = db.createObjectStore("tripOverrides", { keyPath: "id" });
    tripOverrides.createIndex("by-trip", "tripId");

    const itineraryDays = db.createObjectStore("itineraryDays", { keyPath: "id" });
    itineraryDays.createIndex("by-trip", "tripId");
    itineraryDays.createIndex("by-trip-date", ["tripId", "date"]);

    const itineraryItems = db.createObjectStore("itineraryItems", { keyPath: "id" });
    itineraryItems.createIndex("by-trip", "tripId");
    itineraryItems.createIndex("by-day", "dayId");

    const expenses = db.createObjectStore("expenses", { keyPath: "id" });
    expenses.createIndex("by-trip", "tripId");

    const bookings = db.createObjectStore("bookings", { keyPath: "id" });
    bookings.createIndex("by-trip", "tripId");

    const researchSources = db.createObjectStore("researchSources", { keyPath: "id" });
    researchSources.createIndex("by-trip", "tripId");

    const reminders = db.createObjectStore("reminders", { keyPath: "id" });
    reminders.createIndex("by-trip", "tripId");

    const changeLog = db.createObjectStore("changeLog", { keyPath: "id" });
    changeLog.createIndex("by-trip", "tripId");
    changeLog.createIndex("by-timestamp", "timestamp");

    db.createObjectStore("backupMeta", { keyPath: "id" });
  },
};

export function runMigrations(
  db: IDBPDatabase<NkTravelAgentDB>,
  oldVersion: number,
  newVersion: number | null,
  tx: IDBPTransaction<NkTravelAgentDB, StoreName[], "versionchange">,
): void {
  const target = newVersion ?? SCHEMA_VERSION;
  for (let v = oldVersion + 1; v <= target; v += 1) {
    const migrate = migrations[v];
    if (!migrate) {
      throw new Error(
        `No migration registered for schema version ${v}. Refusing to open the ` +
          `database rather than silently skip a version.`,
      );
    }
    migrate(db, tx);
  }
}
