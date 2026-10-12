import { getTrip } from "../../db/repositories/tripsRepo";
import { getOverrideForTrip } from "../../db/repositories/tripOverridesRepo";
import { getOrCreateDefaultProfile } from "../../db/repositories/travelerProfilesRepo";
import { listDaysForTrip } from "../../db/repositories/itineraryDaysRepo";
import { listItemsForTrip } from "../../db/repositories/itineraryItemsRepo";
import { listExpensesForTrip } from "../../db/repositories/expensesRepo";
import { listBookingsForTrip } from "../../db/repositories/bookingsRepo";
import { listRemindersForTrip } from "../../db/repositories/remindersRepo";
import { listResearchSourcesForTrip } from "../../db/repositories/researchSourcesRepo";
import { listAccommodationResultsForTrip } from "../../db/repositories/accommodationResultsRepo";
import { listFoodResultsForTrip } from "../../db/repositories/foodResultsRepo";
import { listChangeLogForTrip } from "../../db/repositories/changeLogHelper";
import { nowIso } from "../../lib/time";
import { NotFoundError } from "../../lib/errors";
import type { TripExportData } from "./types";

/**
 * Gathers every store this trip's XLSX export touches into one plain
 * object. The only place in Phase 5 that reads this many stores at once —
 * deliberately a thin aggregator with no formatting/formula logic, so
 * buildWorkbook.ts stays testable without IndexedDB (see types.ts).
 */
export async function collectTripExportData(tripId: string): Promise<TripExportData> {
  const trip = await getTrip(tripId);
  if (!trip) throw new NotFoundError("Trip", tripId);

  const [
    override,
    profile,
    days,
    items,
    expenses,
    bookings,
    reminders,
    researchSources,
    accommodationResults,
    foodResults,
    changeLog,
  ] = await Promise.all([
    getOverrideForTrip(tripId),
    getOrCreateDefaultProfile(),
    listDaysForTrip(tripId),
    listItemsForTrip(tripId),
    listExpensesForTrip(tripId),
    listBookingsForTrip(tripId),
    listRemindersForTrip(tripId),
    listResearchSourcesForTrip(tripId),
    listAccommodationResultsForTrip(tripId),
    listFoodResultsForTrip(tripId),
    listChangeLogForTrip(tripId),
  ]);

  return {
    trip,
    override,
    profile,
    days,
    items,
    expenses,
    bookings,
    reminders,
    researchSources,
    accommodationResults,
    foodResults,
    changeLog,
    generatedAt: nowIso(),
  };
}
