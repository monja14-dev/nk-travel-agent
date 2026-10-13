/**
 * Mirrors api/_lib/schemas.ts's request/response shapes for the client
 * side. Deliberately NOT imported from api/_lib — see
 * api/_lib/__tests__/noClientLeak.test.ts, which asserts nothing under
 * src/ imports anything from api/ at all, not even a type-only import.
 * That's a stronger, simpler guarantee than "it's fine because
 * `import type` is erased at build time" — this project already
 * prefers duplication-with-a-sync-mechanism over that kind of coupling
 * (see api/_lib/systemPrompt.ts and its sync test for the same pattern
 * applied to prompt text). These are small, stable shapes; a drift here
 * would surface immediately as a real runtime mismatch, not silently.
 */

export type ChatRole = "user" | "assistant";

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface TripUpdateProposal {
  kind: "trip-update";
  tripId: string;
  expectedRevision: number;
  changes: Partial<{
    name: string;
    destination: string;
    country: string;
    startDate: string;
    endDate: string;
    travelerCount: number;
    roomCount: number;
    notes: string;
  }>;
  rationale: string;
}

export interface TripOverrideProposal {
  kind: "trip-override-upsert";
  tripId: string;
  expectedRevision: number | null;
  changes: Partial<{
    currency: string;
    budgetTargetMin: number;
    budgetTargetMax: number;
    mustHaveAmenities: string[];
    hotelVsAirbnbOpen: boolean;
    rawOverrideText: string;
  }>;
  rationale: string;
}

/**
 * Phase 5: a single itinerary item, created or updated. `itemId: null`
 * means "create a new item in this day" (expectedRevision must then also
 * be null — there's nothing to be stale against yet); a non-null itemId
 * means "update this existing item" and expectedRevision must be the
 * revision the AI last saw. This is the one proposal kind that covers
 * "AI draft alternatives" — a draft day plan is just several of these in
 * one response, each independently previewed, approved, or rejected by
 * the person; none of them touch the real itinerary until approved,
 * exactly like every other proposal kind. The AI never proposes creating
 * a *day* — modules/itinerary's screen bootstraps every calendar day in
 * the trip's date range up front (see
 * db/repositories/itineraryDaysRepo.ts's ensureDaysForTripRange), so a
 * valid dayId always already exists for the AI to target.
 */
export interface ItineraryItemProposal {
  kind: "itinerary-item-upsert";
  tripId: string;
  dayId: string;
  itemId: string | null;
  expectedRevision: number | null;
  changes: Partial<{
    order: number;
    startTime: string;
    endTime: string;
    crossesMidnight: boolean;
    newCalendarDay: boolean;
    durationMinutes: number;
    travelTimeMinutes: number;
    category: string;
    title: string;
    description: string;
    address: string;
    transportNotes: string;
    openingHours: string;
    bookingStatus: string;
    farePlanned: number;
    fareActual: number;
    activityCostPlanned: number;
    activityCostActual: number;
    currency: string;
    comments: string;
    actualStatus: string;
  }>;
  rationale: string;
}

export type AiProposal = TripUpdateProposal | TripOverrideProposal | ItineraryItemProposal;

/** A page the web search returned (Phase 8). Only http(s) URLs. */
export interface SearchSourceInfo {
  title: string;
  url: string;
}

export interface AiChatResponseBody {
  reply: string;
  proposals: AiProposal[];
  warnings: string[];
  /** Present only on turns where web search was switched on. */
  sources?: SearchSourceInfo[];
  /** Searches actually run (billed) this turn; only on search turns. */
  searchCount?: number;
}

export interface AiChatErrorBody {
  error: string;
  fieldErrors?: Record<string, string>;
  /** Only on the streamed (web-search) path, where the HTTP status is
   * already sent as 200 before the outcome is known. */
  status?: number;
}
