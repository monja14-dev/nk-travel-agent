import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  getOverrideForTrip,
  upsertOverrideForTrip,
  clearOverrideForTrip,
  type TripOverrideInput,
} from "../../db/repositories/tripOverridesRepo";
import { getTrip } from "../../db/repositories/tripsRepo";
import { StaleRevisionError } from "../../lib/errors";
import type { TripOverride } from "../../db/schema";
import type { View } from "../../navigation/types";

interface TripOverrideFormProps {
  tripId: string;
  onNavigate: (view: View) => void;
}

type FormState = {
  currency: string;
  budgetTargetMin: string;
  budgetTargetMax: string;
  mustHaveAmenities: string; // comma-separated while editing
  hotelVsAirbnbOpen: boolean;
  rawOverrideText: string;
};

const BLANK_FORM: FormState = {
  currency: "PHP",
  budgetTargetMin: "",
  budgetTargetMax: "",
  mustHaveAmenities: "",
  hotelVsAirbnbOpen: true,
  rawOverrideText: "",
};

/**
 * tripOverridesRepo deliberately has no field-level validator of its own
 * (unlike trips) — the override shape is simple enough that the UI boundary
 * is where it's worth checking budget-min-vs-max and numeric parsing, rather
 * than adding a new validator module (and its own tests) for Phase 2's
 * scope. Anything that passes here is well-formed by the time it reaches
 * the repo.
 */
function validateOverrideForm(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};

  const min = form.budgetTargetMin.trim() === "" ? undefined : Number(form.budgetTargetMin);
  const max = form.budgetTargetMax.trim() === "" ? undefined : Number(form.budgetTargetMax);

  if (min !== undefined && (!Number.isFinite(min) || min < 0)) {
    errors.budgetTargetMin = "Must be a non-negative number.";
  }
  if (max !== undefined && (!Number.isFinite(max) || max < 0)) {
    errors.budgetTargetMax = "Must be a non-negative number.";
  }
  if (min !== undefined && max !== undefined && min > max && !errors.budgetTargetMin && !errors.budgetTargetMax) {
    errors.budgetTargetMax = "Maximum budget can't be less than the minimum.";
  }
  if (!form.currency.trim()) {
    errors.currency = "Currency is required.";
  }

  return errors;
}

function toOverrideInput(form: FormState): TripOverrideInput {
  return {
    currency: form.currency.trim(),
    budgetTargetMin: form.budgetTargetMin.trim() === "" ? undefined : Number(form.budgetTargetMin),
    budgetTargetMax: form.budgetTargetMax.trim() === "" ? undefined : Number(form.budgetTargetMax),
    mustHaveAmenities: form.mustHaveAmenities
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    hotelVsAirbnbOpen: form.hotelVsAirbnbOpen,
    rawOverrideText: form.rawOverrideText,
  };
}

export default function TripOverrideForm({ tripId, onNavigate }: TripOverrideFormProps) {
  const [tripName, setTripName] = useState<string | null>(null);
  const [existing, setExisting] = useState<TripOverride | undefined>(undefined);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrip(tripId), getOverrideForTrip(tripId)])
      .then(([trip, override]) => {
        if (cancelled) return;
        if (!trip) {
          setLoadState("not-found");
          return;
        }
        setTripName(trip.name);
        setExisting(override);
        if (override) {
          setForm({
            currency: override.currency,
            budgetTargetMin: override.budgetTargetMin !== undefined ? String(override.budgetTargetMin) : "",
            budgetTargetMax: override.budgetTargetMax !== undefined ? String(override.budgetTargetMax) : "",
            mustHaveAmenities: override.mustHaveAmenities.join(", "),
            hotelVsAirbnbOpen: override.hotelVsAirbnbOpen,
            rawOverrideText: override.rawOverrideText,
          });
        }
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
    // See the matching comment in TripForm.tsx — the cast is needed
    // because TS widens a generically-keyed computed property to an index
    // signature instead of preserving the literal-key structure.
    setForm((prev) => ({ ...prev, [key]: value }) as FormState);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const errors = validateOverrideForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await upsertOverrideForTrip(tripId, toOverrideInput(form), existing?.revision);
      onNavigate({ name: "trip-details", tripId });
    } catch (err) {
      if (err instanceof StaleRevisionError) {
        setSubmitError(
          "These preferences were changed elsewhere since you opened this page. Go back and reopen it to see the latest version.",
        );
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClear() {
    if (!existing) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await clearOverrideForTrip(tripId, existing.revision);
      onNavigate({ name: "trip-details", tripId });
    } catch (err) {
      if (err instanceof StaleRevisionError) {
        setSubmitError(
          "These preferences were changed elsewhere since you opened this page. Go back and reopen it to see the latest version.",
        );
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
      setSubmitting(false);
    }
  }

  if (loadState === "loading") {
    return <div className="max-w-xl w-full mx-auto px-6 py-8 text-slate-500 text-sm">Loading…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="max-w-xl w-full mx-auto px-6 py-8">
        <p className="text-slate-700 mb-3">That trip no longer exists.</p>
        <button
          type="button"
          onClick={() => onNavigate({ name: "dashboard" })}
          className="text-sm font-medium text-slate-900 underline"
        >
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="max-w-xl w-full mx-auto px-6 py-8">
        <p className="text-red-700 text-sm">Couldn't load trip preferences: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl w-full mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Trip Preferences</h1>
      <p className="text-sm text-slate-500 mb-6">
        For <span className="font-medium">{tripName}</span>. These override the couple profile for this
        trip only — nothing here affects any other trip.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Currency" error={fieldErrors.currency}>
            <input
              className={inputClass(fieldErrors.currency)}
              value={form.currency}
              onChange={(e) => updateField("currency", e.target.value)}
            />
          </Field>
          <Field label="Min budget" error={fieldErrors.budgetTargetMin}>
            <input
              type="number"
              min={0}
              className={inputClass(fieldErrors.budgetTargetMin)}
              value={form.budgetTargetMin}
              onChange={(e) => updateField("budgetTargetMin", e.target.value)}
            />
          </Field>
          <Field label="Max budget" error={fieldErrors.budgetTargetMax}>
            <input
              type="number"
              min={0}
              className={inputClass(fieldErrors.budgetTargetMax)}
              value={form.budgetTargetMax}
              onChange={(e) => updateField("budgetTargetMax", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Must-have amenities (comma-separated)">
          <input
            className={inputClass(undefined)}
            placeholder="pool, breakfast included"
            value={form.mustHaveAmenities}
            onChange={(e) => updateField("mustHaveAmenities", e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.hotelVsAirbnbOpen}
            onChange={(e) => updateField("hotelVsAirbnbOpen", e.target.checked)}
            className="rounded border-slate-300"
          />
          Open to Airbnb/condo, not just hotels, for this trip
        </label>

        <Field label="Trip-specific notes (optional)">
          <textarea
            className={inputClass(undefined)}
            rows={4}
            value={form.rawOverrideText}
            onChange={(e) => updateField("rawOverrideText", e.target.value)}
          />
        </Field>

        {submitError ? <p className="text-red-700 text-sm">{submitError}</p> : null}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save preferences"}
          </button>
          {existing ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={submitting}
              className="px-4 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Clear override
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onNavigate({ name: "trip-details", tripId })}
            className="text-sm text-slate-600 underline"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function inputClass(error: string | undefined): string {
  return `w-full rounded-md border px-3 py-2 text-sm text-slate-900 ${
    error ? "border-red-400" : "border-slate-300"
  }`;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600 mt-1">{error}</span> : null}
    </label>
  );
}
