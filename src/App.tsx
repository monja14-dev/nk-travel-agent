import { useEffect, useState, type ReactNode } from "react";
import { initDb, getDbStatus, type DbStatus } from "./db";
import type { View } from "./navigation/types";
import Dashboard from "./modules/trips/Dashboard";
import TripForm from "./modules/trips/TripForm";
import TripDetails from "./modules/trips/TripDetails";
import TripOverrideForm from "./modules/trips/TripOverrideForm";
import ProfileForm from "./modules/profile/ProfileForm";
import AiChatPanel from "./modules/ai/AiChatPanel";
import AccommodationComparison from "./modules/research/AccommodationComparison";
import FoodHunter from "./modules/research/FoodHunter";
import ItineraryPlanner from "./modules/itinerary/ItineraryPlanner";
import BudgetTracker from "./modules/budget/BudgetTracker";
import BookingsTracker from "./modules/bookings/BookingsTracker";
import RemindersChecklist from "./modules/reminders/RemindersChecklist";
import BackupRestore from "./modules/backup/BackupRestore";
import { AppShell } from "./components/shell/AppShell";

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
        <p className="text-ink-muted">Initializing local database…</p>
      </CenteredMessage>
    );
  }

  if (status === "read-only") {
    return (
      <CenteredMessage>
        <p className="text-warning-text">
          Read-only: this app is open in another tab that controls the current upgrade.
        </p>
      </CenteredMessage>
    );
  }

  if (status === "error") {
    return (
      <CenteredMessage>
        <p className="text-danger-text">Database error: {error ?? "unknown error"}</p>
      </CenteredMessage>
    );
  }

  return (
    <AppShell view={view} onNavigate={setView}>
        {view.name === "dashboard" && <Dashboard onNavigate={setView} />}
        {view.name === "trip-new" && <TripForm onNavigate={setView} />}
        {view.name === "trip-edit" && <TripForm key={view.tripId} tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-details" && <TripDetails key={view.tripId} tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-override" && <TripOverrideForm key={view.tripId} tripId={view.tripId} onNavigate={setView} />}
        {/* key={view.tripId}: Phase 6 trip-isolation hardening. Without
            it, if any future change ever let `view` go directly from one
            trip's "trip-ai"/etc. to another's without an intervening
            unmount, React would reuse this component instance and its
            in-memory state (chat history, pending proposal cards, form
            drafts) across trips instead of resetting it. Today's
            navigation always unmounts in between, so this isn't
            currently exploitable — it's defense-in-depth, the same
            posture the rest of this app takes toward trip isolation. */}
        {view.name === "trip-ai" && <AiChatPanel key={view.tripId} tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-accommodation" && (
          <AccommodationComparison key={view.tripId} tripId={view.tripId} onNavigate={setView} />
        )}
        {view.name === "trip-food" && <FoodHunter key={view.tripId} tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-itinerary" && <ItineraryPlanner key={view.tripId} tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-budget" && <BudgetTracker key={view.tripId} tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-bookings" && <BookingsTracker key={view.tripId} tripId={view.tripId} onNavigate={setView} />}
        {view.name === "trip-reminders" && (
          <RemindersChecklist key={view.tripId} tripId={view.tripId} onNavigate={setView} />
        )}
        {view.name === "profile" && <ProfileForm onNavigate={setView} />}
        {view.name === "backup" && <BackupRestore onNavigate={setView} />}
    </AppShell>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-navy-bg text-ink">
      <div className="max-w-md w-full px-6 py-8 rounded-card border border-navy-border bg-navy-surface shadow-card">
        <h1 className="text-xl font-semibold mb-2 text-ink">NK Travel Agent</h1>
        {children}
      </div>
    </main>
  );
}
