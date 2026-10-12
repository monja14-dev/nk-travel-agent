import type { AccommodationResult, FoodResult } from "../../db/schema";
import { createAccommodationResult } from "../../db/repositories/accommodationResultsRepo";
import { createFoodResult } from "../../db/repositories/foodResultsRepo";
import { DuplicateResultError, ValidationError } from "../../lib/errors";
import type { AccommodationAdapter, FoodAdapter } from "./adapters/types";
import type { FieldErrors } from "./validation";

/**
 * The "save-to-trip action" the master prompt asks for: takes whatever
 * an adapter's `normalize()` produced (or failed to) and a trip id, and
 * drives it through to a saved record or a clean, typed failure. This is
 * the one place that has to handle an adapter actually throwing — e.g. a
 * future live adapter's `normalize()` hitting a provider error mid-call
 * — without that taking down the save flow.
 */
export type SaveResultOutcome<T> =
  | { status: "saved"; result: T }
  | { status: "invalid"; fieldErrors: FieldErrors }
  | { status: "duplicate"; existingId: string; message: string }
  | { status: "adapter-error"; message: string };

export async function saveAccommodationResult(
  tripId: string,
  adapter: AccommodationAdapter,
  raw: Record<string, unknown>,
): Promise<SaveResultOutcome<AccommodationResult>> {
  let outcome: ReturnType<AccommodationAdapter["normalize"]>;
  try {
    outcome = adapter.normalize(raw);
  } catch (err) {
    return { status: "adapter-error", message: describeAdapterError(adapter.label, err) };
  }
  if (!outcome.ok) {
    return { status: "invalid", fieldErrors: outcome.fieldErrors };
  }

  try {
    const result = await createAccommodationResult(tripId, outcome.candidate);
    return { status: "saved", result };
  } catch (err) {
    if (err instanceof DuplicateResultError) {
      return { status: "duplicate", existingId: err.existingId, message: err.message };
    }
    if (err instanceof ValidationError) {
      return { status: "invalid", fieldErrors: err.fieldErrors };
    }
    throw err;
  }
}

export async function saveFoodResult(
  tripId: string,
  adapter: FoodAdapter,
  raw: Record<string, unknown>,
): Promise<SaveResultOutcome<FoodResult>> {
  let outcome: ReturnType<FoodAdapter["normalize"]>;
  try {
    outcome = adapter.normalize(raw);
  } catch (err) {
    return { status: "adapter-error", message: describeAdapterError(adapter.label, err) };
  }
  if (!outcome.ok) {
    return { status: "invalid", fieldErrors: outcome.fieldErrors };
  }

  try {
    const result = await createFoodResult(tripId, outcome.candidate);
    return { status: "saved", result };
  } catch (err) {
    if (err instanceof DuplicateResultError) {
      return { status: "duplicate", existingId: err.existingId, message: err.message };
    }
    if (err instanceof ValidationError) {
      return { status: "invalid", fieldErrors: err.fieldErrors };
    }
    throw err;
  }
}

function describeAdapterError(adapterLabel: string, err: unknown): string {
  return `The "${adapterLabel}" research source failed: ${err instanceof Error ? err.message : String(err)}`;
}
