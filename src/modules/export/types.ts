import type {
  Trip,
  TripOverride,
  TravelerProfile,
  ItineraryDay,
  ItineraryItem,
  Expense,
  Booking,
  Reminder,
  ResearchSource,
  ChangeLogEntry,
  AccommodationResult,
  FoodResult,
} from "../../db/schema";

/**
 * Everything the XLSX export needs, already loaded from IndexedDB. Kept
 * as a plain data bag — separate from buildWorkbook.ts, which is pure and
 * synchronous and takes exactly this shape, so the workbook-construction
 * logic (formatting, formulas, sheet layout) can be unit-tested with
 * hand-built fixtures and never needs a real or fake IndexedDB.
 */
export interface TripExportData {
  trip: Trip;
  override?: TripOverride;
  profile?: TravelerProfile;
  days: ItineraryDay[];
  items: ItineraryItem[];
  expenses: Expense[];
  bookings: Booking[];
  reminders: Reminder[];
  researchSources: ResearchSource[];
  accommodationResults: AccommodationResult[];
  foodResults: FoodResult[];
  changeLog: ChangeLogEntry[];
  /** When this export was generated — used for the Trip Overview sheet
   * and the default filename. Passed in rather than read from `Date.now()`
   * inside the builder, so tests can assert on an exact, deterministic
   * value. */
  generatedAt: string;
}
