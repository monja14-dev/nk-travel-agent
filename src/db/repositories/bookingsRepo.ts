import { getReadyDb, withWriteTransaction } from "../client";
import type { Booking } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../lib/errors";
import { validateBookingInput, hasErrors, type BookingInput } from "../../modules/bookings/validation";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function listBookingsForTrip(tripId: string): Promise<Booking[]> {
  return getReadyDb().getAllFromIndex("bookings", "by-trip", tripId);
}

export async function createBooking(tripId: string, input: BookingInput): Promise<Booking> {
  const errors = validateBookingInput(input);
  if (hasErrors(errors)) throw new ValidationError(errors);

  const now = nowIso();
  const booking: Booking = {
    id: generateId("booking"),
    tripId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    type: input.type,
    provider: input.provider.trim(),
    confirmationNumber: input.confirmationNumber?.trim() || undefined,
    cost: input.cost,
    currency: input.currency?.trim() || undefined,
    bookingDate: input.bookingDate,
    status: input.status,
    notes: input.notes?.trim() || undefined,
  };

  await withWriteTransaction(["bookings", "changeLog"], async (tx) => {
    await tx.objectStore("bookings").add(booking);
    await tx
      .objectStore("changeLog")
      .add(buildChangeLogEntry({ tripId, entityType: "bookings", entityId: booking.id, action: "create", after: booking }));
  });
  return booking;
}

export async function updateBooking(
  id: string,
  patch: Partial<BookingInput>,
  expectedRevision: number,
): Promise<Booking> {
  return withWriteTransaction(["bookings", "changeLog"], async (tx) => {
    const store = tx.objectStore("bookings");
    const existing = await store.get(id);
    if (!existing) throw new NotFoundError("Booking", id);
    if (existing.revision !== expectedRevision) throw new StaleRevisionError("Booking", id);

    const merged: BookingInput = {
      type: patch.type ?? existing.type,
      provider: patch.provider ?? existing.provider,
      confirmationNumber: "confirmationNumber" in patch ? patch.confirmationNumber : existing.confirmationNumber,
      cost: "cost" in patch ? patch.cost : existing.cost,
      currency: "currency" in patch ? patch.currency : existing.currency,
      bookingDate: "bookingDate" in patch ? patch.bookingDate : existing.bookingDate,
      status: patch.status ?? existing.status,
      notes: "notes" in patch ? patch.notes : existing.notes,
    };
    const errors = validateBookingInput(merged);
    if (hasErrors(errors)) throw new ValidationError(errors);

    const updated: Booking = {
      ...existing,
      ...merged,
      provider: merged.provider.trim(),
      confirmationNumber: merged.confirmationNumber?.trim() || undefined,
      currency: merged.currency?.trim() || undefined,
      notes: merged.notes?.trim() || undefined,
      revision: existing.revision + 1,
      updatedAt: nowIso(),
    };
    await store.put(updated);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId: existing.tripId,
        entityType: "bookings",
        entityId: id,
        action: "update",
        before: existing,
        after: updated,
      }),
    );
    return updated;
  });
}

export async function deleteBooking(id: string): Promise<void> {
  await withWriteTransaction(["bookings", "changeLog"], async (tx) => {
    const store = tx.objectStore("bookings");
    const existing = await store.get(id);
    if (!existing) return;
    await store.delete(id);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({ tripId: existing.tripId, entityType: "bookings", entityId: id, action: "delete", before: existing }),
    );
  });
}
