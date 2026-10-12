import type { FoodHunterCategory, ResearchVerificationStatus } from "../../../db/schema";
import { nowIso } from "../../../lib/time";
import { validateFoodResultInput, type FoodResultInput, type FieldErrors } from "../validation";
import type { AdapterAvailability, FoodAdapter, NormalizeOutcome } from "./types";
import { coerceOptionalNumber, coerceOptionalString, coerceStringArray } from "./coerce";

const VERIFICATION_STATUSES: ResearchVerificationStatus[] = ["verified", "estimate", "stale", "unknown"];
const FOOD_HUNTER_CATEGORIES: FoodHunterCategory[] = [
  "must-try",
  "local-favorites",
  "hidden-gems",
  "budget-eats",
  "special-occasions",
];

function coerceVerificationStatus(raw: Record<string, unknown>, errors: FieldErrors): ResearchVerificationStatus {
  const value = coerceOptionalString(raw, "verificationStatus");
  if (value === undefined) return "estimate";
  if (!VERIFICATION_STATUSES.includes(value as ResearchVerificationStatus)) {
    errors["attribution.verificationStatus"] = `verificationStatus must be one of: ${VERIFICATION_STATUSES.join(", ")}.`;
    return "estimate";
  }
  return value as ResearchVerificationStatus;
}

function coerceCategory(raw: Record<string, unknown>, errors: FieldErrors): FoodHunterCategory {
  const value = coerceOptionalString(raw, "category");
  if (value === undefined) {
    errors.category = "Category is required.";
    return "must-try"; // placeholder so the candidate type-checks; the error above still fails normalization
  }
  if (!FOOD_HUNTER_CATEGORIES.includes(value as FoodHunterCategory)) {
    errors.category = `category must be one of: ${FOOD_HUNTER_CATEGORIES.join(", ")}.`;
    return "must-try";
  }
  return value as FoodHunterCategory;
}

function normalize(raw: Record<string, unknown>): NormalizeOutcome<FoodResultInput> {
  const errors: FieldErrors = {};

  const name = coerceOptionalString(raw, "name");
  if (!name) errors.name = "Name is required.";

  const candidate: FoodResultInput = {
    name: name ?? "",
    category: coerceCategory(raw, errors),
    dishes: coerceStringArray(raw, "dishes", errors),
    cuisine: coerceOptionalString(raw, "cuisine"),
    priceRange: coerceOptionalString(raw, "priceRange"),
    location: coerceOptionalString(raw, "location"),
    mapUrl: coerceOptionalString(raw, "mapUrl"),
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

  Object.assign(errors, validateFoodResultInput(candidate));

  if (Object.keys(errors).length > 0) {
    return { ok: false, fieldErrors: errors };
  }
  return { ok: true, candidate, fieldErrors: {} };
}

export const manualFoodAdapter: FoodAdapter = {
  id: "manual",
  label: "Manually researched",
  checkAvailability(): AdapterAvailability {
    return { available: true };
  },
  normalize,
};
