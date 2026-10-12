import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { resetTestDb } from "./testSupport";
import { createBooking, updateBooking, deleteBooking, listBookingsForTrip } from "../bookingsRepo";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../../lib/errors";
import type { BookingInput } from "../../../modules/bookings/validation";

const TRIP_A = "trip_a";

function sampleInput(overrides: Partial<BookingInput> = {}): BookingInput {
  return { type: "flight", provider: "Cebu Pacific", status: "not_booked", ...overrides };
}

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("bookingsRepo", () => {
  it("creates a booking with revision 1", async () => {
    const booking = await createBooking(TRIP_A, sampleInput());
    expect(booking.id).toMatch(/^booking_/);
    expect(booking.revision).toBe(1);
  });

  it("rejects an empty provider", async () => {
    await expect(createBooking(TRIP_A, sampleInput({ provider: "" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires a currency when cost is set", async () => {
    await expect(createBooking(TRIP_A, sampleInput({ cost: 5000, currency: undefined }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a malformed booking date", async () => {
    await expect(createBooking(TRIP_A, sampleInput({ bookingDate: "not-a-date" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates status and bumps revision", async () => {
    const booking = await createBooking(TRIP_A, sampleInput());
    const updated = await updateBooking(booking.id, { status: "confirmed" }, booking.revision);
    expect(updated.status).toBe("confirmed");
    expect(updated.revision).toBe(2);
  });

  it("throws StaleRevisionError on a revision mismatch", async () => {
    const booking = await createBooking(TRIP_A, sampleInput());
    await expect(updateBooking(booking.id, { status: "confirmed" }, booking.revision + 1)).rejects.toBeInstanceOf(StaleRevisionError);
  });

  it("throws NotFoundError for a missing booking", async () => {
    await expect(updateBooking("booking_missing", {}, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes idempotently", async () => {
    const booking = await createBooking(TRIP_A, sampleInput());
    await deleteBooking(booking.id);
    await expect(deleteBooking(booking.id)).resolves.toBeUndefined();
    expect(await listBookingsForTrip(TRIP_A)).toHaveLength(0);
  });
});
