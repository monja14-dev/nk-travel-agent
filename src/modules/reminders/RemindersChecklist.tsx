import { useEffect, useState } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import { listRemindersForTrip, createReminder, updateReminder, deleteReminder } from "../../db/repositories/remindersRepo";
import { ValidationError } from "../../lib/errors";
import type { ReminderInput } from "./validation";
import type { Trip, Reminder } from "../../db/schema";
import type { View } from "../../navigation/types";

export default function RemindersChecklist({ tripId, onNavigate }: { tripId: string; onNavigate: (view: View) => void }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [section, setSection] = useState("");
  const [label, setLabel] = useState("");
  const [remarks, setRemarks] = useState("");
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
      setReminders(await listRemindersForTrip(tripId));
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
    const input: ReminderInput = { section, label, remarks: remarks || undefined, checked: false };
    try {
      await createReminder(tripId, input);
      setLabel("");
      setRemarks("");
      await reload();
    } catch (err) {
      if (err instanceof ValidationError) setFieldErrors(err.fieldErrors);
      else setFieldErrors({ _general: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(r: Reminder) {
    await updateReminder(r.id, { checked: !r.checked }, r.revision);
    await reload();
  }

  async function handleDelete(id: string) {
    await deleteReminder(id);
    await reload();
  }

  if (loadState === "loading") return <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8 text-ink-muted text-sm">Loading reminders…</div>;
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
        <p className="text-danger-text text-sm">Couldn't load reminders: {loadError}</p>
      </div>
    );
  }

  const bySection = new Map<string, Reminder[]>();
  for (const r of reminders) {
    const list = bySection.get(r.section) ?? [];
    list.push(r);
    bySection.set(r.section, list);
  }

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <button type="button" onClick={() => onNavigate({ name: "trip-details", tripId })} className="text-sm text-ink-muted underline mb-4">
        ← Back to {trip.name}
      </button>
      <h1 className="text-xl font-semibold text-ink mb-1">Reminders</h1>
      <p className="text-sm text-ink-muted mb-6">Checklist items grouped by section — things to bring, book, or do.</p>

      {bySection.size === 0 ? (
        <p className="text-sm text-ink-faint italic mb-6">No reminders yet.</p>
      ) : (
        Array.from(bySection.entries()).map(([sectionName, items]) => (
          <div key={sectionName} className="mb-4">
            <h2 className="text-sm font-semibold text-ink mb-2">{sectionName}</h2>
            <div className="divide-y divide-navy-border rounded-lg border border-navy-border bg-navy-surface">
              {items.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm gap-2">
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input type="checkbox" checked={r.checked} onChange={() => handleToggle(r)} className="h-4 w-4 rounded border-navy-border accent-[#D5B67B]" aria-label={`Done: ${r.label}`} />
                    <span className={r.checked ? "line-through text-ink-faint" : "text-ink"}>{r.label}</span>
                    {r.remarks ? <span className="text-xs text-ink-faint">({r.remarks})</span> : null}
                  </label>
                  <button type="button" onClick={() => handleDelete(r.id)} className="text-xs font-medium text-danger-text underline shrink-0">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="rounded-lg border border-navy-border bg-navy-surface p-4 mt-6">
        <h2 className="text-sm font-semibold text-ink mb-3">Add a reminder</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <label className="block">
            <span className="block text-xs text-ink-muted mb-0.5">Section</span>
            <input value={section} onChange={(e) => setSection(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
            {fieldErrors.section ? <span className="text-xs text-danger-text">{fieldErrors.section}</span> : null}
          </label>
          <label className="block">
            <span className="block text-xs text-ink-muted mb-0.5">Label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
            {fieldErrors.label ? <span className="text-xs text-danger-text">{fieldErrors.label}</span> : null}
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs text-ink-muted mb-0.5">Remarks (optional)</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full rounded-lg border border-navy-border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 px-2.5 py-1.5 text-sm" />
          </label>
        </div>
        {fieldErrors._general ? <p className="text-xs text-danger-text mb-2">{fieldErrors._general}</p> : null}
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !section.trim() || !label.trim()}
          className="px-3 py-1.5 rounded-md bg-accent text-navy-bg text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add reminder"}
        </button>
      </div>
    </div>
  );
}
