import { useEffect, useMemo, useState } from "react";
import { listTrips } from "../../db/repositories/tripsRepo";
import type { Trip } from "../../db/schema";
import type { View } from "../../navigation/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  DestinationBanner,
  EmptyState,
  MetricRow,
  PageHeader,
  StatTile,
  tripStatusTone,
} from "../../components/ui";
import { formatDateRange, todayISO } from "../../lib/format";
import { loadTripSummary, sortTripsForDashboard, tripTiming, type TripSummary, type TripTiming } from "./tripSummary";
import {
  bookingsCaption,
  budgetDisplay,
  itineraryCaption,
  remindersCaption,
  timingLabel,
  tripMeta,
} from "./tripDisplay";

/**
 * Phase 7 (UI): Travel Command Center dashboard (spec §4). Same data
 * source as before (listTrips) plus read-only per-trip summaries from the
 * existing repositories. Every figure shown is derived from saved
 * records; a trip with nothing saved shows "none yet", never a
 * placeholder percentage.
 */

interface DashboardProps {
  onNavigate: (view: View) => void;
}

interface LoadedDashboard {
  trips: Trip[]; // already in dashboard order
  summaries: Map<string, TripSummary>; // a trip whose summary failed to load is simply absent
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  // `null` = still loading; distinguishing this from an empty list is what
  // makes the empty state trustworthy (the master prompt's
  // loading-vs-empty rule — unchanged from before this redesign).
  const [data, setData] = useState<LoadedDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const today = useMemo(() => todayISO(), []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    (async () => {
      const list = await listTrips({ includeArchived: showArchived });
      const sorted = sortTripsForDashboard(list, today);
      const entries = await Promise.all(
        sorted.map(async (trip) => {
          try {
            return [trip.id, await loadTripSummary(trip)] as const;
          } catch {
            // One trip's stats failing to load must not hide the others
            // (or the trip itself) — its card just shows no metrics.
            return null;
          }
        }),
      );
      const summaries = new Map<string, TripSummary>();
      for (const entry of entries) if (entry) summaries.set(entry[0], entry[1]);
      if (!cancelled) setData({ trips: sorted, summaries });
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
    };
  }, [showArchived, today]);

  const live = data ? data.trips.filter((t) => t.status !== "archived") : [];
  const isActiveTiming = (t: Trip) => {
    const kind = tripTiming(t, today).kind;
    return kind === "in-progress" || kind === "upcoming";
  };
  const underway = live.filter(isActiveTiming);
  const featured = underway[0] ?? null;
  const others = data ? data.trips.filter((t) => t.id !== featured?.id) : [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Travel Command Center"
        subtitle="Your journeys at a glance — everything below comes from your saved trips."
        actions={
          <Button variant="primary" onClick={() => onNavigate({ name: "trip-new" })}>
            New Trip
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="mt-8 rounded-card border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger-text">
          Couldn't load trips: {error}
        </p>
      ) : data === null ? (
        <p className="mt-8 text-sm text-ink-muted">Loading journeys…</p>
      ) : (
        <>
          {live.length > 0 && <OverviewStats trips={live} underway={underway} summaries={data.summaries} today={today} />}

          <label className="mt-6 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-navy-border accent-[#D5B67B]"
            />
            Show archived trips
          </label>

          {data.trips.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title={showArchived ? "No trips at all yet." : "No active trips yet."}
                description="Start with a destination and dates — the itinerary, budget, bookings and reminders all hang off the trip."
                action={
                  <Button variant="primary" onClick={() => onNavigate({ name: "trip-new" })}>
                    Plan your first trip
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              {featured && (
                <section className="mt-6" aria-label="Featured journey">
                  <FeaturedTrip
                    trip={featured}
                    summary={data.summaries.get(featured.id)}
                    timing={tripTiming(featured, today)}
                    onNavigate={onNavigate}
                  />
                </section>
              )}

              {others.length > 0 && (
                <section className="mt-8" aria-label="Other journeys">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    {featured ? "Other journeys" : "Your journeys"}
                  </h2>
                  <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {others.map((trip) => (
                      <li key={trip.id}>
                        <TripCard
                          trip={trip}
                          summary={data.summaries.get(trip.id)}
                          timing={tripTiming(trip, today)}
                          onOpen={() => onNavigate({ name: "trip-details", tripId: trip.id })}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}

      <div className="mt-10 border-t border-navy-border pt-4">
        <Button variant="ghost" size="sm" onClick={() => onNavigate({ name: "profile" })}>
          Edit couple travel profile
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- overview stats ---------------------------- */

function OverviewStats({
  trips,
  underway,
  summaries,
  today,
}: {
  trips: Trip[];
  underway: Trip[];
  summaries: Map<string, TripSummary>;
  today: string;
}) {
  const next = underway[0];
  const nextTiming = next ? tripTiming(next, today) : null;

  let confirmed = 0;
  let bookingTotal = 0;
  let pending = 0;
  let checked = 0;
  let reminderTotal = 0;
  for (const trip of underway) {
    const s = summaries.get(trip.id);
    if (!s) continue;
    confirmed += s.bookings.confirmed;
    pending += s.bookings.pending;
    bookingTotal += s.bookings.total;
    checked += s.reminders.checked;
    reminderTotal += s.reminders.total;
  }

  let nextValue = "—";
  let nextHint = "Nothing scheduled";
  if (next && nextTiming) {
    nextHint = next.name;
    if (nextTiming.kind === "in-progress") nextValue = `Day ${nextTiming.day} of ${nextTiming.of}`;
    else if (nextTiming.kind === "upcoming") nextValue = nextTiming.daysUntil === 1 ? "Tomorrow" : `${nextTiming.daysUntil} days`;
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Journeys"
        value={trips.length}
        hint={`${underway.length} upcoming or underway`}
      />
      <StatTile label={nextTiming?.kind === "in-progress" ? "Now travelling" : "Next departure"} value={nextValue} hint={nextHint} />
      <StatTile
        label="Bookings confirmed"
        value={bookingTotal === 0 ? "—" : `${confirmed} / ${bookingTotal}`}
        hint={bookingTotal === 0 ? "No bookings tracked yet" : `${pending} pending`}
      />
      <StatTile
        label="Reminders done"
        value={reminderTotal === 0 ? "—" : `${checked} / ${reminderTotal}`}
        hint={reminderTotal === 0 ? "No reminders yet" : "across upcoming trips"}
      />
    </div>
  );
}

/* ------------------------------ featured trip ---------------------------- */

function FeaturedTrip({
  trip,
  summary,
  timing,
  onNavigate,
}: {
  trip: Trip;
  summary: TripSummary | undefined;
  timing: TripTiming;
  onNavigate: (view: View) => void;
}) {
  const status = tripStatusTone(trip.status);
  const label = timingLabel(timing);

  return (
    <Card className="overflow-hidden">
      <DestinationBanner destination={trip.destination} country={trip.country} className="h-40 sm:h-52">
        <div className="flex h-full flex-col justify-between p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {label && (
              <span className="rounded-full bg-navy-bg/70 px-2.5 py-1 text-xs font-medium text-ink backdrop-blur">
                {label}
              </span>
            )}
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink sm:text-3xl">{trip.destination}</p>
            <p className="text-sm text-ink-muted">{trip.country}</p>
          </div>
        </div>
      </DestinationBanner>

      <CardBody>
        <h2 className="text-lg font-semibold text-ink">{trip.name}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">{tripMeta(trip)}</p>

        {summary ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            <BudgetRow summary={summary} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">Trip stats couldn't be loaded — the trip itself is unaffected.</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => onNavigate({ name: "trip-itinerary", tripId: trip.id })}>
            Continue planning
          </Button>
          <Button onClick={() => onNavigate({ name: "trip-details", tripId: trip.id })}>Open trip</Button>
          <Button onClick={() => onNavigate({ name: "trip-budget", tripId: trip.id })}>Budget</Button>
          <Button onClick={() => onNavigate({ name: "trip-bookings", tripId: trip.id })}>Bookings</Button>
          <Button variant="ghost" onClick={() => onNavigate({ name: "trip-ai", tripId: trip.id })}>
            Ask NK Concierge
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------- trip card ------------------------------ */

function TripCard({
  trip,
  summary,
  timing,
  onOpen,
}: {
  trip: Trip;
  summary: TripSummary | undefined;
  timing: TripTiming;
  onOpen: () => void;
}) {
  const status = tripStatusTone(trip.status);
  const label = timingLabel(timing);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${trip.name}`}
      className="block w-full rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-bg"
    >
      <Card interactive className="overflow-hidden">
        <DestinationBanner destination={trip.destination} country={trip.country} className="h-20">
          <div className="flex h-full items-start justify-between p-3">
            <Badge tone={status.tone}>{status.label}</Badge>
            {label && <span className="rounded-full bg-navy-bg/70 px-2 py-0.5 text-[11px] font-medium text-ink">{label}</span>}
          </div>
        </DestinationBanner>
        <CardBody className="space-y-1">
          <p className="truncate font-semibold text-ink">{trip.name}</p>
          <p className="truncate text-sm text-ink-muted">
            {trip.destination}, {trip.country}
          </p>
          <p className="text-xs text-ink-faint">{formatDateRange(trip.startDate, trip.endDate)}</p>
          {summary && (
            <p className="pt-1 text-xs text-ink-muted">
              {summary.activityCount === 0 ? "No activities yet" : `${summary.daysPlanned}/${summary.tripDays} days planned`}
              {summary.bookings.total > 0 ? ` · ${summary.bookings.confirmed}/${summary.bookings.total} booked` : ""}
            </p>
          )}
        </CardBody>
      </Card>
    </button>
  );
}

/* ------------------------------ small pieces ----------------------------- */

function BudgetRow({ summary }: { summary: TripSummary }) {
  const { caption, fraction, tone } = budgetDisplay(summary.budget);
  return <MetricRow label="Budget" caption={caption} fraction={fraction} tone={tone} />;
}
