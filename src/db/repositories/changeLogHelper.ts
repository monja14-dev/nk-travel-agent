import { getReadyDb } from "../client";
import type { ChangeLogEntry } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";

/** Shared by every repository that writes trip-scoped change-log entries
 * (trips, tripOverrides) — not used for the traveler profile, which isn't
 * trip-scoped (ChangeLogEntry.tripId is required by schema; profile edits
 * aren't logged in Phase 2 as a result — see docs/PHASE_LOG.md). */
export function buildChangeLogEntry(params: {
  tripId: string;
  entityType: string;
  entityId: string;
  action: ChangeLogEntry["action"];
  before?: unknown;
  after?: unknown;
}): ChangeLogEntry {
  return {
    id: generateId("changelog"),
    tripId: params.tripId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    source: "user",
    before: params.before,
    after: params.after,
    timestamp: nowIso(),
  };
}

/**
 * Phase 5: full change history for a trip, newest first — used by the
 * XLSX export's Change Log sheet. Not used by any UI screen yet (no
 * change-log viewer has been built); this is the first reader of the
 * `changeLog` store's `by-trip` index.
 */
export async function listChangeLogForTrip(tripId: string): Promise<ChangeLogEntry[]> {
  const entries = await getReadyDb().getAllFromIndex("changeLog", "by-trip", tripId);
  return [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
