import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../client";
import { exportBackup, restoreBackup } from "../backup";
import { createTrip } from "../repositories/tripsRepo";
import { ensureDaysForTripRange } from "../repositories/itineraryDaysRepo";
import { createItem, listItemsForTrip } from "../repositories/itineraryItemsRepo";
import { createExpense, listExpensesForTrip } from "../repositories/expensesRepo";
import { createBooking, listBookingsForTrip } from "../repositories/bookingsRepo";
import { createReminder, listRemindersForTrip } from "../repositories/remindersRepo";
import { listDaysForTrip } from "../repositories/itineraryDaysRepo";
import { resetTestDb } from "../repositories/__tests__/testSupport";

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("backup — Phase 5 stores round-trip with real data", () => {
  it("restores populated itinerary days/items, expenses, bookings, and reminders byte-for-byte", async () => {
    const trip = await createTrip({
      name: "Taiwan Trip",
      destination: "Taipei",
      country: "Taiwan",
      startDate: "2027-02-10",
      endDate: "2027-02-11",
      travelerCount: 2,
    });
    const [day1, day2] = await ensureDaysForTripRange(trip.id, trip.startDate, trip.endDate);
    const item = await createItem(trip.id, day1.id, {
      order: 0,
      startTime: "09:00",
      endTime: "11:00",
      crossesMidnight: false,
      newCalendarDay: false,
      category: "activity",
      title: "Qingtiangang grassland",
      bookingStatus: "confirmed",
      farePlanned: 100,
      currency: "TWD",
    });
    const expense = await createExpense(trip.id, {
      kind: "variable",
      category: "food",
      label: "Dinner",
      plannedAmount: 500,
      currency: "TWD",
    });
    const booking = await createBooking(trip.id, {
      type: "flight",
      provider: "Cebu Pacific",
      status: "confirmed",
    });
    const reminder = await createReminder(trip.id, {
      section: "Important things to bring",
      label: "Passport",
      checked: false,
    });

    const backup = await exportBackup();
    expect(backup.data.itineraryDays).toHaveLength(2);
    expect(backup.data.itineraryItems).toHaveLength(1);
    expect(backup.data.expenses).toHaveLength(1);
    expect(backup.data.bookings).toHaveLength(1);
    expect(backup.data.reminders).toHaveLength(1);
    // Every create also wrote a changeLog entry — confirms the log isn't
    // silently skipped for any of these Phase 5 stores either.
    expect(backup.data.changeLog?.length ?? 0).toBeGreaterThanOrEqual(5);

    await resetTestDb();
    expect(await listDaysForTrip(trip.id)).toHaveLength(0);

    await restoreBackup(backup);

    const restoredDays = await listDaysForTrip(trip.id);
    expect(restoredDays).toHaveLength(2);
    expect(restoredDays.map((d) => d.id).sort()).toEqual([day1.id, day2.id].sort());

    const restoredItems = await listItemsForTrip(trip.id);
    expect(restoredItems).toEqual([item]);

    expect(await listExpensesForTrip(trip.id)).toEqual([expense]);
    expect(await listBookingsForTrip(trip.id)).toEqual([booking]);
    expect(await listRemindersForTrip(trip.id)).toEqual([reminder]);
  });
});
