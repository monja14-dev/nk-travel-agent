/**
 * Pure validation — no DB access, so it's trivially unit-testable and
 * reusable from both the repository layer (enforced regardless of which
 * UI, or later an AI proposal, is the caller) and the form UI (for
 * immediate inline feedback before a save is even attempted).
 */

export interface TripInput {
  name: string;
  destination: string;
  country: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  travelerCount: number;
  roomCount?: number;
  notes?: string;
}

export type TripFieldErrors = Partial<Record<keyof TripInput, string>>;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

export function validateTripInput(input: TripInput): TripFieldErrors {
  const errors: TripFieldErrors = {};

  if (!input.name.trim()) errors.name = "Trip name is required.";
  if (!input.destination.trim()) errors.destination = "Destination is required.";
  if (!input.country.trim()) errors.country = "Country is required.";

  if (!input.startDate) {
    errors.startDate = "Start date is required.";
  } else if (!isValidIsoDate(input.startDate)) {
    errors.startDate = "Start date must be a valid date (YYYY-MM-DD).";
  }

  if (!input.endDate) {
    errors.endDate = "End date is required.";
  } else if (!isValidIsoDate(input.endDate)) {
    errors.endDate = "End date must be a valid date (YYYY-MM-DD).";
  }

  if (
    !errors.startDate &&
    !errors.endDate &&
    isValidIsoDate(input.startDate) &&
    isValidIsoDate(input.endDate) &&
    input.endDate < input.startDate
  ) {
    errors.endDate = "End date can't be before the start date.";
  }

  if (!Number.isInteger(input.travelerCount) || input.travelerCount < 1) {
    errors.travelerCount = "Traveler count must be a whole number of at least 1.";
  }

  if (
    input.roomCount !== undefined &&
    (!Number.isInteger(input.roomCount) || input.roomCount < 1)
  ) {
    errors.roomCount = "Room count must be a whole number of at least 1.";
  }

  return errors;
}

export function hasErrors(errors: TripFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
