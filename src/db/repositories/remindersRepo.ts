import { getReadyDb, withWriteTransaction } from "../client";
import type { Reminder } from "../schema";
import { generateId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../lib/errors";
import { validateReminderInput, hasErrors, type ReminderInput } from "../../modules/reminders/validation";
import { buildChangeLogEntry } from "./changeLogHelper";

export async function listRemindersForTrip(tripId: string): Promise<Reminder[]> {
  return getReadyDb().getAllFromIndex("reminders", "by-trip", tripId);
}

export async function createReminder(tripId: string, input: ReminderInput): Promise<Reminder> {
  const errors = validateReminderInput(input);
  if (hasErrors(errors)) throw new ValidationError(errors);

  const now = nowIso();
  const reminder: Reminder = {
    id: generateId("reminder"),
    tripId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    section: input.section.trim(),
    label: input.label.trim(),
    remarks: input.remarks?.trim() || undefined,
    checked: input.checked,
  };

  await withWriteTransaction(["reminders", "changeLog"], async (tx) => {
    await tx.objectStore("reminders").add(reminder);
    await tx
      .objectStore("changeLog")
      .add(buildChangeLogEntry({ tripId, entityType: "reminders", entityId: reminder.id, action: "create", after: reminder }));
  });
  return reminder;
}

export async function updateReminder(
  id: string,
  patch: Partial<ReminderInput>,
  expectedRevision: number,
): Promise<Reminder> {
  return withWriteTransaction(["reminders", "changeLog"], async (tx) => {
    const store = tx.objectStore("reminders");
    const existing = await store.get(id);
    if (!existing) throw new NotFoundError("Reminder", id);
    if (existing.revision !== expectedRevision) throw new StaleRevisionError("Reminder", id);

    const merged: ReminderInput = {
      section: patch.section ?? existing.section,
      label: patch.label ?? existing.label,
      remarks: "remarks" in patch ? patch.remarks : existing.remarks,
      checked: patch.checked ?? existing.checked,
    };
    const errors = validateReminderInput(merged);
    if (hasErrors(errors)) throw new ValidationError(errors);

    const updated: Reminder = {
      ...existing,
      section: merged.section.trim(),
      label: merged.label.trim(),
      remarks: merged.remarks?.trim() || undefined,
      checked: merged.checked,
      revision: existing.revision + 1,
      updatedAt: nowIso(),
    };
    await store.put(updated);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({
        tripId: existing.tripId,
        entityType: "reminders",
        entityId: id,
        action: "update",
        before: existing,
        after: updated,
      }),
    );
    return updated;
  });
}

export async function deleteReminder(id: string): Promise<void> {
  await withWriteTransaction(["reminders", "changeLog"], async (tx) => {
    const store = tx.objectStore("reminders");
    const existing = await store.get(id);
    if (!existing) return;
    await store.delete(id);
    await tx.objectStore("changeLog").add(
      buildChangeLogEntry({ tripId: existing.tripId, entityType: "reminders", entityId: id, action: "delete", before: existing }),
    );
  });
}
