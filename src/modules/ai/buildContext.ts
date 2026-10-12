import type { Trip, TravelerProfile, TripOverride, ItineraryDay, ItineraryItem } from "../../db/schema";

/**
 * Converts live IndexedDB records into the snapshot shape sent to the
 * AI gateway. Pure functions — the gateway is stateless (it never
 * touches IndexedDB, which is client-only), so the client is
 * responsible for telling it exactly what the trip looks like right
 * now, revision numbers included. Those revision numbers are what let
 * a later proposal be checked for staleness before it's applied.
 */

export interface TripContextSnapshot {
  id: string;
  revision: number;
  name: string;
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  roomCount?: number;
  status: string;
  notes?: string;
}

export interface ProfileContextSnapshot {
  revision: number;
  priorityOrder: string[];
  accommodationPreferences: string;
  foodPreferences: string;
  pace: string;
}

export interface OverrideContextSnapshot {
  revision: number;
  currency: string;
  budgetTargetMin?: number;
  budgetTargetMax?: number;
  mustHaveAmenities: string[];
  hotelVsAirbnbOpen: boolean;
}

export function buildTripContextSnapshot(trip: Trip): TripContextSnapshot {
  return {
    id: trip.id,
    revision: trip.revision,
    name: trip.name,
    destination: trip.destination,
    country: trip.country,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelerCount: trip.travelerCount,
    roomCount: trip.roomCount,
    status: trip.status,
    notes: trip.notes,
  };
}

export function buildProfileContextSnapshot(profile: TravelerProfile): ProfileContextSnapshot {
  return {
    revision: profile.revision,
    priorityOrder: profile.priorityOrder,
    accommodationPreferences: profile.accommodationPreferences,
    foodPreferences: profile.foodPreferences,
    pace: profile.pace,
  };
}

export function buildOverrideContextSnapshot(override: TripOverride | undefined): OverrideContextSnapshot | null {
  if (!override) return null;
  return {
    revision: override.revision,
    currency: override.currency,
    budgetTargetMin: override.budgetTargetMin,
    budgetTargetMax: override.budgetTargetMax,
    mustHaveAmenities: override.mustHaveAmenities,
    hotelVsAirbnbOpen: override.hotelVsAirbnbOpen,
  };
}

/**
 * Phase 5: a compact summary of one item, just enough for the model to
 * know what already exists (so it doesn't re-propose a duplicate) and
 * to target an edit with the right id/revision — not the item's full
 * shape (attribution, comments, etc.), which would cost tokens on every
 * turn without changing what the model needs to decide.
 */
export interface ItineraryItemContextSnapshot {
  itemId: string;
  revision: number;
  order: number;
  startTime?: string;
  endTime?: string;
  category: string;
  title: string;
  bookingStatus: string;
}

export interface ItineraryDayContextSnapshot {
  dayId: string;
  date: string;
  dayLabel: string;
  items: ItineraryItemContextSnapshot[];
}

export function buildItineraryContextSnapshot(
  days: ItineraryDay[],
  items: ItineraryItem[],
): ItineraryDayContextSnapshot[] {
  const itemsByDay = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    const bucket = itemsByDay.get(item.dayId) ?? [];
    bucket.push(item);
    itemsByDay.set(item.dayId, bucket);
  }

  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      dayId: day.id,
      date: day.date,
      dayLabel: day.dayLabel,
      items: (itemsByDay.get(day.id) ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          itemId: item.id,
          revision: item.revision,
          order: item.order,
          startTime: item.startTime,
          endTime: item.endTime,
          category: item.category,
          title: item.title,
          bookingStatus: item.bookingStatus,
        })),
    }));
}
