import type { TripStatus } from "../../db/schema";
import type { View } from "../../navigation/types";
import { Badge, tripStatusTone } from "../ui";
import { MenuIcon, UserIcon } from "./icons";

/**
 * Phase 7 (UI): top bar — mobile menu toggle, active trip + status, and
 * a shortcut to Traveler Profiles. Spec §3: "Top bar with active trip,
 * contextual actions, and settings."
 */
export function TopBar({
  onOpenMobileMenu,
  activeTrip,
  onNavigate,
}: {
  onOpenMobileMenu: () => void;
  activeTrip: { name: string; status: TripStatus } | null;
  onNavigate: (view: View) => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-navy-border bg-navy-bg/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-navy-bg/80">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="md:hidden p-1.5 -ml-1.5 rounded-md text-ink-muted hover:bg-navy-elevated hover:text-ink"
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>

      <div className="min-w-0 flex-1">
        {activeTrip ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-semibold text-ink">{activeTrip.name}</span>
            <Badge tone={tripStatusTone(activeTrip.status).tone}>
              {tripStatusTone(activeTrip.status).label}
            </Badge>
          </div>
        ) : (
          <span className="text-sm text-ink-muted">No active trip</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onNavigate({ name: "profile" })}
        className="flex items-center justify-center h-8 w-8 rounded-full bg-navy-elevated text-ink-muted hover:text-ink border border-navy-border"
        aria-label="Traveler profiles"
        title="Traveler profiles"
      >
        <UserIcon width={16} height={16} />
      </button>
    </header>
  );
}
