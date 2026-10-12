import { getTrip } from "../../db/repositories/tripsRepo";
import { getOverrideForTrip } from "../../db/repositories/tripOverridesRepo";
import { getDay } from "../../db/repositories/itineraryDaysRepo";
import { getItem } from "../../db/repositories/itineraryItemsRepo";
import type { AiProposal } from "./types";

/**
 * "Preview affected records" (master prompt, Phase 3): before the person
 * approves a proposal, show them exactly what it would change, read
 * fresh from IndexedDB at preview time — not from the snapshot the AI
 * saw, which could already be out of date. That staleness is exactly
 * what `isStale` below surfaces, so the UI can warn *before* the person
 * wastes a click on Approve only to be told it failed.
 */

export interface ProposalFieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ProposalPreview {
  /** The trip (for a trip-update) or the trip this override belongs to
   * doesn't currently exist — can't meaningfully preview or apply. Only
   * relevant for trip-update; a missing override is the normal "no
   * override yet" case, not an error, for trip-override-upsert. */
  notFound: boolean;
  /** The record has moved on since the AI computed this proposal
   * (someone edited it, or — for an override — it was created/cleared
   * since). Approving a stale proposal is blocked; the person needs a
   * fresh proposal instead. */
  isStale: boolean;
  currentRevision: number | null;
  changes: ProposalFieldChange[];
}

export async function previewProposal(proposal: AiProposal): Promise<ProposalPreview> {
  if (proposal.kind === "itinerary-item-upsert") {
    if (proposal.itemId === null) {
      // Creating a new item — the day must still exist, but there's no
      // "current" record to diff against or go stale relative to.
      const day = await getDay(proposal.dayId);
      // Same trip-isolation check as the update branch below — getDay()
      // is keyed only by id, so confirm it's actually this trip's day
      // before previewing a "create" as though it belongs here.
      if (!day || day.tripId !== proposal.tripId) {
        return { notFound: true, isStale: false, currentRevision: null, changes: [] };
      }
      const changes: ProposalFieldChange[] = Object.entries(proposal.changes).map(([field, to]) => ({
        field,
        from: undefined,
        to,
      }));
      return { notFound: false, isStale: false, currentRevision: null, changes };
    }
    const current = await getItem(proposal.itemId);
    // Phase 6 fix: getItem() is keyed only by id, with no per-trip
    // partitioning (unlike createItem, which already checks the day's
    // own tripId). A proposal naming the wrong trip for a real itemId
    // from a *different* trip — a model mix-up, or any future caller
    // that doesn't scope its output perfectly — must not be previewed as
    // an ordinary, approvable change to the trip the person thinks
    // they're looking at. Treated the same as "doesn't exist" rather than
    // leaking the other trip's record into this preview.
    if (!current || current.tripId !== proposal.tripId) {
      return { notFound: true, isStale: false, currentRevision: null, changes: [] };
    }
    const changes: ProposalFieldChange[] = Object.entries(proposal.changes).map(([field, to]) => ({
      field,
      from: (current as unknown as Record<string, unknown>)[field],
      to,
    }));
    return {
      notFound: false,
      isStale: current.revision !== proposal.expectedRevision,
      currentRevision: current.revision,
      changes,
    };
  }

  if (proposal.kind === "trip-update") {
    const current = await getTrip(proposal.tripId);
    if (!current) {
      return { notFound: true, isStale: false, currentRevision: null, changes: [] };
    }
    const changes: ProposalFieldChange[] = Object.entries(proposal.changes).map(([field, to]) => ({
      field,
      from: (current as unknown as Record<string, unknown>)[field],
      to,
    }));
    return {
      notFound: false,
      isStale: current.revision !== proposal.expectedRevision,
      currentRevision: current.revision,
      changes,
    };
  }

  // trip-override-upsert
  const current = await getOverrideForTrip(proposal.tripId);
  const currentRevision = current ? current.revision : null;
  const changes: ProposalFieldChange[] = Object.entries(proposal.changes).map(([field, to]) => ({
    field,
    from: current ? (current as unknown as Record<string, unknown>)[field] : undefined,
    to,
  }));
  return {
    notFound: false,
    isStale: currentRevision !== proposal.expectedRevision,
    currentRevision,
    changes,
  };
}
