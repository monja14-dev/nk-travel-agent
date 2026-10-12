import { useEffect, useState } from "react";
import { listTrips } from "../../db/repositories/tripsRepo";
import type { Trip } from "../../db/schema";
import type { View } from "../../navigation/types";

interface DashboardProps {
  onNavigate: (view: View) => void;
}

const STATUS_LABEL: Record<Trip["status"], string> = {
  planning: "Planning",
  booked: "Booked",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
};

export default function Dashboard({ onNavigate }: DashboardProps) {
  // `null` = still loading; distinguishing this from `[]` is what makes
  // the empty state ("no trips yet") trustworthy instead of indistinguishable
  // from "haven't loaded yet" — the master prompt's loading-vs-empty rule.
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTrips(null);
    setError(null);
    listTrips({ includeArchived: showArchived })
      .then((result) => {
        if (!cancelled) setTrips(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [showArchived]);

  return (
    <div className="max-w-2xl w-full mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Your Trips</h1>
        <button
          type="button"
          onClick={() => onNavigate({ name: "trip-new" })}
          className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700"
        >
          New Trip
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 mb-4">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="rounded border-slate-300"
        />
        Show archived trips
      </label>

      {error ? (
        <p className="text-red-700 text-sm">Couldn't load trips: {error}</p>
      ) : trips === null ? (
        <p className="text-slate-500 text-sm">Loading trips…</p>
      ) : trips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
          <p className="text-slate-600 mb-3">
            {showArchived ? "No trips at all yet." : "No active trips yet."}
          </p>
          <button
            type="button"
            onClick={() => onNavigate({ name: "trip-new" })}
            className="text-sm font-medium text-slate-900 underline"
          >
            Plan your first trip
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {trips.map((trip) => (
            <li key={trip.id}>
              <button
                type="button"
                onClick={() => onNavigate({ name: "trip-details", tripId: trip.id })}
                className="w-full text-left rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-slate-400"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{trip.name}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {STATUS_LABEL[trip.status]}
                  </span>
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  {trip.destination}, {trip.country} · {trip.startDate} to {trip.endDate}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => onNavigate({ name: "profile" })}
          className="text-sm text-slate-600 underline"
        >
          Edit couple travel profile
        </button>
      </div>
    </div>
  );
}
