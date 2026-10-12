import { useEffect, useState } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import { listExpensesForTrip, createExpense, deleteExpense } from "../../db/repositories/expensesRepo";
import { computeBudgetTotals } from "./budgetMath";
import { ValidationError } from "../../lib/errors";
import type { ExpenseInput } from "./validation";
import type { Trip, Expense, ExpenseKind } from "../../db/schema";
import type { View } from "../../navigation/types";

const EXPENSE_KINDS: ExpenseKind[] = ["fixed", "variable", "optional"];

export default function BudgetTracker({ tripId, onNavigate }: { tripId: string; onNavigate: (view: View) => void }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<ExpenseKind>("variable");
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoadState("loading");
    try {
      const loadedTrip = await getTrip(tripId);
      if (!loadedTrip) {
        setLoadState("not-found");
        return;
      }
      setTrip(loadedTrip);
      setExpenses(await listExpensesForTrip(tripId));
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoadState("error");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function handleAdd() {
    setSaving(true);
    setFieldErrors({});
    const input: ExpenseInput = {
      kind,
      category,
      label,
      plannedAmount: Number(plannedAmount),
      actualAmount: actualAmount ? Number(actualAmount) : undefined,
      currency,
      notes: notes || undefined,
    };
    try {
      await createExpense(tripId, input);
      setCategory("");
      setLabel("");
      setPlannedAmount("");
      setActualAmount("");
      setNotes("");
      await reload();
    } catch (err) {
      if (err instanceof ValidationError) setFieldErrors(err.fieldErrors);
      else setFieldErrors({ _general: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteExpense(id);
    await reload();
  }

  if (loadState === "loading") return <div className="max-w-2xl w-full mx-auto px-6 py-8 text-slate-500 text-sm">Loading budget…</div>;
  if (loadState === "not-found" || !trip) {
    return (
      <div className="max-w-2xl w-full mx-auto px-6 py-8">
        <p className="text-slate-700 mb-3">That trip no longer exists.</p>
        <button type="button" onClick={() => onNavigate({ name: "dashboard" })} className="text-sm font-medium text-slate-900 underline">
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="max-w-2xl w-full mx-auto px-6 py-8">
        <p className="text-red-700 text-sm">Couldn't load this budget: {loadError}</p>
      </div>
    );
  }

  const totals = computeBudgetTotals(expenses, trip.travelerCount);

  return (
    <div className="max-w-2xl w-full mx-auto px-6 py-8">
      <button type="button" onClick={() => onNavigate({ name: "trip-details", tripId })} className="text-sm text-slate-500 underline mb-4">
        ← Back to {trip.name}
      </button>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Budget</h1>
      <p className="text-sm text-slate-500 mb-6">
        Planned vs. actual, by currency. "Actual" only counts expenses that have a logged actual amount — it never
        assumes an unlogged expense matched what was planned.
      </p>

      {totals.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 mb-6 space-y-3">
          {totals.map((t) => (
            <div key={t.currency} className="text-sm">
              <p className="font-medium text-slate-900">{t.currency}</p>
              <p className="text-slate-600">
                Planned: {t.totalPlanned.toFixed(2)} ({t.perPersonPlanned.toFixed(2)}/person) · Actual logged:{" "}
                {t.totalActualKnown.toFixed(2)} ({t.perPersonActualKnown.toFixed(2)}/person)
                {t.missingActualCount > 0 ? ` · ${t.missingActualCount} expense(s) with no actual logged yet` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic mb-6">No expenses logged yet.</p>
      )}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white mb-6">
        {expenses.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-2 text-sm gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <span className="font-medium text-slate-900">{e.label}</span>{" "}
              <span className="text-xs text-slate-400">({e.kind}, {e.category})</span>
              <p className="text-xs text-slate-500 truncate">
                Planned {e.plannedAmount} {e.currency}
                {e.actualAmount !== undefined ? ` · Actual ${e.actualAmount} ${e.currency}` : " · Actual not logged"}
              </p>
            </div>
            <button type="button" onClick={() => handleDelete(e.id)} className="text-xs font-medium text-red-700 underline shrink-0">
              Delete
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Add an expense</h2>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <label className="block">
            <span className="block text-xs text-slate-500 mb-0.5">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)} className="w-full border rounded px-2 py-1 text-sm">
              {EXPENSE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-slate-500 mb-0.5">Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
            {fieldErrors.category ? <span className="text-xs text-red-700">{fieldErrors.category}</span> : null}
          </label>
          <label className="block">
            <span className="block text-xs text-slate-500 mb-0.5">Label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
            {fieldErrors.label ? <span className="text-xs text-red-700">{fieldErrors.label}</span> : null}
          </label>
          <label className="block">
            <span className="block text-xs text-slate-500 mb-0.5">Currency</span>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
            {fieldErrors.currency ? <span className="text-xs text-red-700">{fieldErrors.currency}</span> : null}
          </label>
          <label className="block">
            <span className="block text-xs text-slate-500 mb-0.5">Planned amount</span>
            <input value={plannedAmount} onChange={(e) => setPlannedAmount(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
            {fieldErrors.plannedAmount ? <span className="text-xs text-red-700">{fieldErrors.plannedAmount}</span> : null}
          </label>
          <label className="block">
            <span className="block text-xs text-slate-500 mb-0.5">Actual amount (optional)</span>
            <input value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
            {fieldErrors.actualAmount ? <span className="text-xs text-red-700">{fieldErrors.actualAmount}</span> : null}
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-slate-500 mb-0.5">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
          </label>
        </div>
        {fieldErrors._general ? <p className="text-xs text-red-700 mb-2">{fieldErrors._general}</p> : null}
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !category.trim() || !label.trim() || !plannedAmount || !currency.trim()}
          className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add expense"}
        </button>
      </div>
    </div>
  );
}
