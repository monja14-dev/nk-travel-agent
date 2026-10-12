/**
 * Pure validation for already-typed accommodation/food result input —
 * mirrors modules/trips/validation.ts's role exactly: one function per
 * entity, called from both the repository layer (enforced regardless of
 * which adapter produced the input) and, indirectly, from each adapter's
 * normalize() step (see adapters/*.ts), which runs this after coercing
 * raw/stringly-typed input into this shape.
 */
import type {
  AccommodationPropertyType,
  FoodHunterCategory,
  MandatoryFee,
  ResearchVerificationStatus,
  ResultAttribution,
} from "../../db/schema";

export interface AccommodationResultInput {
  name: string;
  propertyType?: AccommodationPropertyType;
  location?: string;
  mapUrl?: string;
  pricePerNight?: number;
  currency?: string;
  mandatoryFees: MandatoryFee[];
  cancellationPolicy?: string;
  rating?: number;
  ratingScale?: number;
  reviewCount?: number;
  notes?: string;
  attribution: ResultAttribution;
}

export interface FoodResultInput {
  name: string;
  category: FoodHunterCategory;
  dishes: string[];
  cuisine?: string;
  priceRange?: string;
  location?: string;
  mapUrl?: string;
  rating?: number;
  ratingScale?: number;
  reviewCount?: number;
  notes?: string;
  attribution: ResultAttribution;
}

export type FieldErrors = Record<string, string>;

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

const ACCOMMODATION_PROPERTY_TYPES: AccommodationPropertyType[] = ["hotel", "resort", "airbnb", "hostel", "other"];
const FOOD_HUNTER_CATEGORIES: FoodHunterCategory[] = [
  "must-try",
  "local-favorites",
  "hidden-gems",
  "budget-eats",
  "special-occasions",
];
const VERIFICATION_STATUSES: ResearchVerificationStatus[] = ["verified", "estimate", "stale", "unknown"];

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function validateAttribution(attribution: ResultAttribution, errors: FieldErrors): void {
  if (!attribution.sourceLabel.trim()) {
    errors["attribution.sourceLabel"] = "A source label is required (even \"Manually researched\" counts).";
  }
  if (attribution.sourceUrl !== undefined && !looksLikeUrl(attribution.sourceUrl)) {
    errors["attribution.sourceUrl"] = "Source URL must start with http:// or https://.";
  }
  if (!VERIFICATION_STATUSES.includes(attribution.verificationStatus)) {
    errors["attribution.verificationStatus"] = `Verification status must be one of: ${VERIFICATION_STATUSES.join(", ")}.`;
  }
  if (!attribution.retrievedAt || Number.isNaN(new Date(attribution.retrievedAt).getTime())) {
    errors["attribution.retrievedAt"] = "Retrieved-at must be a valid date/time.";
  }
}

function validateMandatoryFees(fees: MandatoryFee[], errors: FieldErrors): void {
  fees.forEach((fee, i) => {
    if (!fee.label.trim()) errors[`mandatoryFees[${i}].label`] = "Each mandatory fee needs a label.";
    if (fee.amount !== undefined && (!Number.isFinite(fee.amount) || fee.amount < 0)) {
      errors[`mandatoryFees[${i}].amount`] = "Fee amount must be a non-negative number when given.";
    }
  });
}

function validateRatingFields(
  rating: number | undefined,
  ratingScale: number | undefined,
  reviewCount: number | undefined,
  errors: FieldErrors,
): void {
  if (rating !== undefined) {
    if (!Number.isFinite(rating) || rating < 0) {
      errors.rating = "Rating must be a non-negative number when given.";
    } else if (ratingScale !== undefined && rating > ratingScale) {
      errors.rating = `Rating can't exceed the rating scale (${ratingScale}).`;
    }
  }
  if (ratingScale !== undefined && (!Number.isFinite(ratingScale) || ratingScale <= 0)) {
    errors.ratingScale = "Rating scale must be a positive number when given.";
  }
  if (reviewCount !== undefined && (!Number.isInteger(reviewCount) || reviewCount < 0)) {
    errors.reviewCount = "Review count must be a non-negative whole number when given.";
  }
}

export function validateAccommodationResultInput(input: AccommodationResultInput): FieldErrors {
  const errors: FieldErrors = {};

  if (!input.name.trim()) errors.name = "Name is required.";
  if (input.propertyType !== undefined && !ACCOMMODATION_PROPERTY_TYPES.includes(input.propertyType)) {
    errors.propertyType = `Property type must be one of: ${ACCOMMODATION_PROPERTY_TYPES.join(", ")}.`;
  }
  if (input.mapUrl !== undefined && !looksLikeUrl(input.mapUrl)) {
    errors.mapUrl = "Map URL must start with http:// or https://.";
  }
  if (input.pricePerNight !== undefined) {
    if (!Number.isFinite(input.pricePerNight) || input.pricePerNight < 0) {
      errors.pricePerNight = "Price per night must be a non-negative number when given.";
    }
    if (!input.currency?.trim()) {
      errors.currency = "Currency is required when a price per night is given.";
    }
  }
  validateMandatoryFees(input.mandatoryFees, errors);
  validateRatingFields(input.rating, input.ratingScale, input.reviewCount, errors);
  validateAttribution(input.attribution, errors);

  return errors;
}

export function validateFoodResultInput(input: FoodResultInput): FieldErrors {
  const errors: FieldErrors = {};

  if (!input.name.trim()) errors.name = "Name is required.";
  if (!FOOD_HUNTER_CATEGORIES.includes(input.category)) {
    errors.category = `Category must be one of: ${FOOD_HUNTER_CATEGORIES.join(", ")}.`;
  }
  if (input.mapUrl !== undefined && !looksLikeUrl(input.mapUrl)) {
    errors.mapUrl = "Map URL must start with http:// or https://.";
  }
  validateRatingFields(input.rating, input.ratingScale, input.reviewCount, errors);
  validateAttribution(input.attribution, errors);

  return errors;
}
