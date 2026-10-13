import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import { listFoodResultsForTrip, deleteFoodResult } from "../../db/repositories/foodResultsRepo";
import { getAvailableFoodAdapters } from "./adapters/registry";
import { saveFoodResult } from "./saveResult";
import { safeHttpUrl } from "../../lib/url";
import { getDisplayVerificationStatus, VERIFICATION_LABELS } from "./verification";
import type { FoodResult, FoodHunterCategory, Trip } from "../../db/schema";
import type { View } from "../../navigation/types";
import type { FieldErrors } from "./validation";

interface FoodHunterProps {
  tripId: string;
  onNavigate: (view: View) => void;
}

type LoadState = "loading" | "ready" | "not-found" | "error";

const CATEGORY_ORDER: FoodHunterCategory[] = ["must-try", "local-favorites", "hidden-gems", "budget-eats", "special-occasions"];
const CATEGORY_LABELS: Record<FoodHunterCategory, string> = {
  "must-try": "Must-Try",
  "local-favorites": "Local Favorites",
  "hidden-gems": "Hidden Gems",
  "budget-eats": "Budget Eats",
  "special-occasions": "Special Occasions",
};

const BLANK_FORM = {
  name: "",
  category: "must-try" as FoodHunterCategory,
  dishes: "",
  cuisine: "",
  priceRange: "",
  location: "",
  mapUrl: "",
  rating: "",
  ratingScale: "5",
  reviewCount: "",
  notes: "",
  sourceUrl: "",
  sourceLabel: "",
  verificationStatus: "estimate",
};
type FormState = typeof BLANK_FORM;

export default function FoodHunter({ tripId, onNavigate }: FoodHunterProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [results, setResults] = useState<FoodResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const adapters = getAvailableFoodAdapters();
  const adapter = adapters[0];

  async function refresh() {
    setResults(await listFoodResultsForTrip(tripId));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrip(tripId), listFoodResultsForTrip(tripId)])
      .then(([loadedTrip, loadedResults]) => {
        if (cancelled) return;
        if (!loadedTrip) {
          setLoadState("not-found");
          return;
        }
        setTrip(loadedTrip);
        setResults(loadedResults);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }) as FormState);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    if (!adapter) return;
    setSubmitting(true);

    const raw: Record<string, unknown> = {
      name: form.name,
      category: form.category,
      dishes: form.dishes,
      cuisine: form.cuisine,
      priceRange: form.priceRange,
      location: form.location,
      mapUrl: form.mapUrl,
      rating: form.rating,
      ratingScale: form.ratingScale,
      reviewCount: form.reviewCount,
      notes: form.notes,
      sourceUrl: form.sourceUrl,
      sourceLabel: form.sourceLabel,
      verificationStatus: form.verificationStatus,
    };

    try {
      const outcome = await saveFoodResult(tripId, adapter, raw);
      if (outcome.status === "saved") {
        setForm({ ...BLANK_FORM, category: form.category });
        await refresh();
      } else if (outcome.status === "invalid") {
        setFieldErrors(outcome.fieldErrors);
      } else {
        setSubmitError(outcome.message);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteFoodResult(id);
    await refresh();
  }

  if (loadState === "loading") {
    return <div className="max-w-3xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8 text-ink-muted text-sm">Loading…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="max-w-3xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-ink mb-3">That trip no longer exists.</p>
        <button type="button" onClick={() => onNavigate({ name: "dashboard" })} className="text-sm font-medium text-accent underline">
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error" || !trip) {
    return (
      <div className="max-w-3xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-danger-text text-sm">Couldn't load this trip: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <button
        type="button"
        onClick={() => onNavigate({ name: "trip-details", tripId })}
        className="text-sm text-ink-muted underline mb-4"
      >
        ← Back to {trip.name}
      </button>

      <h1 className="text-xl font-semibold text-ink mb-1">Food Hunter</h1>
      <p className="text-sm text-ink-muted mb-6">
        Organized the way the couple profile already describes food research — must-try, local favorites, hidden
        gems, budget eats, and special occasions. Never a live price or a claim NK AI didn't actually find.
      </p>

      <div className="space-y-8 mb-8">
        {CATEGORY_ORDER.map((category) => {
          const items = results.filter((r) => r.category === category);
          return (
            <section key={category}>
              <h2 className="text-sm font-semibold text-ink mb-3">{CATEGORY_LABELS[category]}</h2>
              {items.length === 0 ? (
                <p className="text-sm text-ink-faint italic">No finds yet in this category.</p>
              ) : (
                <div className="space-y-3">
                  {items.map((r) => (
                    <div key={r.id} className="rounded-lg border border-navy-border bg-navy-surface px-4 py-3 text-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-ink">{r.name}</p>
                          {r.cuisine ? <p className="text-xs text-ink-muted">{r.cuisine}</p> : null}
                        </div>
                        <button type="button" onClick={() => handleDelete(r.id)} className="text-xs text-danger-text underline">
                          Remove
                        </button>
                      </div>
                      <p className="text-xs text-ink-muted mt-1">
                        {r.dishes.length > 0 ? r.dishes.join(", ") : "No specific dishes noted yet"}
                      </p>
                      <p className="text-xs text-ink-muted mt-1">
                        {r.priceRange || "Price not available"}
                        {r.location ? ` · ${r.location}` : ""}
                        {r.rating !== undefined ? ` · ${r.rating}/${r.ratingScale ?? "?"}` : ""}
                        {r.reviewCount !== undefined ? ` (${r.reviewCount} reviews)` : ""}
                      </p>
                      {r.notes ? <p className="text-xs text-ink-muted mt-1">{r.notes}</p> : null}
                      <div className="mt-2">
                        <SourceBadge attribution={r.attribution} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <h2 className="text-sm font-semibold text-ink mb-3">Add a food find</h2>
      {!adapter ? (
        <p className="text-sm text-warning-text mb-4">No research adapter is currently available.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-navy-border bg-navy-surface p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name" error={fieldErrors.name}>
              <input className={inputClass(fieldErrors.name)} value={form.name} onChange={(e) => updateField("name", e.target.value)} />
            </Field>
            <Field label="Category" error={fieldErrors.category}>
              <select
                className={inputClass(fieldErrors.category)}
                value={form.category}
                onChange={(e) => updateField("category", e.target.value as FoodHunterCategory)}
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Dishes to try (comma-separated, optional)" error={fieldErrors.dishes}>
            <input className={inputClass(fieldErrors.dishes)} value={form.dishes} onChange={(e) => updateField("dishes", e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Cuisine (optional)">
              <input className={inputClass(undefined)} value={form.cuisine} onChange={(e) => updateField("cuisine", e.target.value)} />
            </Field>
            <Field label="Price range (optional)">
              <input
                className={inputClass(undefined)}
                value={form.priceRange}
                onChange={(e) => updateField("priceRange", e.target.value)}
                placeholder="e.g. ~300-500 PHP/person"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Location (optional)">
              <input className={inputClass(undefined)} value={form.location} onChange={(e) => updateField("location", e.target.value)} />
            </Field>
            <Field label="Map URL (optional)" error={fieldErrors.mapUrl}>
              <input className={inputClass(fieldErrors.mapUrl)} value={form.mapUrl} onChange={(e) => updateField("mapUrl", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Rating (optional)" error={fieldErrors.rating}>
              <input type="number" className={inputClass(fieldErrors.rating)} value={form.rating} onChange={(e) => updateField("rating", e.target.value)} />
            </Field>
            <Field label="Out of (scale)" error={fieldErrors.ratingScale}>
              <input type="number" className={inputClass(fieldErrors.ratingScale)} value={form.ratingScale} onChange={(e) => updateField("ratingScale", e.target.value)} />
            </Field>
            <Field label="Review count (optional)" error={fieldErrors.reviewCount}>
              <input type="number" className={inputClass(fieldErrors.reviewCount)} value={form.reviewCount} onChange={(e) => updateField("reviewCount", e.target.value)} />
            </Field>
          </div>

          <Field label="Notes (optional)">
            <textarea className={inputClass(undefined)} rows={2} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Source URL (optional)" error={fieldErrors["attribution.sourceUrl"]}>
              <input
                className={inputClass(fieldErrors["attribution.sourceUrl"])}
                value={form.sourceUrl}
                onChange={(e) => updateField("sourceUrl", e.target.value)}
              />
            </Field>
            <Field label="How confident is this?">
              <select className={inputClass(undefined)} value={form.verificationStatus} onChange={(e) => updateField("verificationStatus", e.target.value)}>
                <option value="verified">Verified — confirmed directly</option>
                <option value="estimate">Estimate — found but not confirmed</option>
                <option value="unknown">Unknown — not actually known</option>
              </select>
            </Field>
          </div>

          {submitError ? <p className="text-danger-text text-sm">{submitError}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-accent text-navy-bg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save find"}
          </button>
        </form>
      )}
    </div>
  );
}

function SourceBadge({ attribution }: { attribution: FoodResult["attribution"] }) {
  const status = getDisplayVerificationStatus(attribution);
  // Stored as free text: only real http(s) links become clickable.
  const sourceHref = safeHttpUrl(attribution.sourceUrl);
  const badgeClass =
    status === "verified"
      ? "bg-success-bg text-success-text"
      : status === "estimate"
        ? "bg-warning-bg text-warning-text"
        : status === "stale"
          ? "bg-warning-bg text-warning-text"
          : "bg-navy-elevated text-ink-muted";
  return (
    <span className={`inline-block text-xs rounded px-1.5 py-0.5 ${badgeClass}`}>
      {VERIFICATION_LABELS[status]}
      {sourceHref ? (
        <>
          {" · "}
          <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="underline">
            {attribution.sourceLabel}
          </a>
        </>
      ) : (
        ` · ${attribution.sourceLabel}`
      )}
    </span>
  );
}

function inputClass(error: string | undefined): string {
  return `w-full rounded-lg border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-3 py-2 text-sm ${error ? "border-danger/60" : "border-navy-border"}`;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-1">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger-text mt-1">{error}</span> : null}
    </label>
  );
}
