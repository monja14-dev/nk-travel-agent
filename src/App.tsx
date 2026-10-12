import { useEffect, useState, type ReactNode } from "react";
import { initDb, getDbStatus, type DbStatus } from "./db";
import type { View } from "./navigation/types";
import Dashboard from "./modules/trips/Dashboard";
import TripForm from "./modules/trips/TripForm";
import TripDetails from "./modules/trips/TripDetails";
import TripOverrideForm from "./modules/trips/TripOverrideForm";
import ProfileForm from "./modules/profile/ProfileForm";

/**
 * Phase 2: the db-status gate from Phase 1 is unchanged — writes stay
 * blocked (via getReadyDb() inside every repo call) until status is
 * "ready", and a failed open still surfaces as "error", never as a quiet
 * empty database. What's new is the view switch below it, once ready.
 */
export default function App() {
  const [status, setStatus] = useState<DbStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "dashboard" });

  useEffect(() => {
    initDb()
      .then(() => setStatus(getDbStatus().status))
      .catch(() => {
        const s = getDbStatus();
        setStatus(s.status);
        setError(s.error);
      });
  }, []);

  if (status === "idle" || status === "loading") {
    return (
      <CenteredMessage>
        <p className="text-slate-700">Initializing local database…</p>
      </CenteredMessage>
    );
  }

  if (status === "read-only") {
    return (
      <CenteredMessage>
        <p className="text-amber-700">
          Read-only: this app is open in another tab that controls the current upgrade.
        </p>
      </CenteredMessage>
    );
  }

  if (status === "error") {
    return (
      <CenteredMessage>
        <p className="text-red-700">Database error: {error ?? "unknown error"}</p>
      </CenteredMessage>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView({ name: "dashboard" })}
            className="font-semibold text-slate-900"
          >
            NK Travel Agent
          </button>
          <nav className="flex items-center gap-4 text-sm">
            <button type="button" onClick={() => setView({ name: "dashboard" })} className="text-slate-600">
              Trips
            </button>
            <button type="button" onClick={() => setView({ name: "profile" })} className="text-slate-600">
              Profile
            </button>
          </nav>
        </div>
      </header>

      <main>
        {view.name === "dashboard" && <Dashboard onNavigate={setView} />}
        {view.name === "trip-new" && <TripForm onNavigate={setView} />}
        {view.name === "trip-edit" && <TripForm tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-details" && <TripDetails tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-override" && <TripOverrideForm tripId={view.tripId} onNavigate={setView} />}
        {view.name === "profile" && <ProfileForm onNavigate={setView} />}
      </main>
    </div>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
      <div className="max-w-md w-full px-6 py-8 rounded-lg border border-slate-200 bg-white shadow-sm">
        <h1 className="text-xl font-semibold mb-2">NK Travel Agent</h1>
        {children}
      </div>
    </main>
  );
}
