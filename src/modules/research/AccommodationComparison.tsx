import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import { listAccommodationResultsForTrip, deleteAccommodationResult } from "../../db/repositories/accommodationResultsRepo";
import { getAvailableAccommodationAdapters } from "./adapters/registry";
import { saveAccommodationResult } from "./saveResult";
import { safeHttpUrl } from "../../lib/url";
import { getDisplayVerificationStatus, VERIFICATION_LABELS } from "./verification";
import type { AccommodationResult, Trip } from "../../db/schema";
import type { View } from "../../navigation/types";
import type { FieldErrors } from "./validation";

interface AccommodationComparisonProps {
  tripId: string;
  onNavigate: (view: View) => void;
}

type LoadState = "loading" | "ready" | "not-found" | "error";

const BLANK_FORM = {
  name: "",
  propertyType: "",
  location: "",
  mapUrl: "",
  pricePerNight: "",
  currency: "PHP",
  feeLabel: "",
  feeAmount: "",
  cancellationPolicy: "",
  rating: "",
  ratingScale: "5",
  reviewCount: "",
  notes: "",
  sourceUrl: "",
  sourceLabel: "",
  verificationStatus: "estimate",
};
type FormState = typeof BLANK_FORM;

export default function AccommodationComparison({ tripId, onNavigate }: AccommodationComparisonProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [results, setResults] = useState<AccommodationResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const adapters = getAvailableAccommodationAdapters();
  const adapter = adapters[0]; // only ever one today — see docs/PHASE_LOG.md

  async function refresh() {
    const list = await listAccommodationResultsForTrip(tripId);
    setResults([...list].sort((a, b) => (a.pricePerNight ?? Infinity) - (b.pricePerNight ?? Infinity)));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrip(tripId), listAccommodationResultsForTrip(tripId)])
      .then(([loadedTrip, loadedResults]) => {
        if (cancelled) return;
        if (!loadedTrip) {
          setLoadState("not-found");
          return;
        }
        setTrip(loadedTrip);
        setResults([...loadedResults].sort((a, b) => (a.pricePerNight ?? Infinity) - (b.pricePerNight ?? Infinity)));
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
      propertyType: form.propertyType || undefined,
      location: form.location,
      mapUrl: form.mapUrl,
      pricePerNight: form.pricePerNight,
      currency: form.currency,
      mandatoryFees: form.feeLabel.trim() ? [{ label: form.feeLabel, amount: form.feeAmount }] : [],
      cancellationPolicy: form.cancellationPolicy,
      rating: form.rating,
      ratingScale: form.ratingScale,
      reviewCount: form.reviewCount,
      notes: form.notes,
      sourceUrl: form.sourceUrl,
      sourceLabel: form.sourceLabel,
      verificationStatus: form.verificationStatus,
    };

    try {
      const outcome = await saveAccommodationResult(tripId, adapter, raw);
      if (outcome.status === "saved") {
        setForm(BLANK_FORM);
        await refresh();
      } else if (outcome.status === "invalid") {
        setFieldErrors(outcome.fieldErrors);
      } else if (outcome.status === "duplicate") {
        setSubmitError(outcome.message);
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
    await deleteAccommodationResult(id);
    await refresh();
  }

  if (loadState === "loading") {
    return <div className="max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8 text-ink-muted text-sm">Loading…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-ink mb-3">That trip no longer exists.</p>
        <button type="button" onClick={() => onNavigate({ name: "dashboard" })} className="text-sm font-medium text-accent underline">
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error" || !trip) {
    return (
      <div className="max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-danger-text text-sm">Couldn't load this trip: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <button
        type="button"
        onClick={() => onNavigate({ name: "trip-details", tripId })}
        className="text-sm text-ink-muted underline mb-4"
      >
        ← Back to {trip.name}
      </button>

      <h1 className="text-xl font-semibold text-ink mb-1">Accommodation Comparison</h1>
      <p className="text-sm text-ink-muted mb-6">
        Options found through research (your own, or discussed with NK AI) — never live prices looked up
        automatically. Every row shows where it came from and how fresh it is.
      </p>

      {results.length === 0 ? (
        <p className="text-sm text-ink-faint italic mb-6">No options saved yet — add one below.</p>
      ) : (
        <div className="overflow-x-auto mb-8 rounded-lg border border-navy-border">
          <table className="w-full text-sm">
            <thead className="bg-navy-elevated text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <Th>Name</Th>
                <Th>Price/night</Th>
                <Th>Mandatory fees</Th>
                <Th>Cancellation</Th>
                <Th>Rating</Th>
                <Th>Location</Th>
                <Th>Source</Th>
                <Th>Notes</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-border">
              {results.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <div className="font-medium text-ink">{r.name}</div>
                    {r.propertyType ? <div className="text-xs text-ink-muted">{r.propertyType}</div> : null}
                  </Td>
                  <Td>
                    {r.pricePerNight !== undefined ? `${r.pricePerNight} ${r.currency ?? ""}`.trim() : "Not available"}
                  </Td>
                  <Td>
                    {r.mandatoryFees.length > 0
                      ? r.mandatoryFees
                          .map((f) => (f.amount !== undefined ? `${f.label}: ${f.amount}${f.currency ? ` ${f.currency}` : ""}` : `${f.label} (amount unknown)`))
                          .join("; ")
                      : "None known"}
                  </Td>
                  <Td>{r.cancellationPolicy || "Not available"}</Td>
                  <Td>
                    {r.rating !== undefined ? `${r.rating}/${r.ratingScale ?? "?"}` : "Not available"}
                    {r.reviewCount !== undefined ? ` (${r.reviewCount} reviews)` : ""}
                  </Td>
                  <Td>{r.location || "Not available"}</Td>
                  <Td>
                    <SourceCell attribution={r.attribution} />
                  </Td>
                  <Td>{r.notes || ""}</Td>
                  <Td>
                    <button type="button" onClick={() => handleDelete(r.id)} className="text-xs text-danger-text underline">
                      Remove
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-sm font-semibold text-ink mb-3">Add an accommodation option</h2>
      {!adapter ? (
        <p className="text-sm text-warning-text mb-4">
          No research adapter is currently available — see docs/PHASE_LOG.md for why no live provider is wired up
          yet.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-navy-border bg-navy-surface p-5">
          <Field label="Name" error={fieldErrors.name}>
            <input className={inputClass(fieldErrors.name)} value={form.name} onChange={(e) => updateField("name", e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Property type (optional)" error={fieldErrors.propertyType}>
              <select
                className={inputClass(fieldErrors.propertyType)}
                value={form.propertyType}
                onChange={(e) => updateField("propertyType", e.target.value)}
              >
                <option value="">—</option>
                <option value="hotel">Hotel</option>
                <option value="resort">Resort</option>
                <option value="airbnb">Airbnb</option>
                <option value="hostel">Hostel</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Location (optional)" error={fieldErrors.location}>
              <input className={inputClass(fieldErrors.location)} value={form.location} onChange={(e) => updateField("location", e.target.value)} />
            </Field>
          </div>

          <Field label="Map URL (optional)" error={fieldErrors.mapUrl}>
            <input className={inputClass(fieldErrors.mapUrl)} value={form.mapUrl} onChange={(e) => updateField("mapUrl", e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Price per night (optional — leave blank if unknown)" error={fieldErrors.pricePerNight}>
              <input
                type="number"
                className={inputClass(fieldErrors.pricePerNight)}
                value={form.pricePerNight}
                onChange={(e) => updateField("pricePerNight", e.target.value)}
              />
            </Field>
            <Field label="Currency" error={fieldErrors.currency}>
              <input className={inputClass(fieldErrors.currency)} value={form.currency} onChange={(e) => updateField("currency", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mandatory fee label (optional)">
              <input className={inputClass(undefined)} value={form.feeLabel} onChange={(e) => updateField("feeLabel", e.target.value)} placeholder="e.g. Environmental fee" />
            </Field>
            <Field label="Fee amount (optional)" error={fieldErrors["mandatoryFees[0].amount"]}>
              <input
                type="number"
                className={inputClass(fieldErrors["mandatoryFees[0].amount"])}
                value={form.feeAmount}
                onChange={(e) => updateField("feeAmount", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Cancellation policy (optional)">
            <textarea className={inputClass(undefined)} rows={2} value={form.cancellationPolicy} onChange={(e) => updateField("cancellationPolicy", e.target.value)} />
          </Field>

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
            {submitting ? "Saving…" : "Save option"}
          </button>
        </form>
      )}
    </div>
  );
}

function SourceCell({ attribution }: { attribution: AccommodationResult["attribution"] }) {
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
    <div>
      <span className={`inline-block text-xs rounded px-1.5 py-0.5 ${badgeClass}`}>{VERIFICATION_LABELS[status]}</span>
      {sourceHref ? (
        <div className="mt-1">
          <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-muted underline">
            {attribution.sourceLabel}
          </a>
        </div>
      ) : (
        <div className="mt-1 text-xs text-ink-faint">{attribution.sourceLabel}</div>
      )}
    </div>
  );
}

function Th({ children }: { children?: ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
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
