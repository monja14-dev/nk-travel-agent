import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createTrip, getTrip, updateTrip } from "../../db/repositories/tripsRepo";
import { validateTripInput, hasErrors, type TripInput, type TripFieldErrors } from "./validation";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../lib/errors";
import type { View } from "../../navigation/types";

interface TripFormProps {
  /** Present = editing that trip; absent = creating a new one. */
  tripId?: string;
  onNavigate: (view: View) => void;
}

type FormState = {
  name: string;
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  travelerCount: string; // kept as string while editing; parsed on submit
  roomCount: string;
  notes: string;
};

const BLANK_FORM: FormState = {
  name: "",
  destination: "",
  country: "",
  startDate: "",
  endDate: "",
  travelerCount: "2",
  roomCount: "",
  notes: "",
};

function toTripInput(form: FormState): TripInput {
  return {
    name: form.name,
    destination: form.destination,
    country: form.country,
    startDate: form.startDate,
    endDate: form.endDate,
    travelerCount: Number(form.travelerCount),
    roomCount: form.roomCount.trim() === "" ? undefined : Number(form.roomCount),
    notes: form.notes.trim() === "" ? undefined : form.notes,
  };
}

export default function TripForm({ tripId, onNavigate }: TripFormProps) {
  const isEditing = tripId !== undefined;

  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [expectedRevision, setExpectedRevision] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TripFieldErrors>({});
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">(
    isEditing ? "loading" : "ready",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tripId === undefined) return;
    let cancelled = false;
    getTrip(tripId)
      .then((trip) => {
        if (cancelled) return;
        if (!trip) {
          setLoadState("not-found");
          return;
        }
        setForm({
          name: trip.name,
          destination: trip.destination,
          country: trip.country,
          startDate: trip.startDate,
          endDate: trip.endDate,
          travelerCount: String(trip.travelerCount),
          roomCount: trip.roomCount !== undefined ? String(trip.roomCount) : "",
          notes: trip.notes ?? "",
        });
        setExpectedRevision(trip.revision);
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
  }, [isEditing, tripId]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    // Cast needed: TS widens a computed property keyed by a generic `K` to
    // an index signature rather than preserving the literal-key structure,
    // so without it the spread's inferred type isn't seen as assignable
    // back to `FormState` even though it structurally always is here.
    setForm((prev) => ({ ...prev, [key]: value }) as FormState);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const input = toTripInput(form);
    const errors = validateTripInput(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      // Narrowing on `tripId !== undefined` directly (rather than on the
      // `isEditing` boolean) so this type-checks without depending on
      // whether TS retains alias-based narrowing into this nested closure.
      const trip =
        tripId !== undefined && expectedRevision !== null
          ? await updateTrip(tripId, input, expectedRevision)
          : await createTrip(input);
      onNavigate({ name: "trip-details", tripId: trip.id });
    } catch (err) {
      if (err instanceof ValidationError) {
        setFieldErrors(err.fieldErrors as TripFieldErrors);
      } else if (err instanceof StaleRevisionError) {
        setSubmitError(
          "This trip was changed elsewhere since you opened it. Go back and reopen it to see the latest version before editing.",
        );
      } else if (err instanceof NotFoundError) {
        setSubmitError("This trip no longer exists.");
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === "loading") {
    return <div className="max-w-xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8 text-ink-muted text-sm">Loading trip…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="max-w-xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-ink mb-3">That trip no longer exists.</p>
        <button
          type="button"
          onClick={() => onNavigate({ name: "dashboard" })}
          className="text-sm font-medium text-accent underline"
        >
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="max-w-xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-danger-text text-sm">Couldn't load this trip: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold text-ink mb-6">{isEditing ? "Edit Trip" : "New Trip"}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Trip name" error={fieldErrors.name}>
          <input
            className={inputClass(fieldErrors.name)}
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Destination" error={fieldErrors.destination}>
            <input
              className={inputClass(fieldErrors.destination)}
              value={form.destination}
              onChange={(e) => updateField("destination", e.target.value)}
            />
          </Field>
          <Field label="Country" error={fieldErrors.country}>
            <input
              className={inputClass(fieldErrors.country)}
              value={form.country}
              onChange={(e) => updateField("country", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Start date" error={fieldErrors.startDate}>
            <input
              type="date"
              className={inputClass(fieldErrors.startDate)}
              value={form.startDate}
              onChange={(e) => updateField("startDate", e.target.value)}
            />
          </Field>
          <Field label="End date" error={fieldErrors.endDate}>
            <input
              type="date"
              className={inputClass(fieldErrors.endDate)}
              value={form.endDate}
              onChange={(e) => updateField("endDate", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Travelers" error={fieldErrors.travelerCount}>
            <input
              type="number"
              min={1}
              className={inputClass(fieldErrors.travelerCount)}
              value={form.travelerCount}
              onChange={(e) => updateField("travelerCount", e.target.value)}
            />
          </Field>
          <Field label="Rooms (optional)" error={fieldErrors.roomCount}>
            <input
              type="number"
              min={1}
              className={inputClass(fieldErrors.roomCount)}
              value={form.roomCount}
              onChange={(e) => updateField("roomCount", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea
            className={inputClass(undefined)}
            rows={3}
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
          />
        </Field>

        {submitError ? <p className="text-danger-text text-sm">{submitError}</p> : null}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-accent text-navy-bg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Saving…" : isEditing ? "Save changes" : "Create trip"}
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate(tripId !== undefined ? { name: "trip-details", tripId } : { name: "dashboard" })
            }
            className="text-sm text-ink-muted underline"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function inputClass(error: string | undefined): string {
  return `w-full rounded-lg border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-3 py-2 text-sm ${
    error ? "border-danger/60" : "border-navy-border"
  }`;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-1">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger-text mt-1">{error}</span> : null}
    </label>
  );
}
