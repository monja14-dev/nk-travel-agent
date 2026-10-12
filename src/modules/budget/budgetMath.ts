import type { Expense } from "../../db/schema";

/**
 * Pure, DB-free budget totals — grouped by currency rather than summed
 * across all expenses blindly, since a real trip legitimately mixes
 * currencies (e.g. a USD flight booked ahead, PHP/TWD day-to-day spend).
 * Summing raw numbers across different currencies would produce a
 * meaningless figure, so each currency gets its own planned/actual
 * totals and per-person split.
 *
 * "Actual" is only ever a sum of expenses that HAVE an actualAmount
 * recorded — never assumed equal to the planned amount for an expense
 * that hasn't actually happened yet. `missingActualCount` says how many
 * entries in that currency are still planned-only, so the UI/export can
 * show "actual total (3 of 5 logged)" rather than a falsely-complete
 * number.
 */

export interface CurrencyBudgetTotals {
  currency: string;
  totalPlanned: number;
  totalActualKnown: number;
  missingActualCount: number;
  perPersonPlanned: number;
  perPersonActualKnown: number;
}

export function computeBudgetTotals(expenses: Expense[], travelerCount: number): CurrencyBudgetTotals[] {
  const byCurrency = new Map<string, { planned: number; actualKnown: number; missing: number }>();

  for (const expense of expenses) {
    const bucket = byCurrency.get(expense.currency) ?? { planned: 0, actualKnown: 0, missing: 0 };
    bucket.planned += expense.plannedAmount;
    if (expense.actualAmount !== undefined) {
      bucket.actualKnown += expense.actualAmount;
    } else {
      bucket.missing += 1;
    }
    byCurrency.set(expense.currency, bucket);
  }

  const divisor = travelerCount > 0 ? travelerCount : 1;
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, totals]) => ({
      currency,
      totalPlanned: totals.planned,
      totalActualKnown: totals.actualKnown,
      missingActualCount: totals.missing,
      perPersonPlanned: totals.planned / divisor,
      perPersonActualKnown: totals.actualKnown / divisor,
    }));
}
