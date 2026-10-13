import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getTrip, archiveTrip, unarchiveTrip, duplicateTrip } from "../../db/repositories/tripsRepo";
import { getOrCreateDefaultProfile } from "../../db/repositories/travelerProfilesRepo";
import { getOverrideForTrip } from "../../db/repositories/tripOverridesRepo";
import { getEffectiveTripSettings, type EffectiveTripSettings } from "./effectiveSettings";
import type { Trip, TravelerProfile, TripOverride } from "../../db/schema";
import type { View } from "../../navigation/types";
import { Badge, Button, Card, CardBody, DestinationBanner, MetricRow, tripStatusTone } from "../../components/ui";
import {
  BedIcon,
  BellIcon,
  CalendarIcon,
  ChevronLeftIcon,
  SparkleIcon,
  TicketIcon,
  UtensilsIcon,
  WalletIcon,
} from "../../components/shell/icons";
import { todayISO } from "../../lib/format";
import { loadTripSummary, tripTiming, type TripSummary } from "./tripSummary";
import { bookingsCaption, budgetDisplay, itineraryCaption, remindersCaption, timingLabel, tripMeta } from "./tripDisplay";

/**
 * Phase 7 (UI): the trip workspace (spec §5) — one overview per trip with
 * its dates, real progress figures, effective preferences, a door into
 * every module, and the export / backup actions. All data access is the
 * same as before (getTrip / profile / override) plus the read-only
 * loadTripSummary; every action handler below is unchanged behavior.
 */

interface TripDetailsProps {
  tripId: string;
  onNavigate: (view: View) => void;
}

type LoadState = "loading" | "ready" | "not-found" | "error";

export default function TripDetails({ tripId, onNavigate }: TripDetailsProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [override, setOverride] = useState<TripOverride | undefined>(undefined);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const today = useMemo(() => todayISO(), []);

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

  // Progress figures load separately so a failure here can never block the
  // trip itself (its actions and preferences) from showing.
  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    setSummary(null);
    loadTripSummary(trip)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [trip]);

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

  async function handleExport() {
    if (!trip) return;
    setExportPending(true);
    setActionError(null);
    try {
      // Dynamic import, not a top-level one: exceljs is a large library
      // (it roughly 5x'd the production bundle when imported statically —
      // see vite's own chunk-size warning) and the vast majority of page
      // loads never click this button. This keeps exceljs out of the main
      // bundle entirely, in its own chunk fetched only on first use.
      const { downloadTripXlsx } = await import("../export/exportTrip");
      await downloadTripXlsx(trip.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportPending(false);
    }
  }

  if (loadState === "loading") {
    return <div className="mx-auto w-full max-w-5xl px-4 py-8 text-sm text-ink-muted sm:px-6">Loading trip…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <p className="mb-3 text-ink">That trip no longer exists.</p>
        <Button onClick={() => onNavigate({ name: "dashboard" })}>Back to dashboard</Button>
      </div>
    );
  }
  if (loadState === "error" || !trip || !profile) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <p role="alert" className="rounded-card border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger-text">
          Couldn't load this trip: {loadError}
        </p>
      </div>
    );
  }

  const effective = getEffectiveTripSettings(profile, override);
  const status = tripStatusTone(trip.status);
  const timing = timingLabel(tripTiming(trip, today));
  const budget = summary ? budgetDisplay(summary.budget) : null;
  const go = (name: Exclude<View["name"], "dashboard" | "trip-new" | "profile" | "backup">) =>
    onNavigate({ name, tripId: trip.id });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Button variant="ghost" size="sm" onClick={() => onNavigate({ name: "dashboard" })} className="-ml-2 mb-3">
        <ChevronLeftIcon width={16} height={16} />
        Dashboard
      </Button>

      {/* ---- hero ---- */}
      <Card className="overflow-hidden">
        <DestinationBanner destination={trip.destination} country={trip.country} className="h-36 sm:h-44">
          <div className="flex h-full flex-col justify-between p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {timing && (
                <span className="rounded-full bg-navy-bg/70 px-2.5 py-1 text-xs font-medium text-ink">{timing}</span>
              )}
            </div>
            <div>
              <p className="text-2xl font-semibold text-ink sm:text-3xl">{trip.destination}</p>
              <p className="text-sm text-ink-muted">{trip.country}</p>
            </div>
          </div>
        </DestinationBanner>
        <CardBody>
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">{trip.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">{tripMeta(trip)}</p>
          {trip.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">{trip.notes}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => go("trip-itinerary")}>
              Open Itinerary Studio
            </Button>
            <Button onClick={() => go("trip-ai")}>Ask NK Concierge</Button>
            <Button onClick={() => go("trip-edit")}>Edit trip</Button>
            <Button onClick={handleDuplicate} disabled={actionPending}>
              Duplicate
            </Button>
            <Button onClick={handleArchiveToggle} disabled={actionPending}>
              {trip.status === "archived" ? "Unarchive" : "Archive"}
            </Button>
          </div>
          {actionError ? (
            <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger-text">
              {actionError}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* ---- progress ---- */}
      <section className="mt-6" aria-label="Trip progress">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Progress</h2>
        <Card>
          <CardBody>
            {summary && budget ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricRow
                  label="Itinerary"
                  caption={itineraryCaption(summary)}
                  fraction={summary.tripDays > 0 ? summary.daysPlanned / summary.tripDays : 0}
                />
                <MetricRow
                  label="Bookings"
                  caption={bookingsCaption(summary)}
                  fraction={summary.bookings.total > 0 ? summary.bookings.confirmed / summary.bookings.total : 0}
                  tone="success"
                />
                <MetricRow
                  label="Reminders"
                  caption={remindersCaption(summary)}
                  fraction={summary.reminders.total > 0 ? summary.reminders.checked / summary.reminders.total : 0}
                  tone="success"
                />
                <MetricRow label="Budget" caption={budget.caption} fraction={budget.fraction} tone={budget.tone} />
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Loading progress…</p>
            )}
          </CardBody>
        </Card>
      </section>

      {/* ---- workspace ---- */}
      <section className="mt-6" aria-label="Trip workspace">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Workspace</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <WorkspaceCard
              icon={<CalendarIcon />}
              title="Itinerary Studio"
              caption={summary ? itineraryCaption(summary) : "Day-by-day plan"}
              onClick={() => go("trip-itinerary")}
            />
          </li>
          <li>
            <WorkspaceCard
              icon={<BedIcon />}
              title="Stay Hunter"
              caption="Compare accommodation options"
              onClick={() => go("trip-accommodation")}
            />
          </li>
          <li>
            <WorkspaceCard
              icon={<UtensilsIcon />}
              title="Food Hunter"
              caption="Restaurants and food stops"
              onClick={() => go("trip-food")}
            />
          </li>
          <li>
            <WorkspaceCard
              icon={<WalletIcon />}
              title="Budget & Expenses"
              caption={budget ? budget.caption : "Planned vs actual spend"}
              onClick={() => go("trip-budget")}
            />
          </li>
          <li>
            <WorkspaceCard
              icon={<TicketIcon />}
              title="Bookings"
              caption={summary ? bookingsCaption(summary) : "Reservations and confirmations"}
              onClick={() => go("trip-bookings")}
            />
          </li>
          <li>
            <WorkspaceCard
              icon={<BellIcon />}
              title="Reminders"
              caption={summary ? remindersCaption(summary) : "Checklist before you go"}
              onClick={() => go("trip-reminders")}
            />
          </li>
          <li>
            <WorkspaceCard
              icon={<SparkleIcon />}
              title="NK Concierge"
              caption="Ask for ideas — you approve every change"
              onClick={() => go("trip-ai")}
            />
          </li>
        </ul>
      </section>

      {/* ---- preferences ---- */}
      <section className="mt-6" aria-label="Trip preferences">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Preferences</h2>
          <Button size="sm" variant="ghost" onClick={() => go("trip-override")}>
            Edit trip preferences
          </Button>
        </div>
        <EffectivePreferences effective={effective} hasOverride={override !== undefined} />
      </section>

      {/* ---- export & backup ---- */}
      <section className="mt-6" aria-label="Export and backup">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Export & backup</h2>
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-muted">
                Download this trip's itinerary, bookings, budget and reminders as an Excel workbook.
              </p>
              <Button onClick={handleExport} disabled={exportPending} className="shrink-0">
                {exportPending ? "Exporting…" : "Export to Excel"}
              </Button>
            </div>
            <div className="flex flex-col gap-2 border-t border-navy-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-muted">
                JSON backup and restore covers your whole database (all trips), not just this one.
              </p>
              <Button onClick={() => onNavigate({ name: "backup" })} className="shrink-0">
                Backup & Restore
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function WorkspaceCard({
  icon,
  title,
  caption,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-bg"
    >
      <Card interactive className="h-full">
        <CardBody className="flex items-start gap-3">
          <span className="mt-0.5 text-accent" aria-hidden="true">
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{title}</span>
            <span className="mt-0.5 block text-sm text-ink-muted">{caption}</span>
          </span>
        </CardBody>
      </Card>
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
    <Card>
      <CardBody>
        <h3 className="mb-1 text-sm font-semibold text-ink">Effective preferences for this trip</h3>
        <p className="mb-4 text-xs text-ink-muted">
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
      </CardBody>
    </Card>
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
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="text-ink sm:text-right">
        {children}
        {source ? (
          <span className="ml-2 align-middle">
            <Badge tone={source === "override" ? "success" : "neutral"}>
              {source === "override" ? "trip override" : "app default"}
            </Badge>
          </span>
        ) : null}
      </dd>
    </div>
  );
}
