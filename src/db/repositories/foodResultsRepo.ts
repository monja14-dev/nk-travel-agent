import { getReadyDb, withWriteTransaction } from "../client";
import type { FoodResult } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { ValidationError, DuplicateResultError } from "../../lib/errors";
import { validateFoodResultInput, hasErrors, type FoodResultInput } from "../../modules/research/validation";
import { normalizeNameForDedup } from "./dedup";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function listFoodResultsForTrip(tripId: string): Promise<FoodResult[]> {
  return getReadyDb().getAllFromIndex("foodResults", "by-trip", tripId);
}

/**
 * Creates a new saved food find for a trip. The duplicate check is
 * deliberately NOT scoped to `category` — the same venue showing up
 * under two categories (e.g. both "local favorites" and "budget eats")
 * is still almost certainly the same real-world duplicate the person
 * would want to notice, not two legitimately distinct entries.
 */
export async function createFoodResult(tripId: string, input: FoodResultInput): Promise<FoodResult> {
  const errors = validateFoodResultInput(input);
  if (hasErrors(errors)) throw new ValidationError(errors);

  return withWriteTransaction(["foodResults", "changeLog"], async (tx) => {
    const store = tx.objectStore("foodResults");
    const existingForTrip = await store.index("by-trip").getAll(tripId);
    const normalizedName = normalizeNameForDedup(input.name);
    const duplicate = existingForTrip.find((r) => normalizeNameForDedup(r.name) === normalizedName);
    if (duplicate) {
      throw new DuplicateResultError("food find", input.name, duplicate.id);
    }

    const now = nowIso();
    const result: FoodResult = {
      id: generateId("food"),
      tripId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ...input,
      name: input.name.trim(),
    };
    await store.add(result);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({ tripId, entityType: "foodResults", entityId: result.id, action: "create", after: result }),
    );
    return result;
  });
}

/** Idempotent, matching accommodationResultsRepo's deleteAccommodationResult. */
export async function deleteFoodResult(id: string): Promise<void> {
  await withWriteTransaction(["foodResults", "changeLog"], async (tx) => {
    const store = tx.objectStore("foodResults");
    const existing = await store.get(id);
    if (!existing) return;
    await store.delete(id);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({ tripId: existing.tripId, entityType: "foodResults", entityId: id, action: "delete", before: existing }),
    );
  });
}
