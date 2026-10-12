/**
 * NK Travel Agent — IndexedDB schema (Phase 1 draft).
 *
 * This is a DATA SHAPE definition only. No business logic lives here.
 * Field choices trace back to two sources, per the master prompt's rule to
 * inspect before inventing:
 *
 *  1. The chat-based NK Travel Agent's established behavior (Stay Hunter,
 *     Food Hunter, Itinerary Planner, Budget Planner, trip overrides).
 *  2. The actual columns found in Taiwan_041026.xlsx (see
 *     /docs/TAIWAN_WORKBOOK_SCHEMA.md) — that workbook has NO structured
 *     address, cost, or booking-status columns, so those are new fields
 *     here, not migrated data.
 *
 * Every mutable record carries `revision`, `createdAt`, and `updatedAt` so
 * the app can detect a stale write (e.g. an AI-proposed change built from
 * an old revision) instead of silently overwriting newer data — required
 * by the master prompt's local-first data integrity rules.
 */

export const SCHEMA_VERSION = 2;

export type ISODateString = string; // "2027-02-10"
export type ISODateTimeString = string; // full ISO 8601 timestamp

interface BaseRecord {
  id: string;
  revision: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export type TripStatus = "planning" | "booked" | "in_progress" | "completed" | "archived";

export interface Trip extends BaseRecord {
  name: string; // e.g. "Boracay Honeymoon"
  destination: string;
  country: string;
  startDate: ISODateString;
  endDate: ISODateString;
  travelerCount: number;
  roomCount?: number;
  status: TripStatus;
  notes?: string;
}

/** The couple's general, cross-trip preferences (your Couple Travel Profile). */
export interface TravelerProfile extends BaseRecord {
  name: string; // e.g. "NK Couple Profile"
  priorityOrder: string[]; // e.g. ["experience","value","quality","convenience","authenticity","comfort","photography"]
  accommodationPreferences: string;
  foodPreferences: string;
  pace: "relaxed" | "comfortable" | "structured" | "packed";
  rawProfileText: string; // full free-text profile, for now — structured fields above are derived conveniences
}

/** Per-trip overrides that take precedence over TravelerProfile for that trip only. */
export interface TripOverride extends BaseRecord {
  tripId: string;
  budgetTargetMin?: number;
  budgetTargetMax?: number;
  currency: string; // "PHP"
  mustHaveAmenities: string[]; // e.g. ["pool"]
  hotelVsAirbnbOpen: boolean;
  rawOverrideText: string; // full free-text trip-specific prompt
}

export type ItineraryItemCategory =
  | "transport"
  | "lodging"
  | "food"
  | "activity"
  | "rest"
  | "shopping"
  | "admin" // immigration, check-in prep, packing, etc.
  | "other";

export type BookingStatus = "not_booked" | "pending" | "confirmed" | "cancelled";

export interface ItineraryDay extends BaseRecord {
  tripId: string;
  date: ISODateString;
  dayLabel: string; // "Day 1", "Day 2 - DIY Tour 2 (Qingtiangang, Beitou)"
  summary?: string;
  remarks?: string;
}

export interface ItineraryItem extends BaseRecord {
  tripId: string;
  dayId: string;
  order: number; // explicit ordering within the day, since times can cross midnight
  startTime?: string; // "HH:MM", 24h
  endTime?: string; // "HH:MM", 24h — may be < startTime when the block crosses midnight
  /** True when THIS item's own end time is on the calendar day after its
   * own start time — a single continuous block straddling midnight (e.g.
   * a 23:35→02:00 overnight flight). Unchanged from Phase 1: explicit,
   * never inferred from `endTime < startTime`, since that comparison
   * alone can't distinguish "crosses midnight" from "ends earlier than
   * it starts by mistake." */
  crossesMidnight: boolean;
  /**
   * Phase 5: true when this item's *start* is understood to be on the
   * calendar day after the previous item in this day's sequence — e.g.
   * the real Taiwan_041026.xlsx baseline logs an evening block
   * ("Preparation for rest", 23:01–23:59) and then a *separate* row
   * ("Rest", 00:00–06:00) rather than one block spanning both. Neither
   * row's own start/end crosses midnight, but the second one is clearly
   * "the next day" relative to the first. Comparing wall-clock times
   * alone can't tell that apart from a genuine same-day scheduling
   * overlap (two items that are just out of order) — the exact ambiguity
   * `crossesMidnight` was already introduced to avoid — so this is a
   * second explicit, stored flag rather than a heuristic. Defaults to
   * false; irrelevant (a no-op) on the first item of a day.
   * modules/itinerary/timeline.ts is the one place that reads both flags
   * to reconstruct an absolute timeline for duration/conflict purposes.
   */
  newCalendarDay: boolean;
  durationMinutes?: number;
  /** Time to get TO this item's location, kept separate from
   * `durationMinutes` (the activity's own length) and separate from
   * whether a dedicated `category: "transport"` item also exists for the
   * leg — useful for a quick hop not worth its own row. */
  travelTimeMinutes?: number;
  category: ItineraryItemCategory;
  title: string;
  description?: string;
  address?: string;
  transportNotes?: string; // "How to get there", from the reference workbook
  /** Free text, not a structured schedule — real opening hours vary too
   * much (seasonal, day-of-week, "till 5pm only") for a fixed shape,
   * same reasoning as AccommodationResult.cancellationPolicy (Phase 4). */
  openingHours?: string;
  bookingStatus: BookingStatus;
  /** Transport fare for getting to/through this item, kept separate from
   * the activity's own admission/ticket cost below — the master prompt
   * asks for "fare" and "activity cost" as distinct figures, each with
   * its own planned-vs-actual pair. Renamed from Phase 1's single
   * plannedCost/actualCost (never used by any shipped UI or repo before
   * this phase — confirmed by search — so renaming here is safe). */
  farePlanned?: number;
  fareActual?: number;
  activityCostPlanned?: number;
  activityCostActual?: number;
  currency?: string;
  /** Where this item's details (price, hours, address) came from, and
   * how much to trust them — reuses Phase 4's ResultAttribution rather
   * than the old bare `sourceUrl`/`verifiedAt` pair, for the same
   * uniform verification-status display `getDisplayVerificationStatus`
   * already provides. Optional: a purely personal block ("Rest",
   * "Brunch") genuinely has no source to attribute and shouldn't be
   * forced to fake one. */
  attribution?: ResultAttribution;
  comments?: string; // true secondary notes (tips, booking reminders) — `description` is the activity's own text
  actualStatus?: "planned" | "done" | "skipped" | "modified";
}

export type ExpenseKind = "fixed" | "variable" | "optional";

export interface Expense extends BaseRecord {
  tripId: string;
  kind: ExpenseKind;
  category: string; // "accommodation" | "food" | "activities" | "transport" | "shopping" | "insurance" | "misc"
  label: string;
  plannedAmount: number;
  actualAmount?: number;
  currency: string;
  linkedItineraryItemId?: string;
  notes?: string;
}

export type BookingType = "flight" | "accommodation" | "tour" | "insurance" | "transport" | "other";

export interface Booking extends BaseRecord {
  tripId: string;
  type: BookingType;
  provider: string;
  confirmationNumber?: string;
  cost?: number;
  currency?: string;
  bookingDate?: ISODateString;
  status: BookingStatus;
  notes?: string;
}

export type ResearchVerificationStatus = "verified" | "estimate" | "stale" | "unknown";

export interface ResearchSource extends BaseRecord {
  tripId: string;
  topic: string; // "Henann Prime Beach Resort rate", "Boracay environmental fee"
  url?: string;
  retrievedAt?: ISODateTimeString;
  verificationStatus: ResearchVerificationStatus;
  notes?: string;
}

export interface Reminder extends BaseRecord {
  tripId: string;
  section: string; // "Important things to bring", "To buy/book thru Klook", "MUST BRING"
  label: string;
  remarks?: string;
  checked: boolean;
}

export type ChangeAction = "create" | "update" | "delete" | "restore";
export type ChangeSource = "user" | "ai_proposed" | "ai_applied" | "import";

export interface ChangeLogEntry {
  id: string;
  tripId: string;
  entityType: string; // store name, e.g. "itineraryItems"
  entityId: string;
  action: ChangeAction;
  source: ChangeSource;
  before?: unknown;
  after?: unknown;
  timestamp: ISODateTimeString;
}

export interface BackupMeta {
  id: string; // singleton key, e.g. "backup-meta"
  lastBackupAt?: ISODateTimeString;
  lastRestoreAt?: ISODateTimeString;
  lastSafetyBackupAt?: ISODateTimeString;
}

// ---------------------------------------------------------------------
// Phase 4 — accommodation & food research results
//
// Deliberately separate stores from the Phase 1 `ResearchSource` stub
// above, not an extension of it: ResearchSource is a thin citation log
// (topic/url/notes) with no price, rating, or dish fields, and nothing
// has written to it in Phases 1–3. Rather than overload its shape, each
// result below embeds its own attribution (reusing
// `ResearchVerificationStatus` from above) directly — the same pattern
// `ItineraryItem` already uses for `sourceUrl`/`verifiedAt`, just with a
// named sub-object since there's more to attribute here (a status, a
// human-readable provenance label, not just a URL).

/** Where a result's data came from and how much to trust it. Embedded
 * directly on each result rather than a foreign key to ResearchSource —
 * see the comment above. `retrievedAt` is always set (never omitted),
 * since "when was this captured" is what lets
 * modules/research/verification.ts's getDisplayVerificationStatus()
 * detect data that's quietly gone out of date even if it was accurate
 * when saved. */
export interface ResultAttribution {
  sourceLabel: string; // e.g. "Manually researched", "Google Places" (once/if a live adapter exists)
  sourceUrl?: string; // absent is valid — not every finding has one page to point at
  retrievedAt: ISODateTimeString;
  verificationStatus: ResearchVerificationStatus;
}

/** A fee that isn't part of the quoted nightly rate but is unavoidable —
 * environmental fee, resort fee, cleaning fee, etc. `amount` is left
 * undefined (not 0) when the fee is known to exist but its amount isn't
 * confirmed — the master prompt's "never invent" rule applies to a
 * fabricated number just as much as a fabricated price. */
export interface MandatoryFee {
  label: string;
  amount?: number;
  currency?: string;
  notes?: string;
}

export type AccommodationPropertyType = "hotel" | "resort" | "airbnb" | "hostel" | "other";

export interface AccommodationResult extends BaseRecord {
  tripId: string;
  name: string;
  propertyType?: AccommodationPropertyType;
  location?: string; // free-text area/address — not a fixed enum, matches how this is actually described
  mapUrl?: string;
  /** Absent, not 0, when the price isn't known/researched yet — a 0
   * would read as "free," which is never actually true here. */
  pricePerNight?: number;
  currency?: string;
  mandatoryFees: MandatoryFee[]; // [] (not undefined) when none are known, so the UI can render it unconditionally
  cancellationPolicy?: string; // free text — terms vary too widely across listings for a fixed enum
  rating?: number;
  ratingScale?: number; // the scale `rating` is out of (5, 10, ...) — sources disagree, so this isn't assumed
  reviewCount?: number;
  notes?: string;
  attribution: ResultAttribution;
}

/** The five Food Hunter categories the chat-based agent already used
 * (EXISTING_AGENT_CAPABILITIES.md) — fixed, not user-definable, since
 * the Food Hunter screen is organized around exactly these five. */
export type FoodHunterCategory = "must-try" | "local-favorites" | "hidden-gems" | "budget-eats" | "special-occasions";

export interface FoodResult extends BaseRecord {
  tripId: string;
  name: string;
  category: FoodHunterCategory;
  dishes: string[]; // [] when no specific dish is known yet — still worth saving the venue
  cuisine?: string;
  priceRange?: string; // free text ("~300-500 PHP/person") — this is how the info is actually found, not a single number
  location?: string;
  mapUrl?: string;
  rating?: number;
  ratingScale?: number;
  reviewCount?: number;
  notes?: string;
  attribution: ResultAttribution;
}
