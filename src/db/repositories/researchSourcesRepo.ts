import { getReadyDb } from "../client";
import type { ResearchSource } from "../schema";

/**
 * Phase 5: the first reader of the `researchSources` store (see
 * schema.ts's long comment on why it's a separate store from
 * AccommodationResult/FoodResult's own embedded `attribution` — this one
 * is a general-purpose citation log, nothing has written to it in any
 * phase so far). Listing it is enough for the XLSX export's Research
 * Sources sheet; no CRUD UI for it has been requested yet.
 */
export async function listResearchSourcesForTrip(tripId: string): Promise<ResearchSource[]> {
  return getReadyDb().getAllFromIndex("researchSources", "by-trip", tripId);
}
