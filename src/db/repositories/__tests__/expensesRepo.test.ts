import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { resetTestDb } from "./testSupport";
import { createExpense, updateExpense, deleteExpense, listExpensesForTrip } from "../expensesRepo";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../../lib/errors";
import type { ExpenseInput } from "../../../modules/budget/validation";

const TRIP_A = "trip_a";
const TRIP_B = "trip_b";

function sampleInput(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return { kind: "variable", category: "food", label: "Dinner", plannedAmount: 500, currency: "PHP", ...overrides };
}

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("expensesRepo", () => {
  it("creates an expense with revision 1", async () => {
    const expense = await createExpense(TRIP_A, sampleInput());
    expect(expense.id).toMatch(/^expense_/);
    expect(expense.revision).toBe(1);
  });

  it("rejects invalid input and writes nothing", async () => {
    await expect(createExpense(TRIP_A, sampleInput({ label: "" }))).rejects.toBeInstanceOf(ValidationError);
    expect(await listExpensesForTrip(TRIP_A)).toHaveLength(0);
  });

  it("rejects a negative planned amount", async () => {
    await expect(createExpense(TRIP_A, sampleInput({ plannedAmount: -10 }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("isolates expenses per trip", async () => {
    await createExpense(TRIP_A, sampleInput());
    await createExpense(TRIP_B, sampleInput());
    expect(await listExpensesForTrip(TRIP_A)).toHaveLength(1);
    expect(await listExpensesForTrip(TRIP_B)).toHaveLength(1);
  });

  it("updates an expense, preserving unpatched fields, and bumps revision", async () => {
    const expense = await createExpense(TRIP_A, sampleInput());
    const updated = await updateExpense(expense.id, { actualAmount: 480 }, expense.revision);
    expect(updated.actualAmount).toBe(480);
    expect(updated.label).toBe("Dinner");
    expect(updated.revision).toBe(2);
  });

  it("throws StaleRevisionError on a revision mismatch", async () => {
    const expense = await createExpense(TRIP_A, sampleInput());
    await expect(updateExpense(expense.id, { actualAmount: 1 }, expense.revision + 1)).rejects.toBeInstanceOf(StaleRevisionError);
  });

  it("throws NotFoundError for a missing expense", async () => {
    await expect(updateExpense("expense_missing", {}, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes idempotently", async () => {
    const expense = await createExpense(TRIP_A, sampleInput());
    await deleteExpense(expense.id);
    await expect(deleteExpense(expense.id)).resolves.toBeUndefined();
    expect(await listExpensesForTrip(TRIP_A)).toHaveLength(0);
  });
});
