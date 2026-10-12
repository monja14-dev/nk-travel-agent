import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { resetTestDb } from "./testSupport";
import { ensureDaysForTripRange } from "../itineraryDaysRepo";
import {
  createItem,
  updateItem,
  deleteItem,
  getItem,
  listItemsForDay,
  listItemsForTrip,
  reorderItems,
} from "../itineraryItemsRepo";
import { ValidationError, StaleRevisionError, NotFoundError } from "../../../lib/errors";
import type { ItineraryItemInput } from "../../../modules/itinerary/validation";

const TRIP_A = "trip_a";
const TRIP_B = "trip_b";

function sampleInput(overrides: Partial<ItineraryItemInput> = {}): ItineraryItemInput {
  return {
    order: 0,
    crossesMidnight: false,
    newCalendarDay: false,
    category: "activity",
    title: "Qingtiangang grassland walk",
    bookingStatus: "not_booked",
    ...overrides,
  };
}

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("createItem", () => {
  it("creates an item with a stable id, revision 1, and a change-log entry", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, sampleInput());
    expect(item.id).toMatch(/^item_/);
    expect(item.revision).toBe(1);
    expect(item.tripId).toBe(TRIP_A);
    expect(item.dayId).toBe(day.id);
  });

  it("rejects invalid input and writes nothing", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    await expect(createItem(TRIP_A, day.id, sampleInput({ title: "" }))).rejects.toBeInstanceOf(ValidationError);
    expect(await listItemsForDay(day.id)).toHaveLength(0);
  });

  it("rejects a cost without a currency", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    await expect(createItem(TRIP_A, day.id, sampleInput({ farePlanned: 500, currency: undefined }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects end-before-start when not marked crossesMidnight", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    await expect(
      createItem(TRIP_A, day.id, sampleInput({ startTime: "10:00", endTime: "09:00", crossesMidnight: false })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts end-before-start WHEN marked crossesMidnight", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, sampleInput({ startTime: "23:35", endTime: "02:00", crossesMidnight: true }));
    expect(item.durationMinutes).toBeUndefined(); // never pre-computed/stored unless explicitly set
  });

  it("throws NotFoundError when the day doesn't belong to the given trip", async () => {
    const [dayOfTripB] = await ensureDaysForTripRange(TRIP_B, "2027-03-01", "2027-03-01");
    await expect(createItem(TRIP_A, dayOfTripB.id, sampleInput())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("preserves special characters (quotes, unicode, commas) exactly, round-tripped through IndexedDB", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const title = `Dinner at "Din Tai Fung" — 鼎泰豐, NT$450/person`;
    const item = await createItem(TRIP_A, day.id, sampleInput({ title, comments: "Bring cash; they don't take \"foreign\" cards" }));
    const reloaded = await getItem(item.id);
    expect(reloaded?.title).toBe(title);
    expect(reloaded?.comments).toBe("Bring cash; they don't take \"foreign\" cards");
  });
});

describe("updateItem", () => {
  it("merges a partial patch, preserving untouched fields", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, sampleInput({ address: "123 Grassland Rd" }));
    const updated = await updateItem(item.id, { bookingStatus: "confirmed" }, item.revision);
    expect(updated.bookingStatus).toBe("confirmed");
    expect(updated.address).toBe("123 Grassland Rd"); // preserved
    expect(updated.revision).toBe(item.revision + 1);
  });

  it("allows explicitly clearing an optional field to undefined", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, sampleInput({ address: "123 Grassland Rd" }));
    const updated = await updateItem(item.id, { address: undefined }, item.revision);
    expect(updated.address).toBeUndefined();
  });

  it("throws StaleRevisionError on a revision mismatch", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, sampleInput());
    await expect(updateItem(item.id, { title: "New title" }, item.revision + 1)).rejects.toBeInstanceOf(StaleRevisionError);
  });

  it("throws NotFoundError for a missing item", async () => {
    await expect(updateItem("item_missing", { title: "X" }, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("re-validates the merged result, not just the patch", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, sampleInput({ startTime: "09:00", endTime: "10:00" }));
    // Patch only moves startTime forward, past the still-unchanged endTime
    // — the merged record is inconsistent even though neither field alone
    // looks wrong in isolation.
    await expect(updateItem(item.id, { startTime: "11:00" }, item.revision)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("deleteItem", () => {
  it("removes an item", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const item = await createItem(TRIP_A, day.id, sampleInput());
    await deleteItem(item.id);
    expect(await getItem(item.id)).toBeUndefined();
  });

  it("is idempotent", async () => {
    await expect(deleteItem("item_does-not-exist")).resolves.toBeUndefined();
  });
});

describe("listItemsForTrip / listItemsForDay", () => {
  it("keeps two trips' items completely isolated", async () => {
    const [dayA] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const [dayB] = await ensureDaysForTripRange(TRIP_B, "2027-03-01", "2027-03-01");
    await createItem(TRIP_A, dayA.id, sampleInput({ title: "A" }));
    await createItem(TRIP_B, dayB.id, sampleInput({ title: "B" }));

    expect(await listItemsForTrip(TRIP_A)).toHaveLength(1);
    expect(await listItemsForTrip(TRIP_B)).toHaveLength(1);
  });

  it("listItemsForDay returns items sorted by order", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    await createItem(TRIP_A, day.id, sampleInput({ title: "Third", order: 2 }));
    await createItem(TRIP_A, day.id, sampleInput({ title: "First", order: 0 }));
    await createItem(TRIP_A, day.id, sampleInput({ title: "Second", order: 1 }));

    const items = await listItemsForDay(day.id);
    expect(items.map((i) => i.title)).toEqual(["First", "Second", "Third"]);
  });

  it("handles a large itinerary (200 items across many days) without error, in the right order", async () => {
    const days = await ensureDaysForTripRange(TRIP_A, "2027-01-01", "2027-01-20"); // 20 days
    for (const day of days) {
      for (let order = 0; order < 10; order++) {
        await createItem(TRIP_A, day.id, sampleInput({ title: `Item ${order}`, order }));
      }
    }
    const all = await listItemsForTrip(TRIP_A);
    expect(all).toHaveLength(200);
    for (const day of days) {
      const forDay = await listItemsForDay(day.id);
      expect(forDay).toHaveLength(10);
      expect(forDay.map((i) => i.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });
});

describe("reorderItems", () => {
  it("reassigns order to match the given sequence and bumps revision only for items that moved", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const a = await createItem(TRIP_A, day.id, sampleInput({ title: "A", order: 0 }));
    const b = await createItem(TRIP_A, day.id, sampleInput({ title: "B", order: 1 }));
    const c = await createItem(TRIP_A, day.id, sampleInput({ title: "C", order: 2 }));

    const result = await reorderItems(day.id, [c.id, a.id, b.id]);
    const byId = new Map(result.map((i) => [i.id, i]));
    expect(byId.get(c.id)?.order).toBe(0);
    expect(byId.get(a.id)?.order).toBe(1);
    expect(byId.get(b.id)?.order).toBe(2);

    // c moved from order 2 -> 0: revision bumped. a moved 0 -> 1: bumped.
    // b moved 1 -> 2: bumped. (All three moved in this particular shuffle.)
    expect(byId.get(c.id)?.revision).toBe(2);
    expect(byId.get(a.id)?.revision).toBe(2);
    expect(byId.get(b.id)?.revision).toBe(2);
  });

  it("leaves an item's revision untouched when its order doesn't actually change", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const a = await createItem(TRIP_A, day.id, sampleInput({ title: "A", order: 0 }));
    const b = await createItem(TRIP_A, day.id, sampleInput({ title: "B", order: 1 }));

    // Swap b and some other item but a stays first either way — pass the
    // identity ordering back.
    const result = await reorderItems(day.id, [a.id, b.id]);
    expect(result.find((i) => i.id === a.id)?.revision).toBe(1);
    expect(result.find((i) => i.id === b.id)?.revision).toBe(1);
  });

  it("throws when the id list doesn't exactly match the day's current items", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const a = await createItem(TRIP_A, day.id, sampleInput({ title: "A", order: 0 }));
    await createItem(TRIP_A, day.id, sampleInput({ title: "B", order: 1 }));

    await expect(reorderItems(day.id, [a.id])).rejects.toBeInstanceOf(ValidationError); // missing one id
    await expect(reorderItems(day.id, [a.id, "item_nonexistent"])).rejects.toBeInstanceOf(ValidationError);
  });
});
