/**
 * Pure validation for itinerary days and items — same shape as
 * modules/trips/validation.ts and modules/research/validation.ts: no DB
 * access, called from both the repository layer and the form UI.
 */

import { isValidTimeString, isTimeRangeConsistent } from "./dateMath";
import type {
  ItineraryItemCategory,
  BookingStatus,
  ResearchVerificationStatus,
} from "../../db/schema";

export type FieldErrors = Record<string, string>;

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

// ---------------------------------------------------------------------
// ItineraryDay

export interface ItineraryDayInput {
  date: string; // "YYYY-MM-DD"
  dayLabel: string;
  summary?: string;
  remarks?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function validateItineraryDayInput(input: ItineraryDayInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.date || !isValidIsoDate(input.date)) {
    errors.date = "Date must be a valid date (YYYY-MM-DD).";
  }
  if (!input.dayLabel.trim()) {
    errors.dayLabel = "Day label is required.";
  }
  return errors;
}

// ---------------------------------------------------------------------
// ItineraryItem

const CATEGORIES: ItineraryItemCategory[] = [
  "transport",
  "lodging",
  "food",
  "activity",
  "rest",
  "shopping",
  "admin",
  "other",
];

const BOOKING_STATUSES: BookingStatus[] = ["not_booked", "pending", "confirmed", "cancelled"];
const ACTUAL_STATUSES = ["planned", "done", "skipped", "modified"] as const;
const VERIFICATION_STATUSES: ResearchVerificationStatus[] = ["verified", "estimate", "stale", "unknown"];

export interface ItineraryItemAttributionInput {
  sourceLabel: string;
  sourceUrl?: string;
  retrievedAt: string;
  verificationStatus: ResearchVerificationStatus;
}

export interface ItineraryItemInput {
  order: number;
  startTime?: string;
  endTime?: string;
  crossesMidnight: boolean;
  newCalendarDay: boolean;
  durationMinutes?: number;
  travelTimeMinutes?: number;
  category: ItineraryItemCategory;
  title: string;
  description?: string;
  address?: string;
  transportNotes?: string;
  openingHours?: string;
  bookingStatus: BookingStatus;
  farePlanned?: number;
  fareActual?: number;
  activityCostPlanned?: number;
  activityCostActual?: number;
  currency?: string;
  attribution?: ItineraryItemAttributionInput;
  comments?: string;
  actualStatus?: (typeof ACTUAL_STATUSES)[number];
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function validateItineraryItemInput(input: ItineraryItemInput): FieldErrors {
  const errors: FieldErrors = {};

  if (!input.title.trim()) errors.title = "Title is required.";
  if (!Number.isFinite(input.order) || input.order < 0) errors.order = "Order must be a non-negative number.";
  if (!CATEGORIES.includes(input.category)) errors.category = `Category must be one of: ${CATEGORIES.join(", ")}.`;
  if (!BOOKING_STATUSES.includes(input.bookingStatus)) {
    errors.bookingStatus = `Booking status must be one of: ${BOOKING_STATUSES.join(", ")}.`;
  }
  if (input.actualStatus !== undefined && !ACTUAL_STATUSES.includes(input.actualStatus)) {
    errors.actualStatus = `Actual status must be one of: ${ACTUAL_STATUSES.join(", ")}.`;
  }

  if (input.startTime !== undefined && !isValidTimeString(input.startTime)) {
    errors.startTime = "Start time must be a 24h HH:MM value.";
  }
  if (input.endTime !== undefined && !isValidTimeString(input.endTime)) {
    errors.endTime = "End time must be a 24h HH:MM value.";
  }
  if (
    !errors.startTime &&
    !errors.endTime &&
    !isTimeRangeConsistent(input.startTime, input.endTime, input.crossesMidnight)
  ) {
    errors.endTime = 'End time is before start time but this item isn\'t marked "crosses midnight."';
  }

  if (input.durationMinutes !== undefined && !isFiniteNonNegative(input.durationMinutes)) {
    errors.durationMinutes = "Duration must be a non-negative number of minutes.";
  }
  if (input.travelTimeMinutes !== undefined && !isFiniteNonNegative(input.travelTimeMinutes)) {
    errors.travelTimeMinutes = "Travel time must be a non-negative number of minutes.";
  }

  const costFields: Array<[string, number | undefined]> = [
    ["farePlanned", input.farePlanned],
    ["fareActual", input.fareActual],
    ["activityCostPlanned", input.activityCostPlanned],
    ["activityCostActual", input.activityCostActual],
  ];
  let anyCostProvided = false;
  for (const [key, value] of costFields) {
    if (value === undefined) continue;
    anyCostProvided = true;
    if (!isFiniteNonNegative(value)) errors[key] = "Must be a non-negative number.";
  }
  if (anyCostProvided && !input.currency?.trim()) {
    errors.currency = "Currency is required when a fare or activity cost is set.";
  }

  if (input.attribution) {
    if (!input.attribution.sourceLabel.trim()) {
      errors["attribution.sourceLabel"] = "Source label is required when attribution is provided.";
    }
    if (input.attribution.sourceUrl !== undefined && !/^https?:\/\/\S+$/i.test(input.attribution.sourceUrl)) {
      errors["attribution.sourceUrl"] = "Source URL must be a valid http(s) URL.";
    }
    if (!VERIFICATION_STATUSES.includes(input.attribution.verificationStatus)) {
      errors["attribution.verificationStatus"] = `Verification status must be one of: ${VERIFICATION_STATUSES.join(", ")}.`;
    }
    if (Number.isNaN(new Date(input.attribution.retrievedAt).getTime())) {
      errors["attribution.retrievedAt"] = "Retrieved-at must be a valid date/time.";
    }
  }

  return errors;
}
