import { getTrip, updateTrip } from "../../db/repositories/tripsRepo";
import { getOverrideForTrip, upsertOverrideForTrip, type TripOverrideInput } from "../../db/repositories/tripOverridesRepo";
import { getItem, createItem, updateItem, listItemsForDay } from "../../db/repositories/itineraryItemsRepo";
import { StaleRevisionError, NotFoundError, ValidationError } from "../../lib/errors";
import type { ItineraryItemInput } from "../../modules/itinerary/validation";
import type { ItineraryItemCategory, BookingStatus } from "../../db/schema";
import type { AiProposal } from "./types";

/**
 * Applies an approved AI proposal through the same revision-checked
 * repository functions every other write in this app goes through —
 * the AI never gets its own write path. Checks staleness itself first
 * (a fresh read right before writing, not reusing anything from when
 * the proposal was generated or even from the preview step a moment
 * earlier), then still relies on the repo's own internal revision check
 * as defense in depth against a race between that check and the write.
 */

// Matches effectiveSettings.ts's DEFAULT_CURRENCY — duplicated rather
// than imported since that constant isn't exported (it's a private
// default for *reading* an unset override, not a write default);
// kept identical for consistency.
const DEFAULT_CURRENCY = "PHP";

export type ApplyProposalResult =
  | { status: "applied" }
  | { status: "stale" }
  | { status: "not-found" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export async function applyProposal(proposal: AiProposal): Promise<ApplyProposalResult> {
  if (proposal.kind === "trip-update") {
    return applyTripUpdateProposal(proposal);
  }
  if (proposal.kind === "itinerary-item-upsert") {
    return applyItineraryItemProposal(proposal);
  }
  return applyTripOverrideProposal(proposal);
}

async function applyTripUpdateProposal(
  proposal: Extract<AiProposal, { kind: "trip-update" }>,
): Promise<ApplyProposalResult> {
  const current = await getTrip(proposal.tripId);
  if (!current) return { status: "not-found" };
  if (current.revision !== proposal.expectedRevision) return { status: "stale" };

  try {
    await updateTrip(proposal.tripId, proposal.changes, proposal.expectedRevision);
    return { status: "applied" };
  } catch (err) {
    if (err instanceof StaleRevisionError) return { status: "stale" };
    if (err instanceof NotFoundError) return { status: "not-found" };
    if (err instanceof ValidationError) return { status: "invalid", message: err.message };
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

async function applyTripOverrideProposal(
  proposal: Extract<AiProposal, { kind: "trip-override-upsert" }>,
): Promise<ApplyProposalResult> {
  const current = await getOverrideForTrip(proposal.tripId);
  const currentRevision = current ? current.revision : null;
  if (currentRevision !== proposal.expectedRevision) return { status: "stale" };

  const merged: TripOverrideInput = {
    currency: proposal.changes.currency ?? current?.currency ?? DEFAULT_CURRENCY,
    budgetTargetMin: proposal.changes.budgetTargetMin ?? current?.budgetTargetMin,
    budgetTargetMax: proposal.changes.budgetTargetMax ?? current?.budgetTargetMax,
    mustHaveAmenities: proposal.changes.mustHaveAmenities ?? current?.mustHaveAmenities ?? [],
    hotelVsAirbnbOpen: proposal.changes.hotelVsAirbnbOpen ?? current?.hotelVsAirbnbOpen ?? true,
    rawOverrideText: proposal.changes.rawOverrideText ?? current?.rawOverrideText ?? "",
  };

  try {
    await upsertOverrideForTrip(proposal.tripId, merged, current?.revision);
    return { status: "applied" };
  } catch (err) {
    if (err instanceof StaleRevisionError) return { status: "stale" };
    if (err instanceof ValidationError) return { status: "invalid", message: err.message };
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Phase 5's "AI draft alternatives without replacing approved plans":
 * every itinerary-item-upsert proposal — whether it's one tweak or one
 * of several that together make up a whole alternative day — goes
 * through this exact same create/update path as a human editing the
 * detailed itinerary form directly. Nothing about an "alternative" is
 * special-cased: it only ever becomes real once the person approves it
 * here, one proposal at a time, same as trip-update and
 * trip-override-upsert above.
 */
async function applyItineraryItemProposal(
  proposal: Extract<AiProposal, { kind: "itinerary-item-upsert" }>,
): Promise<ApplyProposalResult> {
  if (proposal.itemId === null) {
    if (!proposal.changes.title?.trim()) {
      return { status: "invalid", message: "A new itinerary item needs at least a title." };
    }
    const existingItems = await listItemsForDay(proposal.dayId);
    const input: ItineraryItemInput = {
      order: proposal.changes.order ?? existingItems.length,
      startTime: proposal.changes.startTime,
      endTime: proposal.changes.endTime,
      crossesMidnight: proposal.changes.crossesMidnight ?? false,
      newCalendarDay: proposal.changes.newCalendarDay ?? false,
      durationMinutes: proposal.changes.durationMinutes,
      travelTimeMinutes: proposal.changes.travelTimeMinutes,
      // Cast, not re-validated here: validateItineraryItemInput (called
      // inside createItem) is the real runtime check against the exact
      // enum — same defense-in-depth layering as every other proposal
      // kind in this file and in api/_lib/schemas.ts's parseProposal.
      category: (proposal.changes.category as ItineraryItemCategory) ?? "activity",
      title: proposal.changes.title,
      description: proposal.changes.description,
      address: proposal.changes.address,
      transportNotes: proposal.changes.transportNotes,
      openingHours: proposal.changes.openingHours,
      bookingStatus: (proposal.changes.bookingStatus as BookingStatus) ?? "not_booked",
      farePlanned: proposal.changes.farePlanned,
      fareActual: proposal.changes.fareActual,
      activityCostPlanned: proposal.changes.activityCostPlanned,
      activityCostActual: proposal.changes.activityCostActual,
      currency: proposal.changes.currency,
      comments: proposal.changes.comments,
      actualStatus: proposal.changes.actualStatus as ItineraryItemInput["actualStatus"],
    };
    try {
      await createItem(proposal.tripId, proposal.dayId, input);
      return { status: "applied" };
    } catch (err) {
      if (err instanceof ValidationError) return { status: "invalid", message: err.message };
      if (err instanceof NotFoundError) return { status: "not-found" };
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  const current = await getItem(proposal.itemId);
  // Phase 6 fix: same trip-isolation gap as previewProposal.ts — updateItem
  // takes only an id and never checks which trip it actually belongs to,
  // so without this check a proposal carrying a mismatched tripId/itemId
  // pair (any proposal source that doesn't scope its output perfectly)
  // would silently write to a *different* trip than the one the person
  // approved a change for. Matches createItem's existing day.tripId check.
  if (!current || current.tripId !== proposal.tripId) return { status: "not-found" };
  if (current.revision !== proposal.expectedRevision) return { status: "stale" };

  try {
    await updateItem(proposal.itemId, proposal.changes as Partial<ItineraryItemInput>, proposal.expectedRevision);
    return { status: "applied" };
  } catch (err) {
    if (err instanceof StaleRevisionError) return { status: "stale" };
    if (err instanceof NotFoundError) return { status: "not-found" };
    if (err instanceof ValidationError) return { status: "invalid", message: err.message };
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
