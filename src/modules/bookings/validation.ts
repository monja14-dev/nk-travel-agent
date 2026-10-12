import type { BookingType, BookingStatus } from "../../db/schema";

export type FieldErrors = Record<string, string>;
export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

const BOOKING_TYPES: BookingType[] = ["flight", "accommodation", "tour", "insurance", "transport", "other"];
const BOOKING_STATUSES: BookingStatus[] = ["not_booked", "pending", "confirmed", "cancelled"];

export interface BookingInput {
  type: BookingType;
  provider: string;
  confirmationNumber?: string;
  cost?: number;
  currency?: string;
  bookingDate?: string;
  status: BookingStatus;
  notes?: string;
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function validateBookingInput(input: BookingInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!BOOKING_TYPES.includes(input.type)) errors.type = `Type must be one of: ${BOOKING_TYPES.join(", ")}.`;
  if (!input.provider.trim()) errors.provider = "Provider is required.";
  if (!BOOKING_STATUSES.includes(input.status)) errors.status = `Status must be one of: ${BOOKING_STATUSES.join(", ")}.`;
  if (input.cost !== undefined) {
    if (!Number.isFinite(input.cost) || input.cost < 0) errors.cost = "Cost must be a non-negative number.";
    if (!input.currency?.trim()) errors.currency = "Currency is required when cost is set.";
  }
  if (input.bookingDate !== undefined && !isValidIsoDate(input.bookingDate)) {
    errors.bookingDate = "Booking date must be a valid date.";
  }
  return errors;
}
