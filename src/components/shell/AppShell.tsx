import { useEffect, useState, type ReactNode } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import type { Trip } from "../../db/schema";
import type { View } from "../../navigation/types";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ConciergeButton } from "./ConciergeButton";
import { tripIdFromView } from "./navItems";

/** Views whose screens have been fully restyled onto the navy tokens.
 * Add a view name here as each screen is migrated (see bridge note in
 * the render below). */
const MIGRATED_VIEWS: ReadonlySet<View["name"]> = new Set<View["name"]>([
  "dashboard",
  "trip-new",
  "trip-details",
  "trip-edit",
  "trip-override",
  "trip-ai",
  "trip-accommodation",
  "trip-food",
  "trip-itinerary",
  "trip-budget",
  "trip-bookings",
  "trip-reminders",
  "profile",
  "backup",
]);

/**
 * Phase 7 (UI): the application shell — sidebar + top bar + content
 * area + floating concierge button (spec §3). Wraps whatever screen
 * App.tsx is currently rendering; it does not own routing itself
 * (View/onNavigate still come from App.tsx, unchanged).
 *
 * "Active trip" is derived from the current view's tripId, not tracked
 * separately — so navigating to a trip-scoped screen is what lights up
 * the trip group in the sidebar, and leaving to Dashboard/Profile/
 * Backup clears it. This matches how the rest of the app already works
 * (every trip screen takes tripId from `view`) rather than introducing
 * a second source of truth for "which trip am I in."
 */
export function AppShell({
  view,
  onNavigate,
  children,
}: {
  view: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);

  const activeTripId = tripIdFromView(view);

  useEffect(() => {
    if (!activeTripId) {
      setActiveTrip(null);
      return;
    }
    let cancelled = false;
    getTrip(activeTripId)
      .then((trip) => {
        // getTrip() resolves undefined (not null) for a missing trip.
        if (!cancelled) setActiveTrip(trip ?? null);
      })
      .catch(() => {
        // The top bar label is cosmetic — a failed read here must not
        // throw an unhandled rejection or block the screen underneath,
        // which loads (and surfaces its own errors) independently.
        if (!cancelled) setActiveTrip(null);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever the active trip changes OR when navigation
    // returns to a screen that may have just edited the trip's name/
    // status (trip-details, trip-edit) — cheap (one IndexedDB read) and
    // keeps the top bar / sidebar label from going stale after an edit.
  }, [activeTripId, view.name]);

  return (
    <div className="flex h-screen overflow-hidden bg-navy-bg text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy-bg"
      >
        Skip to content
      </a>
      <Sidebar
        view={view}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        activeTripName={activeTrip?.name ?? null}
        activeTripId={activeTripId}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenMobileMenu={() => setMobileOpen(true)}
          activeTrip={activeTrip ? { name: activeTrip.name, status: activeTrip.status } : null}
          onNavigate={onNavigate}
        />

        {/* Transitional bridge. Screens not yet in MIGRATED_VIEWS still use
            the pre-Phase-7 light palette (slate text/cards) and have no
            background of their own — they relied entirely on the old
            App.tsx wrapper's bg-slate-50 — so they keep a light
            background (and color-scheme: light, so native checkboxes/
            selects match) and stay fully readable. A screen is added to
            MIGRATED_VIEWS only once EVERY element in it uses the navy
            tokens; doing it per screen avoids a half-restyled page with
            invisible text in between. */}
        <main
          id="main-content"
          tabIndex={-1}
          className={[
            // pb-20: clearance so the floating concierge button never
            // covers the last controls on a page.
            "flex-1 overflow-y-auto pb-20 focus:outline-none",
            MIGRATED_VIEWS.has(view.name)
              ? "bg-navy-bg text-ink"
              : "bg-slate-50 text-slate-900 [color-scheme:light]",
          ].join(" ")}
        >
          {children}
        </main>
      </div>

      {activeTripId && view.name !== "trip-ai" && (
        <ConciergeButton onClick={() => onNavigate({ name: "trip-ai", tripId: activeTripId })} />
      )}
    </div>
  );
}
