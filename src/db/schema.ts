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

export const SCHEMA_VERSION = 1;

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
  crossesMidnight: boolean;
  durationMinutes?: number;
  category: ItineraryItemCategory;
  title: string;
  description?: string;
  address?: string;
  transportNotes?: string; // "How to get there", from the reference workbook
  bookingStatus: BookingStatus;
  plannedCost?: number;
  actualCost?: number;
  currency?: string;
  sourceUrl?: string;
  verifiedAt?: ISODateTimeString;
  comments?: string;
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
