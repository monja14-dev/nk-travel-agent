import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { resetTestDb } from "./testSupport";
import { createReminder, updateReminder, deleteReminder, listRemindersForTrip } from "../remindersRepo";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../../lib/errors";
import type { ReminderInput } from "../../../modules/reminders/validation";

const TRIP_A = "trip_a";

function sampleInput(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return { section: "Important things to bring", label: "Passport", checked: false, ...overrides };
}

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("remindersRepo", () => {
  it("creates a reminder with revision 1", async () => {
    const reminder = await createReminder(TRIP_A, sampleInput());
    expect(reminder.id).toMatch(/^reminder_/);
    expect(reminder.revision).toBe(1);
    expect(reminder.checked).toBe(false);
  });

  it("rejects an empty label or section", async () => {
    await expect(createReminder(TRIP_A, sampleInput({ label: "" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createReminder(TRIP_A, sampleInput({ section: "" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("toggles checked and bumps revision", async () => {
    const reminder = await createReminder(TRIP_A, sampleInput());
    const updated = await updateReminder(reminder.id, { checked: true }, reminder.revision);
    expect(updated.checked).toBe(true);
    expect(updated.revision).toBe(2);
  });

  it("throws StaleRevisionError on a revision mismatch", async () => {
    const reminder = await createReminder(TRIP_A, sampleInput());
    await expect(updateReminder(reminder.id, { checked: true }, reminder.revision + 1)).rejects.toBeInstanceOf(StaleRevisionError);
  });

  it("throws NotFoundError for a missing reminder", async () => {
    await expect(updateReminder("reminder_missing", {}, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes idempotently", async () => {
    const reminder = await createReminder(TRIP_A, sampleInput());
    await deleteReminder(reminder.id);
    await expect(deleteReminder(reminder.id)).resolves.toBeUndefined();
    expect(await listRemindersForTrip(TRIP_A)).toHaveLength(0);
  });
});
