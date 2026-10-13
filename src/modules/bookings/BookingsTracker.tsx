import { useEffect, useState } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import { listBookingsForTrip, createBooking, updateBooking, deleteBooking } from "../../db/repositories/bookingsRepo";
import { ValidationError } from "../../lib/errors";
import type { BookingInput } from "./validation";
import type { Trip, Booking, BookingType, BookingStatus } from "../../db/schema";
import type { View } from "../../navigation/types";

const BOOKING_TYPES: BookingType[] = ["flight", "accommodation", "tour", "insurance", "transport", "other"];
const BOOKING_STATUSES: BookingStatus[] = ["not_booked", "pending", "confirmed", "cancelled"];

export default function BookingsTracker({ tripId, onNavigate }: { tripId: string; onNavigate: (view: View) => void }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [type, setType] = useState<BookingType>("accommodation");
  const [provider, setProvider] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [status, setStatus] = useState<BookingStatus>("not_booked");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoadState("loading");
    try {
      const loadedTrip = await getTrip(tripId);
      if (!loadedTrip) {
        setLoadState("not-found");
        return;
      }
      setTrip(loadedTrip);
      setBookings(await listBookingsForTrip(tripId));
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoadState("error");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function handleAdd() {
    setSaving(true);
    setFieldErrors({});
    const input: BookingInput = {
      type,
      provider,
      confirmationNumber: confirmationNumber || undefined,
      cost: cost ? Number(cost) : undefined,
      currency: currency || undefined,
      bookingDate: bookingDate || undefined,
      status,
      notes: notes || undefined,
    };
    try {
      await createBooking(tripId, input);
      setProvider("");
      setConfirmationNumber("");
      setCost("");
      setCurrency("");
      setBookingDate("");
      setNotes("");
      await reload();
    } catch (err) {
      if (err instanceof ValidationError) setFieldErrors(err.fieldErrors);
      else setFieldErrors({ _general: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(b: Booking, newStatus: BookingStatus) {
    await updateBooking(b.id, { status: newStatus }, b.revision);
    await reload();
  }

  async function handleDelete(id: string) {
    await deleteBooking(id);
    await reload();
  }

  if (loadState === "loading") return <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8 text-ink-muted text-sm">Loading bookings…</div>;
  if (loadState === "not-found" || !trip) {
    return (
      <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-ink mb-3">That trip no longer exists.</p>
        <button type="button" onClick={() => onNavigate({ name: "dashboard" })} className="text-sm font-medium text-accent underline">
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-danger-text text-sm">Couldn't load bookings: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <button type="button" onClick={() => onNavigate({ name: "trip-details", tripId })} className="text-sm text-ink-muted underline mb-4">
        ← Back to {trip.name}
      </button>
      <h1 className="text-xl font-semibold text-ink mb-1">Bookings</h1>
      <p className="text-sm text-ink-muted mb-6">Flights, stays, tours, and anything else that needs a confirmation.</p>

      <div className="divide-y divide-navy-border rounded-lg border border-navy-border bg-navy-surface mb-6">
        {bookings.length === 0 ? (
          <p className="text-sm text-ink-faint italic px-4 py-3">No bookings yet.</p>
        ) : (
          bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-4 py-2 text-sm gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-ink">{b.provider}</span>{" "}
                <span className="text-xs text-ink-faint">({b.type})</span>
                <p className="text-xs text-ink-muted truncate">
                  {b.confirmationNumber ? `Confirmation ${b.confirmationNumber}` : "No confirmation number yet"}
                  {b.cost !== undefined ? ` · ${b.cost} ${b.currency ?? ""}` : ""}
                  {b.bookingDate ? ` · booked ${b.bookingDate}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={b.status}
                  aria-label={`Booking status for ${b.provider}`}
                  onChange={(e) => handleStatusChange(b, e.target.value as BookingStatus)}
                  className="rounded-lg border border-navy-border bg-navy-bg text-ink focus:border-accent focus:outline-none px-1.5 py-1 text-xs"
                >
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => handleDelete(b.id)} className="text-xs font-medium text-danger-text underline">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-lg border border-navy-border bg-navy-surface p-4">
        <h2 className="text-sm font-semibold text-ink mb-3">Add a booking</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <label className="block">
            <span className="block text-xs text-ink-muted mb-0.5">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as BookingType)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm">
              {BOOKING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-ink-muted mb-0.5">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm">
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs text-ink-muted mb-0.5">Provider</span>
            <input value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
            {fieldErrors.provider ? <span className="text-xs text-danger-text">{fieldErrors.provider}</span> : null}
          </label>
          <label className="block">
            <span className="block text-xs text-ink-muted mb-0.5">Confirmation #</span>
            <input value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs text-ink-muted mb-0.5">Booking date</span>
            <input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
            {fieldErrors.bookingDate ? <span className="text-xs text-danger-text">{fieldErrors.bookingDate}</span> : null}
          </label>
          <label className="block">
            <span className="block text-xs text-ink-muted mb-0.5">Cost</span>
            <input value={cost} onChange={(e) => setCost(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
            {fieldErrors.cost ? <span className="text-xs text-danger-text">{fieldErrors.cost}</span> : null}
          </label>
          <label className="block">
            <span className="block text-xs text-ink-muted mb-0.5">Currency</span>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
            {fieldErrors.currency ? <span className="text-xs text-danger-text">{fieldErrors.currency}</span> : null}
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs text-ink-muted mb-0.5">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
          </label>
        </div>
        {fieldErrors._general ? <p className="text-xs text-danger-text mb-2">{fieldErrors._general}</p> : null}
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !provider.trim()}
          className="px-3 py-1.5 rounded-md bg-accent text-navy-bg text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add booking"}
        </button>
      </div>
    </div>
  );
}
