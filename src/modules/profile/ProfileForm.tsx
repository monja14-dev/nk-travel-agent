import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  getOrCreateDefaultProfile,
  updateProfile,
  type ProfilePatch,
} from "../../db/repositories/travelerProfilesRepo";
import { StaleRevisionError } from "../../lib/errors";
import type { TravelerProfile } from "../../db/schema";
import type { View } from "../../navigation/types";

interface ProfileFormProps {
  onNavigate: (view: View) => void;
}

type FormState = {
  priorityOrder: string; // comma-separated while editing
  accommodationPreferences: string;
  foodPreferences: string;
  pace: TravelerProfile["pace"];
  rawProfileText: string;
};

const PACE_OPTIONS: TravelerProfile["pace"][] = ["relaxed", "comfortable", "structured", "packed"];

function fromProfile(profile: TravelerProfile): FormState {
  return {
    priorityOrder: profile.priorityOrder.join(", "),
    accommodationPreferences: profile.accommodationPreferences,
    foodPreferences: profile.foodPreferences,
    pace: profile.pace,
    rawProfileText: profile.rawProfileText,
  };
}

function toPatch(form: FormState): ProfilePatch {
  return {
    priorityOrder: form.priorityOrder
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    accommodationPreferences: form.accommodationPreferences,
    foodPreferences: form.foodPreferences,
    pace: form.pace,
    rawProfileText: form.rawProfileText,
  };
}

export default function ProfileForm({ onNavigate }: ProfileFormProps) {
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrCreateDefaultProfile()
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded);
        setForm(fromProfile(loaded));
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
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    // See the matching comment in TripForm.tsx — the cast is needed
    // because TS widens a generically-keyed computed property to an index
    // signature instead of preserving the literal-key structure.
    setForm((prev) => (prev ? (({ ...prev, [key]: value }) as FormState) : prev));
    setSavedAt(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !form) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const updated = await updateProfile(profile.id, toPatch(form), profile.revision);
      setProfile(updated);
      setForm(fromProfile(updated));
      setSavedAt(Date.now());
    } catch (err) {
      if (err instanceof StaleRevisionError) {
        setSubmitError("The profile was changed elsewhere since this page loaded. Reload the page and try again.");
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === "loading") {
    return <div className="max-w-xl w-full mx-auto px-6 py-8 text-slate-500 text-sm">Loading profile…</div>;
  }
  if (loadState === "error" || !profile || !form) {
    return (
      <div className="max-w-xl w-full mx-auto px-6 py-8">
        <p className="text-red-700 text-sm">Couldn't load the couple profile: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl w-full mx-auto px-6 py-8">
      <button
        type="button"
        onClick={() => onNavigate({ name: "dashboard" })}
        className="text-sm text-slate-500 underline mb-4"
      >
        ← Back to dashboard
      </button>

      <h1 className="text-xl font-semibold text-slate-900 mb-1">Couple Travel Profile</h1>
      <p className="text-sm text-slate-500 mb-6">
        Shared defaults for every trip. A trip with its own preferences (set from its details page)
        overrides these for that trip only — editing this profile never touches a trip's override.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Priority order (comma-separated, most important first)">
          <input
            className={inputClass}
            value={form.priorityOrder}
            onChange={(e) => updateField("priorityOrder", e.target.value)}
          />
        </Field>

        <Field label="Pace">
          <select
            className={inputClass}
            value={form.pace}
            onChange={(e) => updateField("pace", e.target.value as TravelerProfile["pace"])}
          >
            {PACE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Accommodation preferences">
          <textarea
            className={inputClass}
            rows={3}
            value={form.accommodationPreferences}
            onChange={(e) => updateField("accommodationPreferences", e.target.value)}
          />
        </Field>

        <Field label="Food preferences">
          <textarea
            className={inputClass}
            rows={3}
            value={form.foodPreferences}
            onChange={(e) => updateField("foodPreferences", e.target.value)}
          />
        </Field>

        <Field label="Full profile notes">
          <textarea
            className={inputClass}
            rows={4}
            value={form.rawProfileText}
            onChange={(e) => updateField("rawProfileText", e.target.value)}
          />
        </Field>

        {submitError ? <p className="text-red-700 text-sm">{submitError}</p> : null}
        {savedAt ? <p className="text-emerald-700 text-sm">Saved.</p> : null}

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
