import { getReadyDb, withWriteTransaction } from "../client";
import type { Expense } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../lib/errors";
import { validateExpenseInput, hasErrors, type ExpenseInput } from "../../modules/budget/validation";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function listExpensesForTrip(tripId: string): Promise<Expense[]> {
  return getReadyDb().getAllFromIndex("expenses", "by-trip", tripId);
}

export async function createExpense(tripId: string, input: ExpenseInput): Promise<Expense> {
  const errors = validateExpenseInput(input);
  if (hasErrors(errors)) throw new ValidationError(errors);

  const now = nowIso();
  const expense: Expense = {
    id: generateId("expense"),
    tripId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    kind: input.kind,
    category: input.category.trim(),
    label: input.label.trim(),
    plannedAmount: input.plannedAmount,
    actualAmount: input.actualAmount,
    currency: input.currency.trim(),
    linkedItineraryItemId: input.linkedItineraryItemId,
    notes: input.notes?.trim() || undefined,
  };

  await withWriteTransaction(["expenses", "changeLog"], async (tx) => {
    await tx.objectStore("expenses").add(expense);
    await tx
      .objectStore("changeLog")
      .add(buildChangeLogEntry({ tripId, entityType: "expenses", entityId: expense.id, action: "create", after: expense }));
  });
  return expense;
}

export async function updateExpense(
  id: string,
  patch: Partial<ExpenseInput>,
  expectedRevision: number,
): Promise<Expense> {
  return withWriteTransaction(["expenses", "changeLog"], async (tx) => {
    const store = tx.objectStore("expenses");
    const existing = await store.get(id);
    if (!existing) throw new NotFoundError("Expense", id);
    if (existing.revision !== expectedRevision) throw new StaleRevisionError("Expense", id);

    const merged: ExpenseInput = {
      kind: patch.kind ?? existing.kind,
      category: patch.category ?? existing.category,
      label: patch.label ?? existing.label,
      plannedAmount: patch.plannedAmount ?? existing.plannedAmount,
      actualAmount: "actualAmount" in patch ? patch.actualAmount : existing.actualAmount,
      currency: patch.currency ?? existing.currency,
      linkedItineraryItemId: "linkedItineraryItemId" in patch ? patch.linkedItineraryItemId : existing.linkedItineraryItemId,
      notes: "notes" in patch ? patch.notes : existing.notes,
    };
    const errors = validateExpenseInput(merged);
    if (hasErrors(errors)) throw new ValidationError(errors);

    const updated: Expense = {
      ...existing,
      ...merged,
      category: merged.category.trim(),
      label: merged.label.trim(),
      currency: merged.currency.trim(),
      notes: merged.notes?.trim() || undefined,
      revision: existing.revision + 1,
      updatedAt: nowIso(),
    };
    await store.put(updated);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId: existing.tripId,
        entityType: "expenses",
        entityId: id,
        action: "update",
        before: existing,
        after: updated,
      }),
    );
    return updated;
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await withWriteTransaction(["expenses", "changeLog"], async (tx) => {
    const store = tx.objectStore("expenses");
    const existing = await store.get(id);
    if (!existing) return;
    await store.delete(id);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({ tripId: existing.tripId, entityType: "expenses", entityId: id, action: "delete", before: existing }),
    );
  });
}
