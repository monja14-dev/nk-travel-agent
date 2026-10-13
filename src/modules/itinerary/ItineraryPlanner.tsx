import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import { ensureDaysForTripRange, updateDay } from "../../db/repositories/itineraryDaysRepo";
import { listItemsForTrip, createItem, updateItem, deleteItem, reorderItems } from "../../db/repositories/itineraryItemsRepo";
import { ValidationError } from "../../lib/errors";
import { formatDateRange } from "../../lib/format";
import { Badge, Button, Card, CardBody, EmptyState, PageHeader, StatTile, bookingStatusTone, verificationStatusTone } from "../../components/ui";
import { ChevronLeftIcon } from "../../components/shell/icons";
import { buildStudioRows, summarizeStudio, type StudioRow } from "./studioRows";
import type { ItineraryItemInput } from "./validation";
import type { Trip, ItineraryDay, ItineraryItem, ItineraryItemCategory, BookingStatus } from "../../db/schema";
import type { View } from "../../navigation/types";

/**
 * Phase 7 (UI): Itinerary Studio (spec §6). Same data layer, validation and
 * edit form logic as the Phase 3–5 planner — only the presentation changed:
 *  - Timeline: each day as a card, items on a time rail, overlaps flagged.
 *  - Spreadsheet: every item as one row with the Taiwan_041026 workbook's
 *    columns, for scanning and comparing; edit opens the same form above it.
 * Nothing here writes except through the existing repositories.
 */

interface ItineraryPlannerProps {
  tripId: string;
  onNavigate: (view: View) => void;
}

type LoadState = "loading" | "ready" | "not-found" | "error";
type StudioView = "timeline" | "spreadsheet";

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

/** Rail dot per category — decoration only; the category is always also
 * written out in text. */
const CATEGORY_DOT: Record<ItineraryItemCategory, string> = {
  transport: "bg-sky-400",
  lodging: "bg-violet-400",
  food: "bg-orange-400",
  activity: "bg-accent",
  rest: "bg-slate-400",
  shopping: "bg-pink-400",
  admin: "bg-emerald-400",
  other: "bg-ink-faint",
};

const inputClass =
  "w-full rounded-lg border border-navy-border bg-navy-bg px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50";

export default function ItineraryPlanner({ tripId, onNavigate }: ItineraryPlannerProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addingToDayId, setAddingToDayId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [studioView, setStudioView] = useState<StudioView>("timeline");

  /** `initial` loads show the full-page loading state; refreshes after an
   * edit keep the page (and scroll position) in place, and report a
   * failure as an inline error instead of replacing the whole screen. */
  async function reload(initial = false) {
    if (initial) setLoadState("loading");
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
      const message = err instanceof Error ? err.message : String(err);
      if (initial) {
        setLoadError(message);
        setLoadState("error");
      } else {
        setActionError(message);
      }
    }
  }

  useEffect(() => {
    reload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const rows = useMemo(() => buildStudioRows(days, items), [days, items]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.itemId, r])), [rows]);
  const summary = useMemo(() => summarizeStudio(days, items), [days, items]);

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

  async function handleSaved() {
    setAddingToDayId(null);
    setEditingItemId(null);
    await reload();
  }

  if (loadState === "loading") {
    return <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-ink-muted sm:px-6">Loading itinerary…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <p className="mb-3 text-ink">That trip no longer exists.</p>
        <Button onClick={() => onNavigate({ name: "dashboard" })}>Back to dashboard</Button>
      </div>
    );
  }
  if (loadState === "error" || !trip) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <p role="alert" className="rounded-card border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger-text">
          Couldn't load this itinerary: {loadError}
        </p>
      </div>
    );
  }

  const editingItem = editingItemId ? items.find((i) => i.id === editingItemId) : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3"
        onClick={() => onNavigate({ name: "trip-details", tripId })}
      >
        <ChevronLeftIcon width={16} height={16} />
        {trip.name}
      </Button>

      <PageHeader
        title="Itinerary Studio"
        subtitle={`${trip.destination} · ${formatDateRange(trip.startDate, trip.endDate)}`}
        actions={<ViewToggle value={studioView} onChange={setStudioView} />}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Days planned"
          value={summary.dayCount === 0 ? "—" : `${summary.daysPlanned} / ${summary.dayCount}`}
          hint={summary.activityCount === 0 ? "Nothing planned yet" : `${summary.activityCount} activities`}
        />
        <StatTile
          label="Done"
          value={summary.activityCount === 0 ? "—" : `${summary.doneCount} / ${summary.activityCount}`}
          hint="Marked done by you"
        />
        <StatTile
          label="Time conflicts"
          value={summary.conflictPairs}
          hint={summary.conflictPairs === 0 ? "No overlaps found" : "Overlapping pairs to review"}
        />
        <StatTile
          label="No start time"
          value={summary.untimedCount}
          hint={summary.untimedCount === 0 ? "Everything is on the clock" : "Not placed on the timeline"}
        />
      </div>

      {summary.outsideTripCount > 0 && (
        <p className="mt-4 rounded-card border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-warning-text">
          {summary.outsideTripCount} {summary.outsideTripCount === 1 ? "activity sits" : "activities sit"} on a day
          outside the trip's current dates (the dates were probably changed). They're kept and listed at the end of the
          spreadsheet view; nothing was deleted.
        </p>
      )}

      {actionError ? (
        <p role="alert" className="mt-4 rounded-card border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger-text">
          {actionError}
        </p>
      ) : null}

      {studioView === "timeline" ? (
        <div className="mt-6 space-y-5">
          {days.map((day) => (
            <DayCard
              key={day.id}
              tripId={tripId}
              day={day}
              items={itemsByDay.get(day.id) ?? []}
              rowById={rowById}
              addingToDayId={addingToDayId}
              editingItemId={editingItemId}
              onStartAdd={() => setAddingToDayId(day.id)}
              onCancelAdd={() => setAddingToDayId(null)}
              onStartEdit={(id) => setEditingItemId(id)}
              onCancelEdit={() => setEditingItemId(null)}
              onMove={(itemId, dir) => handleMove(day.id, itemId, dir)}
              onDelete={handleDelete}
              onSaved={handleSaved}
              onRenameDay={async (dayLabel) => {
                try {
                  await updateDay(day.id, { dayLabel }, day.revision);
                  await reload();
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {editingItem && (
            <Card>
              <CardBody>
                <h2 className="mb-3 text-sm font-semibold text-ink">Editing: {editingItem.title}</h2>
                <ItemForm
                  key={editingItem.id}
                  tripId={tripId}
                  dayId={editingItem.dayId}
                  existing={editingItem}
                  onCancel={() => setEditingItemId(null)}
                  onSaved={handleSaved}
                />
              </CardBody>
            </Card>
          )}
          {rows.length === 0 ? (
            <EmptyState
              title="No activities yet"
              description="Switch to Timeline to add the first one — the spreadsheet fills in as you plan."
              action={<Button onClick={() => setStudioView("timeline")}>Go to Timeline</Button>}
            />
          ) : (
            <SpreadsheetTable rows={rows} onEdit={(id) => setEditingItemId(id)} />
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- toggle -------------------------------- */

function ViewToggle({ value, onChange }: { value: StudioView; onChange: (v: StudioView) => void }) {
  const options: Array<{ id: StudioView; label: string }> = [
    { id: "timeline", label: "Timeline" },
    { id: "spreadsheet", label: "Spreadsheet" },
  ];
  return (
    <div role="group" aria-label="Itinerary view" className="inline-flex rounded-lg border border-navy-border bg-navy-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            value === o.id ? "bg-accent text-navy-bg" : "text-ink-muted hover:text-ink",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- timeline view --------------------------- */

function DayCard({
  tripId,
  day,
  items,
  rowById,
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
  rowById: Map<string, StudioRow>;
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
  const conflictCount = items.filter((i) => rowById.get(i.id)?.conflict).length;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-md bg-navy-elevated px-2 py-1 text-xs font-medium text-ink-muted">
            {formatDateRange(day.date, day.date)}
          </span>
          <input
            aria-label={`Label for ${day.date}`}
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => labelDraft.trim() && labelDraft !== day.dayLabel && onRenameDay(labelDraft)}
            className="min-w-0 flex-1 border-b border-dashed border-transparent bg-transparent text-sm font-semibold text-ink outline-none hover:border-navy-border focus:border-accent"
          />
        </div>
        <Button size="sm" variant="secondary" onClick={onStartAdd}>
          + Add item
        </Button>
      </div>

      {conflictCount > 0 ? (
        <p className="mx-4 mt-3 rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-danger-text sm:mx-5">
          {conflictCount} {conflictCount === 1 ? "item has" : "items have"} overlapping times in this day — highlighted
          below.
        </p>
      ) : null}

      <ul className="divide-y divide-navy-border">
        {items.length === 0 ? <li className="px-4 py-4 text-sm italic text-ink-faint sm:px-5">No items yet.</li> : null}
        {items.map((item, index) => {
          const row = rowById.get(item.id);
          if (editingItemId === item.id) {
            return (
              <li key={item.id} className="px-4 py-4 sm:px-5">
                <ItemForm tripId={tripId} dayId={day.id} existing={item} onCancel={onCancelEdit} onSaved={onSaved} />
              </li>
            );
          }
          if (!row) return null;
          return (
            <ItemRow
              key={item.id}
              row={row}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onMoveUp={() => onMove(item.id, -1)}
              onMoveDown={() => onMove(item.id, 1)}
              onEdit={() => onStartEdit(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          );
        })}
      </ul>

      {isAdding ? (
        <div className="border-t border-navy-border px-4 py-4 sm:px-5">
          <ItemForm tripId={tripId} dayId={day.id} onCancel={onCancelAdd} onSaved={onSaved} />
        </div>
      ) : null}
    </Card>
  );
}

function ItemRow({
  row,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  row: StudioRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const booking = bookingStatusTone(row.bookingStatus);
  const money = [
    row.farePlanned ? `Fare ${row.farePlanned}${row.fareActual ? ` (actual ${row.fareActual})` : ""}` : null,
    row.costPlanned ? `Activity ${row.costPlanned}${row.costActual ? ` (actual ${row.costActual})` : ""}` : null,
  ].filter(Boolean);

  return (
    <li className={["flex gap-3 px-4 py-3 text-sm sm:px-5", row.conflict ? "bg-danger-bg/40" : ""].join(" ")}>
      {/* time column */}
      <div className="w-14 shrink-0 text-right">
        <p className="font-medium text-ink">{row.start ?? "—"}</p>
        {row.end && (
          <p className="text-xs text-ink-muted">
            {row.end}
            {row.endNextDay ? " +1" : ""}
          </p>
        )}
      </div>

      {/* rail */}
      <div className="flex shrink-0 flex-col items-center pt-1.5" aria-hidden="true">
        <span className={["h-2.5 w-2.5 rounded-full", CATEGORY_DOT[row.category]].join(" ")} />
        <span className="mt-1 w-px flex-1 bg-navy-border" />
      </div>

      {/* content */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{row.title}</span>
          <span className="text-xs uppercase tracking-wide text-ink-faint">{row.category}</span>
          {row.conflict && <Badge tone="danger">Overlaps</Badge>}
          {row.actualStatus && row.actualStatus !== "planned" && (
            <Badge tone={row.actualStatus === "done" ? "success" : "neutral"}>{row.actualStatus}</Badge>
          )}
        </div>

        <p className="text-xs text-ink-muted">
          {[
            row.duration,
            row.startsNextDay ? "starts next calendar day" : null,
            row.travelTime ? `${row.travelTime} travel` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No duration recorded"}
        </p>

        {row.address && (
          <p className="text-xs text-ink-muted">
            {row.address}
            {row.mapsUrl && (
              <>
                {" "}
                <a
                  href={row.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Open in Maps ↗
                </a>
              </>
            )}
          </p>
        )}
        {row.transport && <p className="text-xs text-ink-muted">Getting there: {row.transport}</p>}
        {row.openingHours && <p className="text-xs text-ink-muted">Hours: {row.openingHours}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Badge tone={booking.tone}>{booking.label}</Badge>
          {money.length > 0 && <span className="text-xs text-ink-muted">{money.join(" · ")}</span>}
          {row.source && <SourceChip source={row.source} />}
        </div>

        {row.comments && <p className="text-xs italic text-ink-muted">{row.comments}</p>}
      </div>

      {/* actions */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-muted">Delete?</span>
            <Button size="sm" variant="danger" onClick={onDelete}>
              Yes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              No
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" disabled={!canMoveUp} onClick={onMoveUp} aria-label={`Move ${row.title} up`}>
                ▲
              </Button>
              <Button size="sm" variant="ghost" disabled={!canMoveDown} onClick={onMoveDown} aria-label={`Move ${row.title} down`}>
                ▼
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="secondary" onClick={onEdit}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${row.title}`}>
                Delete
              </Button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function SourceChip({ source }: { source: NonNullable<StudioRow["source"]> }) {
  const v = verificationStatusTone(source.status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <Badge tone={v.tone}>{v.label}</Badge>
      {source.href ? (
        <a href={source.href} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
          {source.label} ↗
        </a>
      ) : (
        <span>{source.label}</span>
      )}
    </span>
  );
}

/* ----------------------------- spreadsheet view -------------------------- */

const TH = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted";
const TD = "px-3 py-2 align-top text-sm text-ink";

function Dash() {
  return <span className="text-ink-faint">—</span>;
}

function SpreadsheetTable({ rows, onEdit }: { rows: StudioRow[]; onEdit: (itemId: string) => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[1400px] border-collapse">
          <thead className="sticky top-0 z-10 bg-navy-elevated">
            <tr>
              <th className={TH}>Date</th>
              <th className={TH}>Day</th>
              <th className={TH}>Start</th>
              <th className={TH}>End</th>
              <th className={TH}>Duration</th>
              <th className={TH}>Activity</th>
              <th className={TH}>Category</th>
              <th className={TH}>Address</th>
              <th className={TH}>Transport</th>
              <th className={TH}>Travel</th>
              <th className={TH}>Fare</th>
              <th className={TH}>Cost</th>
              <th className={TH}>Booking</th>
              <th className={TH}>Opening hours</th>
              <th className={TH}>Comments</th>
              <th className={TH}>Source</th>
              <th className={TH}>Actual</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-border">
            {rows.map((r) => {
              const booking = bookingStatusTone(r.bookingStatus);
              return (
                <tr key={r.itemId} className={r.conflict ? "bg-danger-bg/40" : "hover:bg-navy-elevated/40"}>
                  <td className={`${TD} whitespace-nowrap`}>{r.date ? formatDateRange(r.date, r.date) : <Dash />}</td>
                  <td className={`${TD} min-w-[8rem]`}>{r.dayLabel}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.start ?? <Dash />}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {r.end ? `${r.end}${r.endNextDay ? " +1" : ""}` : <Dash />}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{r.duration ?? <Dash />}</td>
                  <td className={`${TD} min-w-[12rem] font-medium`}>
                    {r.title}
                    {r.conflict && (
                      <span className="ml-2 align-middle">
                        <Badge tone="danger">Overlaps</Badge>
                      </span>
                    )}
                    {r.startsNextDay && <p className="text-xs font-normal text-ink-muted">starts next calendar day</p>}
                  </td>
                  <td className={`${TD} whitespace-nowrap capitalize text-ink-muted`}>{r.category}</td>
                  <td className={`${TD} min-w-[12rem]`}>
                    {r.address ? (
                      <>
                        {r.address}
                        {r.mapsUrl && (
                          <>
                            {" "}
                            <a
                              href={r.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whitespace-nowrap text-accent underline-offset-2 hover:underline"
                            >
                              Map ↗
                            </a>
                          </>
                        )}
                      </>
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className={`${TD} min-w-[10rem]`}>{r.transport ?? <Dash />}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.travelTime ?? <Dash />}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <Amount planned={r.farePlanned} actual={r.fareActual} />
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <Amount planned={r.costPlanned} actual={r.costActual} />
                  </td>
                  <td className={TD}>
                    <Badge tone={booking.tone}>{booking.label}</Badge>
                  </td>
                  <td className={`${TD} min-w-[9rem]`}>{r.openingHours ?? <Dash />}</td>
                  <td className={`${TD} min-w-[12rem] text-ink-muted`}>{r.comments ?? <Dash />}</td>
                  <td className={`${TD} min-w-[10rem]`}>{r.source ? <SourceChip source={r.source} /> : <Dash />}</td>
                  <td className={`${TD} whitespace-nowrap capitalize`}>{r.actualStatus ?? <Dash />}</td>
                  <td className={TD}>
                    {r.onTripDay ? (
                      <Button size="sm" variant="secondary" onClick={() => onEdit(r.itemId)} aria-label={`Edit ${r.title}`}>
                        Edit
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Amount({ planned, actual }: { planned: string | null; actual: string | null }) {
  if (!planned && !actual) return <Dash />;
  return (
    <>
      {planned && <span>{planned}</span>}
      {actual && <p className="text-xs text-ink-muted">actual {actual}</p>}
    </>
  );
}

/* ---------------------------------- form --------------------------------- */

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
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" error={fieldErrors.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Category" error={fieldErrors.category}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ItineraryItemCategory)}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start (HH:MM)" error={fieldErrors.startTime}>
          <input value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="14:00" className={inputClass} />
        </Field>
        <Field label="End (HH:MM)" error={fieldErrors.endTime}>
          <input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="15:30" className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={crossesMidnight}
            onChange={(e) => setCrossesMidnight(e.target.checked)}
            className="h-4 w-4 rounded border-navy-border accent-[#D5B67B]"
          />
          This block's own end crosses midnight
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={newCalendarDay}
            onChange={(e) => setNewCalendarDay(e.target.checked)}
            className="h-4 w-4 rounded border-navy-border accent-[#D5B67B]"
          />
          Starts the day after the previous item
        </label>
        <Field label="Travel time (min)" error={fieldErrors.travelTimeMinutes}>
          <input value={travelTimeMinutes} onChange={(e) => setTravelTimeMinutes(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Address" error={fieldErrors.address}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </Field>
        <Field label="How to get there" error={fieldErrors.transportNotes}>
          <input value={transportNotes} onChange={(e) => setTransportNotes(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Opening hours" error={fieldErrors.openingHours}>
          <input value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Booking status" error={fieldErrors.bookingStatus}>
          <select value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value as BookingStatus)} className={inputClass}>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Actual status" error={fieldErrors.actualStatus}>
          <select
            value={actualStatus}
            onChange={(e) => setActualStatus(e.target.value as (typeof ACTUAL_STATUSES)[number])}
            className={inputClass}
          >
            <option value="">(not set)</option>
            {ACTUAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fare planned" error={fieldErrors.farePlanned}>
          <input value={farePlanned} onChange={(e) => setFarePlanned(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Activity cost planned" error={fieldErrors.activityCostPlanned}>
          <input value={activityCostPlanned} onChange={(e) => setActivityCostPlanned(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Currency" error={fieldErrors.currency}>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Comments" error={fieldErrors.comments}>
          <input value={comments} onChange={(e) => setComments(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {fieldErrors._general ? <p className="text-xs text-danger-text">{fieldErrors._general}</p> : null}
      <div className="flex gap-2">
        <Button variant="primary" onClick={handleSubmit} disabled={saving || !title.trim()}>
          {saving ? "Saving…" : existing ? "Save changes" : "Add item"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger-text">{error}</span> : null}
    </label>
  );
}
