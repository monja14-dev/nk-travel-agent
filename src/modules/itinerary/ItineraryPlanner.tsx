import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import { ensureDaysForTripRange, updateDay } from "../../db/repositories/itineraryDaysRepo";
import { listItemsForTrip, createItem, updateItem, deleteItem, reorderItems } from "../../db/repositories/itineraryItemsRepo";
import { detectScheduleConflicts } from "./timeline";
import { computeDurationMinutes, formatDurationMinutes } from "./dateMath";
import { ValidationError } from "../../lib/errors";
import type { ItineraryItemInput } from "./validation";
import type { Trip, ItineraryDay, ItineraryItem, ItineraryItemCategory, BookingStatus } from "../../db/schema";
import type { View } from "../../navigation/types";

interface ItineraryPlannerProps {
  tripId: string;
  onNavigate: (view: View) => void;
}

type LoadState = "loading" | "ready" | "not-found" | "error";

const CATEGORIES: ItineraryItemCategory[] = [
  "transport",
  "lodging",
  "food",
  "activity",
  "rest",
  "shopping",
  "admin",
  "other",
];
const BOOKING_STATUSES: BookingStatus[] = ["not_booked", "pending", "confirmed", "cancelled"];
const ACTUAL_STATUSES = ["planned", "done", "skipped", "modified"] as const;

export default function ItineraryPlanner({ tripId, onNavigate }: ItineraryPlannerProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addingToDayId, setAddingToDayId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  async function reload() {
    setLoadState("loading");
    setActionError(null);
    try {
      const loadedTrip = await getTrip(tripId);
      if (!loadedTrip) {
        setLoadState("not-found");
        return;
      }
      const loadedDays = await ensureDaysForTripRange(tripId, loadedTrip.startDate, loadedTrip.endDate);
      const loadedItems = await listItemsForTrip(tripId);
      setTrip(loadedTrip);
      setDays(loadedDays);
      setItems(loadedItems);
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

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ItineraryItem[]>();
    for (const item of items) {
      const bucket = map.get(item.dayId) ?? [];
      bucket.push(item);
      map.set(item.dayId, bucket);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.order - b.order);
    return map;
  }, [items]);

  async function handleMove(dayId: string, itemId: string, direction: -1 | 1) {
    const dayItems = (itemsByDay.get(dayId) ?? []).map((i) => i.id);
    const index = dayItems.indexOf(itemId);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= dayItems.length) return;
    [dayItems[index], dayItems[swapWith]] = [dayItems[swapWith], dayItems[index]];
    try {
      await reorderItems(dayId, dayItems);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(itemId: string) {
    try {
      await deleteItem(itemId);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loadState === "loading") {
    return <div className="max-w-3xl w-full mx-auto px-6 py-8 text-slate-500 text-sm">Loading itinerary…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="max-w-3xl w-full mx-auto px-6 py-8">
        <p className="text-slate-700 mb-3">That trip no longer exists.</p>
        <button type="button" onClick={() => onNavigate({ name: "dashboard" })} className="text-sm font-medium text-slate-900 underline">
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error" || !trip) {
    return (
      <div className="max-w-3xl w-full mx-auto px-6 py-8">
        <p className="text-red-700 text-sm">Couldn't load this itinerary: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl w-full mx-auto px-6 py-8">
      <button
        type="button"
        onClick={() => onNavigate({ name: "trip-details", tripId })}
        className="text-sm text-slate-500 underline mb-4"
      >
        ← Back to {trip.name}
      </button>

      <h1 className="text-xl font-semibold text-slate-900 mb-1">Detailed Itinerary</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every block below is independently editable. Reorder with the arrows — the app flags overlapping times for
        you, it never silently reshuffles anything.
      </p>

      {actionError ? <p className="text-red-700 text-sm mb-4">{actionError}</p> : null}

      <div className="space-y-6">
        {days.map((day) => {
          const dayItems = itemsByDay.get(day.id) ?? [];
          const conflicts = detectScheduleConflicts(dayItems);
          const conflictingIds = new Set(conflicts.flatMap((c) => [c.aId, c.bId]));
          return (
            <DayCard
              key={day.id}
              tripId={tripId}
              day={day}
              items={dayItems}
              conflictingIds={conflictingIds}
              conflictCount={conflicts.length}
              addingToDayId={addingToDayId}
              editingItemId={editingItemId}
              onStartAdd={() => setAddingToDayId(day.id)}
              onCancelAdd={() => setAddingToDayId(null)}
              onStartEdit={(id) => setEditingItemId(id)}
              onCancelEdit={() => setEditingItemId(null)}
              onMove={(itemId, dir) => handleMove(day.id, itemId, dir)}
              onDelete={handleDelete}
              onSaved={async () => {
                setAddingToDayId(null);
                setEditingItemId(null);
                await reload();
              }}
              onRenameDay={async (dayLabel) => {
                try {
                  await updateDay(day.id, { dayLabel }, day.revision);
                  await reload();
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCard({
  tripId,
  day,
  items,
  conflictingIds,
  conflictCount,
  addingToDayId,
  editingItemId,
  onStartAdd,
  onCancelAdd,
  onStartEdit,
  onCancelEdit,
  onMove,
  onDelete,
  onSaved,
  onRenameDay,
}: {
  tripId: string;
  day: ItineraryDay;
  items: ItineraryItem[];
  conflictingIds: Set<string>;
  conflictCount: number;
  addingToDayId: string | null;
  editingItemId: string | null;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onMove: (itemId: string, direction: -1 | 1) => void;
  onDelete: (itemId: string) => void;
  onSaved: () => void;
  onRenameDay: (label: string) => void;
}) {
  const [labelDraft, setLabelDraft] = useState(day.dayLabel);
  const isAdding = addingToDayId === day.id;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{day.date}</span>
          <input
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => labelDraft.trim() && labelDraft !== day.dayLabel && onRenameDay(labelDraft)}
            className="text-sm font-semibold text-slate-900 border-b border-dashed border-transparent hover:border-slate-300 focus:border-slate-400 outline-none"
          />
        </div>
        <button type="button" onClick={onStartAdd} className="text-xs font-medium text-slate-900 underline">
          + Add item
        </button>
      </div>

      {conflictCount > 0 ? (
        <div className="mx-4 mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          {conflictCount} overlapping time {conflictCount === 1 ? "pair" : "pairs"} in this day — check the
          highlighted items below.
        </div>
      ) : null}

      <div className="divide-y divide-slate-100">
        {items.length === 0 ? <p className="px-4 py-3 text-sm text-slate-400 italic">No items yet.</p> : null}
        {items.map((item, index) =>
          editingItemId === item.id ? (
            <div key={item.id} className="px-4 py-3">
              <ItemForm
                tripId={tripId}
                dayId={day.id}
                existing={item}
                onCancel={onCancelEdit}
                onSaved={onSaved}
              />
            </div>
          ) : (
            <ItemRow
              key={item.id}
              item={item}
              conflicting={conflictingIds.has(item.id)}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onMoveUp={() => onMove(item.id, -1)}
              onMoveDown={() => onMove(item.id, 1)}
              onEdit={() => onStartEdit(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          ),
        )}
      </div>

      {isAdding ? (
        <div className="px-4 py-3 border-t border-slate-100">
          <ItemForm tripId={tripId} dayId={day.id} onCancel={onCancelAdd} onSaved={onSaved} />
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  conflicting,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  item: ItineraryItem;
  conflicting: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const duration =
    item.durationMinutes ?? computeDurationMinutes(item.startTime, item.endTime, item.crossesMidnight);
  return (
    <div className={`flex items-start gap-3 px-4 py-3 text-sm ${conflicting ? "bg-red-50" : ""}`}>
      <div className="flex flex-col gap-0.5 pt-0.5">
        <button type="button" disabled={!canMoveUp} onClick={onMoveUp} className="text-slate-400 hover:text-slate-900 disabled:opacity-30">
          ▲
        </button>
        <button type="button" disabled={!canMoveDown} onClick={onMoveDown} className="text-slate-400 hover:text-slate-900 disabled:opacity-30">
          ▼
        </button>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{item.title}</span>
          <span className="text-xs uppercase tracking-wide text-slate-400">{item.category}</span>
          {conflicting ? <span className="text-xs text-red-700 font-medium">overlaps</span> : null}
        </div>
        <p className="text-xs text-slate-500">
          {item.startTime ?? "—"}
          {item.endTime ? ` – ${item.endTime}${item.crossesMidnight ? " (+1 day)" : ""}` : ""}
          {duration !== undefined ? ` · ${formatDurationMinutes(duration)}` : ""}
          {item.newCalendarDay ? " · starts next calendar day" : ""}
        </p>
        {item.address ? <p className="text-xs text-slate-500">{item.address}</p> : null}
        <p className="text-xs text-slate-500">
          Booking: {item.bookingStatus.replace("_", " ")}
          {item.farePlanned !== undefined ? ` · Fare ${item.farePlanned}${item.currency ? ` ${item.currency}` : ""}` : ""}
          {item.activityCostPlanned !== undefined
            ? ` · Activity ${item.activityCostPlanned}${item.currency ? ` ${item.currency}` : ""}`
            : ""}
        </p>
        {item.comments ? <p className="text-xs text-slate-500 italic">{item.comments}</p> : null}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onEdit} className="text-xs font-medium text-slate-900 underline">
          Edit
        </button>
        <button type="button" onClick={onDelete} className="text-xs font-medium text-red-700 underline">
          Delete
        </button>
      </div>
    </div>
  );
}

function ItemForm({
  tripId,
  dayId,
  existing,
  onCancel,
  onSaved,
}: {
  tripId: string;
  dayId: string;
  existing?: ItineraryItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState<ItineraryItemCategory>(existing?.category ?? "activity");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "");
  const [crossesMidnight, setCrossesMidnight] = useState(existing?.crossesMidnight ?? false);
  const [newCalendarDay, setNewCalendarDay] = useState(existing?.newCalendarDay ?? false);
  const [travelTimeMinutes, setTravelTimeMinutes] = useState(existing?.travelTimeMinutes?.toString() ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [transportNotes, setTransportNotes] = useState(existing?.transportNotes ?? "");
  const [openingHours, setOpeningHours] = useState(existing?.openingHours ?? "");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>(existing?.bookingStatus ?? "not_booked");
  const [farePlanned, setFarePlanned] = useState(existing?.farePlanned?.toString() ?? "");
  const [activityCostPlanned, setActivityCostPlanned] = useState(existing?.activityCostPlanned?.toString() ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? "");
  const [comments, setComments] = useState(existing?.comments ?? "");
  const [actualStatus, setActualStatus] = useState<(typeof ACTUAL_STATUSES)[number] | "">(existing?.actualStatus ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    setFieldErrors({});
    const input: ItineraryItemInput = {
      order: existing?.order ?? 0,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      crossesMidnight,
      newCalendarDay,
      // Phase 6 fix: this form has no field for durationMinutes (it's
      // normally derived from start/end via computeDurationMinutes, or
      // set by an AI proposal for a timeless item). Previously this was
      // hardcoded to `undefined`, and updateItem's merge logic treats any
      // key *present* in the patch — even undefined-valued — as "clear
      // this field" (`"durationMinutes" in patch`), so saving any edit
      // through this form silently wiped out a value set some other way.
      // Preserving the existing value here (there's nothing to preserve
      // on a brand-new item) fixes that without needing a UI control for
      // a field nothing in this form lets a person actually set.
      durationMinutes: existing?.durationMinutes,
      travelTimeMinutes: travelTimeMinutes ? Number(travelTimeMinutes) : undefined,
      category,
      title,
      address: address || undefined,
      transportNotes: transportNotes || undefined,
      openingHours: openingHours || undefined,
      bookingStatus,
      farePlanned: farePlanned ? Number(farePlanned) : undefined,
      activityCostPlanned: activityCostPlanned ? Number(activityCostPlanned) : undefined,
      currency: currency || undefined,
      comments: comments || undefined,
      actualStatus: actualStatus || undefined,
    };
    try {
      if (existing) {
        await updateItem(existing.id, input, existing.revision);
      } else {
        await createItem(tripId, dayId, input);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ValidationError) {
        setFieldErrors(err.fieldErrors);
      } else {
        setFieldErrors({ _general: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Title" error={fieldErrors.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="Category" error={fieldErrors.category}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ItineraryItemCategory)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start (HH:MM)" error={fieldErrors.startTime}>
          <input value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="14:00" className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="End (HH:MM)" error={fieldErrors.endTime}>
          <input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="15:30" className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={crossesMidnight} onChange={(e) => setCrossesMidnight(e.target.checked)} />
          This block's own end crosses midnight
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={newCalendarDay} onChange={(e) => setNewCalendarDay(e.target.checked)} />
          Starts the day after the previous item
        </label>
        <Field label="Travel time (min)" error={fieldErrors.travelTimeMinutes}>
          <input value={travelTimeMinutes} onChange={(e) => setTravelTimeMinutes(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="Address" error={fieldErrors.address}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="How to get there" error={fieldErrors.transportNotes}>
          <input value={transportNotes} onChange={(e) => setTransportNotes(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="Opening hours" error={fieldErrors.openingHours}>
          <input value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="Booking status" error={fieldErrors.bookingStatus}>
          <select value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value as BookingStatus)} className="w-full border rounded px-2 py-1 text-sm">
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Actual status" error={fieldErrors.actualStatus}>
          <select value={actualStatus} onChange={(e) => setActualStatus(e.target.value as (typeof ACTUAL_STATUSES)[number])} className="w-full border rounded px-2 py-1 text-sm">
            <option value="">(not set)</option>
            {ACTUAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fare planned" error={fieldErrors.farePlanned}>
          <input value={farePlanned} onChange={(e) => setFarePlanned(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="Activity cost planned" error={fieldErrors.activityCostPlanned}>
          <input value={activityCostPlanned} onChange={(e) => setActivityCostPlanned(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="Currency" error={fieldErrors.currency}>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="Comments" error={fieldErrors.comments}>
          <input value={comments} onChange={(e) => setComments(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </Field>
      </div>
      {fieldErrors._general ? <p className="text-xs text-red-700">{fieldErrors._general}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : existing ? "Save changes" : "Add item"}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-0.5">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-700 mt-0.5">{error}</span> : null}
    </label>
  );
}
