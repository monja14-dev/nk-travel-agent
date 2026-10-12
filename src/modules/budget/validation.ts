import type { ExpenseKind } from "../../db/schema";

export type FieldErrors = Record<string, string>;
export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

const EXPENSE_KINDS: ExpenseKind[] = ["fixed", "variable", "optional"];

export interface ExpenseInput {
  kind: ExpenseKind;
  category: string;
  label: string;
  plannedAmount: number;
  actualAmount?: number;
  currency: string;
  linkedItineraryItemId?: string;
  notes?: string;
}

export function validateExpenseInput(input: ExpenseInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!EXPENSE_KINDS.includes(input.kind)) errors.kind = `Kind must be one of: ${EXPENSE_KINDS.join(", ")}.`;
  if (!input.category.trim()) errors.category = "Category is required.";
  if (!input.label.trim()) errors.label = "Label is required.";
  if (!Number.isFinite(input.plannedAmount) || input.plannedAmount < 0) {
    errors.plannedAmount = "Planned amount must be a non-negative number.";
  }
  if (input.actualAmount !== undefined && (!Number.isFinite(input.actualAmount) || input.actualAmount < 0)) {
    errors.actualAmount = "Actual amount must be a non-negative number.";
  }
  if (!input.currency.trim()) errors.currency = "Currency is required.";
  return errors;
}
