import { SparkleIcon } from "./icons";

/**
 * Phase 7 (UI): floating NK Concierge entry point (spec §3, §8). Only
 * rendered when a trip is active — AiChatPanel (the existing AI module,
 * untouched by this redesign) requires a tripId. Bottom-right with
 * generous margin so it never sits on top of a page's own controls;
 * the Itinerary Studio's detailed table (widest content in the app)
 * still has clearance on the right.
 */
export function ConciergeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-navy-bg shadow-float transition-transform hover:scale-[1.03] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-bg sm:px-5"
      aria-label="Open NK Concierge"
    >
      <SparkleIcon width={18} height={18} />
      <span className="hidden text-sm font-semibold sm:inline">NK Concierge</span>
    </button>
  );
}
