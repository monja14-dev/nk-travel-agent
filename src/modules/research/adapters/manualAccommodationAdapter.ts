import type { AccommodationPropertyType, ResearchVerificationStatus } from "../../../db/schema";
import { nowIso } from "../../../lib/time";
import { validateAccommodationResultInput, type AccommodationResultInput, type FieldErrors } from "../validation";
import type { AccommodationAdapter, AdapterAvailability, NormalizeOutcome } from "./types";
import { coerceMandatoryFees, coerceOptionalNumber, coerceOptionalString } from "./coerce";

/**
 * The one concrete adapter this phase ships. It formalizes — not
 * replaces — the chat-based agent's existing research behavior: the AI
 * (or the person) still does the actual finding, via conversation or
 * their own web search, exactly as before; this adapter is just the
 * normalization step that turns a plain-text/plain-object description
 * of what was found into this app's structured result schema, so it can
 * be compared in a table and saved to a trip. No network call of its
 * own, so `checkAvailability()` is unconditionally true.
 */

const VERIFICATION_STATUSES: ResearchVerificationStatus[] = ["verified", "estimate", "stale", "unknown"];
const PROPERTY_TYPES: AccommodationPropertyType[] = ["hotel", "resort", "airbnb", "hostel", "other"];

function coerceVerificationStatus(raw: Record<string, unknown>, errors: FieldErrors): ResearchVerificationStatus {
  const value = coerceOptionalString(raw, "verificationStatus");
  if (value === undefined) return "estimate"; // honest default for hand-entered/chat-sourced data: not independently confirmed
  if (!VERIFICATION_STATUSES.includes(value as ResearchVerificationStatus)) {
    errors["attribution.verificationStatus"] = `verificationStatus must be one of: ${VERIFICATION_STATUSES.join(", ")}.`;
    return "estimate";
  }
  return value as ResearchVerificationStatus;
}

function coercePropertyType(raw: Record<string, unknown>, errors: FieldErrors): AccommodationPropertyType | undefined {
  const value = coerceOptionalString(raw, "propertyType");
  if (value === undefined) return undefined;
  if (!PROPERTY_TYPES.includes(value as AccommodationPropertyType)) {
    errors.propertyType = `propertyType must be one of: ${PROPERTY_TYPES.join(", ")}.`;
    return undefined;
  }
  return value as AccommodationPropertyType;
}

function normalize(raw: Record<string, unknown>): NormalizeOutcome<AccommodationResultInput> {
  const errors: FieldErrors = {};

  const name = coerceOptionalString(raw, "name");
  if (!name) errors.name = "Name is required.";

  const pricePerNight = coerceOptionalNumber(raw, "pricePerNight", errors);
  const currency = coerceOptionalString(raw, "currency");

  const candidate: AccommodationResultInput = {
    name: name ?? "",
    propertyType: coercePropertyType(raw, errors),
    location: coerceOptionalString(raw, "location"),
    mapUrl: coerceOptionalString(raw, "mapUrl"),
    pricePerNight,
    currency,
    mandatoryFees: coerceMandatoryFees(raw, "mandatoryFees", errors),
    cancellationPolicy: coerceOptionalString(raw, "cancellationPolicy"),
    rating: coerceOptionalNumber(raw, "rating", errors),
    ratingScale: coerceOptionalNumber(raw, "ratingScale", errors),
    reviewCount: coerceOptionalNumber(raw, "reviewCount", errors),
    notes: coerceOptionalString(raw, "notes"),
    attribution: {
      sourceLabel: coerceOptionalString(raw, "sourceLabel") ?? "Manually researched",
      sourceUrl: coerceOptionalString(raw, "sourceUrl"),
      retrievedAt: coerceOptionalString(raw, "retrievedAt") ?? nowIso(),
      verificationStatus: coerceVerificationStatus(raw, errors),
    },
  };

  // Re-run the same field-level checks the repo will also run — catches
  // anything the coercion above let through (e.g. a rating over its
  // scale) before this ever gets near a duplicate check or a write.
  Object.assign(errors, validateAccommodationResultInput(candidate));

  if (Object.keys(errors).length > 0) {
    return { ok: false, fieldErrors: errors };
  }
  return { ok: true, candidate, fieldErrors: {} };
}

export const manualAccommodationAdapter: AccommodationAdapter = {
  id: "manual",
  label: "Manually researched",
  checkAvailability(): AdapterAvailability {
    return { available: true };
  },
  normalize,
};
