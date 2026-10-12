import { describe, it, expect } from "vitest";
import { computeBudgetTotals } from "../budgetMath";
import type { Expense } from "../../../db/schema";

function expense(overrides: Partial<Expense> & { id: string }): Expense {
  return {
    tripId: "trip_a",
    revision: 1,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
    kind: "variable",
    category: "food",
    label: "Dinner",
    plannedAmount: 100,
    currency: "PHP",
    ...overrides,
  };
}

describe("computeBudgetTotals", () => {
  it("returns an empty array for no expenses", () => {
    expect(computeBudgetTotals([], 2)).toEqual([]);
  });

  it("sums planned amounts and per-person split for a single currency", () => {
    const totals = computeBudgetTotals(
      [expense({ id: "1", plannedAmount: 1000, currency: "PHP" }), expense({ id: "2", plannedAmount: 500, currency: "PHP" })],
      2,
    );
    expect(totals).toEqual([
      {
        currency: "PHP",
        totalPlanned: 1500,
        totalActualKnown: 0,
        missingActualCount: 2,
        perPersonPlanned: 750,
        perPersonActualKnown: 0,
      },
    ]);
  });

  it("never assumes actual == planned for an expense with no logged actual amount", () => {
    const totals = computeBudgetTotals(
      [expense({ id: "1", plannedAmount: 1000, actualAmount: 1200, currency: "PHP" }), expense({ id: "2", plannedAmount: 500, currency: "PHP" })],
      1,
    );
    const php = totals.find((t) => t.currency === "PHP")!;
    expect(php.totalPlanned).toBe(1500);
    expect(php.totalActualKnown).toBe(1200); // only the one with a logged actual
    expect(php.missingActualCount).toBe(1);
  });

  it("keeps different currencies in separate totals rather than summing them together", () => {
    const totals = computeBudgetTotals(
      [expense({ id: "1", plannedAmount: 1000, currency: "PHP" }), expense({ id: "2", plannedAmount: 50, currency: "USD" })],
      1,
    );
    expect(totals).toHaveLength(2);
    expect(totals.map((t) => t.currency).sort()).toEqual(["PHP", "USD"]);
  });

  it("sorts currencies alphabetically for stable output", () => {
    const totals = computeBudgetTotals(
      [expense({ id: "1", currency: "USD" }), expense({ id: "2", currency: "PHP" }), expense({ id: "3", currency: "TWD" })],
      1,
    );
    expect(totals.map((t) => t.currency)).toEqual(["PHP", "TWD", "USD"]);
  });

  it("treats a traveler count of 0 as 1 to avoid dividing by zero", () => {
    const totals = computeBudgetTotals([expense({ id: "1", plannedAmount: 1000, currency: "PHP" })], 0);
    expect(totals[0].perPersonPlanned).toBe(1000);
  });
});
