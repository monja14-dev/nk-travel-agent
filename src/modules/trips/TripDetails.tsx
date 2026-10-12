import { useEffect, useState, type ReactNode } from "react";
import { getTrip, archiveTrip, unarchiveTrip, duplicateTrip } from "../../db/repositories/tripsRepo";
import { getOrCreateDefaultProfile } from "../../db/repositories/travelerProfilesRepo";
import { getOverrideForTrip } from "../../db/repositories/tripOverridesRepo";
import { getEffectiveTripSettings, type EffectiveTripSettings } from "./effectiveSettings";
import type { Trip, TravelerProfile, TripOverride } from "../../db/schema";
import type { View } from "../../navigation/types";

interface TripDetailsProps {
  tripId: string;
  onNavigate: (view: View) => void;
}

type LoadState = "loading" | "ready" | "not-found" | "error";

export default function TripDetails({ tripId, onNavigate }: TripDetailsProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [override, setOverride] = useState<TripOverride | undefined>(undefined);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setActionError(null);

    Promise.all([getTrip(tripId), getOrCreateDefaultProfile(), getOverrideForTrip(tripId)])
      .then(([loadedTrip, loadedProfile, loadedOverride]) => {
        if (cancelled) return;
        if (!loadedTrip) {
          setLoadState("not-found");
          return;
        }
        setTrip(loadedTrip);
        setProfile(loadedProfile);
        setOverride(loadedOverride);
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

  async function handleArchiveToggle() {
    if (!trip) return;
    setActionPending(true);
    setActionError(null);
    try {
      const updated =
        trip.status === "archived"
          ? await unarchiveTrip(trip.id, trip.revision)
          : await archiveTrip(trip.id, trip.revision);
      setTrip(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(false);
    }
  }

  async function handleDuplicate() {
    if (!trip) return;
    setActionPending(true);
    setActionError(null);
    try {
      const copy = await duplicateTrip(trip.id);
      onNavigate({ name: "trip-details", tripId: copy.id });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setActionPending(false);
    }
  }

  if (loadState === "loading") {
    return <div className="max-w-2xl w-full mx-auto px-6 py-8 text-slate-500 text-sm">Loading trip…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="max-w-2xl w-full mx-auto px-6 py-8">
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
  if (loadState === "error" || !trip || !profile) {
    return (
      <div className="max-w-2xl w-full mx-auto px-6 py-8">
        <p className="text-red-700 text-sm">Couldn't load this trip: {loadError}</p>
      </div>
    );
  }

  const effective = getEffectiveTripSettings(profile, override);

  return (
    <div className="max-w-2xl w-full mx-auto px-6 py-8">
      <button
        type="button"
        onClick={() => onNavigate({ name: "dashboard" })}
        className="text-sm text-slate-500 underline mb-4"
      >
        ← Back to dashboard
      </button>

      <div className="flex items-start justify-between mb-2">
        <h1 className="text-xl font-semibold text-slate-900">{trip.name}</h1>
        <span className="text-xs uppercase tracking-wide text-slate-500 mt-1">{trip.status}</span>
      </div>
      <p className="text-slate-600 mb-6">
        {trip.destination}, {trip.country} · {trip.startDate} to {trip.endDate} · {trip.travelerCount}{" "}
        traveler{trip.travelerCount === 1 ? "" : "s"}
        {trip.roomCount ? ` · ${trip.roomCount} room${trip.roomCount === 1 ? "" : "s"}` : ""}
      </p>
      {trip.notes ? <p className="text-sm text-slate-600 mb-6 whitespace-pre-wrap">{trip.notes}</p> : null}

      <div className="flex flex-wrap gap-2 mb-8">
        <ActionButton onClick={() => onNavigate({ name: "trip-edit", tripId: trip.id })}>Edit</ActionButton>
        <ActionButton onClick={handleDuplicate} disabled={actionPending}>
          Duplicate
        </ActionButton>
        <ActionButton onClick={handleArchiveToggle} disabled={actionPending}>
          {trip.status === "archived" ? "Unarchive" : "Archive"}
        </ActionButton>
        <ActionButton onClick={() => onNavigate({ name: "trip-override", tripId: trip.id })}>
          Edit trip preferences
        </ActionButton>
      </div>

      {actionError ? <p className="text-red-700 text-sm mb-4">{actionError}</p> : null}

      <EffectivePreferences effective={effective} hasOverride={override !== undefined} />
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function EffectivePreferences({
  effective,
  hasOverride,
}: {
  effective: EffectiveTripSettings;
  hasOverride: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Effective Preferences for This Trip</h2>
      <p className="text-xs text-slate-500 mb-4">
        {hasOverride
          ? "This trip has its own preference overrides, shown below in place of the couple profile defaults."
          : "This trip has no overrides yet — it inherits the couple profile and app defaults below."}
      </p>

      <dl className="space-y-3 text-sm">
        <Row label="Priority order">{effective.priorityOrder.join(", ")}</Row>
        <Row label="Pace">{effective.pace}</Row>
        <Row label="Accommodation preferences">{effective.accommodationPreferences}</Row>
        <Row label="Food preferences">{effective.foodPreferences}</Row>
        <Row label="Currency">{effective.currency}</Row>
        <Row label="Budget" source={effective.sources.budget}>
          {effective.budgetTargetMin !== undefined || effective.budgetTargetMax !== undefined
            ? `${effective.budgetTargetMin ?? "?"} – ${effective.budgetTargetMax ?? "?"} ${effective.currency}`
            : "Not set"}
        </Row>
        <Row label="Must-have amenities" source={effective.sources.mustHaveAmenities}>
          {effective.mustHaveAmenities.length > 0 ? effective.mustHaveAmenities.join(", ") : "None set"}
        </Row>
        <Row label="Open to Airbnb (not just hotels)" source={effective.sources.hotelVsAirbnbOpen}>
          {effective.hotelVsAirbnbOpen ? "Yes" : "No"}
        </Row>
      </dl>
    </div>
  );
}

function Row({
  label,
  source,
  children,
}: {
  label: string;
  source?: "override" | "app-default";
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-900 text-right">
        {children}
        {source ? (
          <span
            className={`ml-2 text-xs rounded px-1.5 py-0.5 ${
              source === "override" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {source === "override" ? "trip override" : "app default"}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
