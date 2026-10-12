import { describe, it, expect, beforeEach } from "vitest";
import { initDb } from "../../client";
import { resetTestDb } from "./testSupport";
import { ensureDaysForTripRange, listDaysForTrip, getDay, updateDay } from "../itineraryDaysRepo";
import { StaleRevisionError, NotFoundError, ValidationError } from "../../../lib/errors";

const TRIP_A = "trip_a";
const TRIP_B = "trip_b";

beforeEach(async () => {
  await initDb();
  await resetTestDb();
});

describe("ensureDaysForTripRange", () => {
  it("creates one day per calendar date in the inclusive range", async () => {
    const days = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-12");
    expect(days.map((d) => d.date)).toEqual(["2027-02-10", "2027-02-11", "2027-02-12"]);
    expect(days.every((d) => d.tripId === TRIP_A)).toBe(true);
    expect(days.map((d) => d.dayLabel)).toEqual(["Day 1", "Day 2", "Day 3"]);
  });

  it("handles a single-day trip", async () => {
    const days = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    expect(days).toHaveLength(1);
  });

  it("is idempotent — calling it again leaves existing days completely untouched", async () => {
    const first = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-12");
    await updateDay(first[0].id, { dayLabel: "Arrival day" }, first[0].revision);

    const second = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-12");
    expect(second).toHaveLength(3);
    const relabeled = second.find((d) => d.date === "2027-02-10")!;
    expect(relabeled.dayLabel).toBe("Arrival day"); // not reset back to "Day 1"
    expect(relabeled.revision).toBe(2); // only bumped by the explicit updateDay, not by re-ensuring
  });

  it("extends a range without disturbing already-created days", async () => {
    await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-11");
    const extended = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-13");
    expect(extended.map((d) => d.date)).toEqual(["2027-02-10", "2027-02-11", "2027-02-12", "2027-02-13"]);
  });

  it("keeps two trips' days completely isolated", async () => {
    await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-11");
    await ensureDaysForTripRange(TRIP_B, "2027-03-01", "2027-03-01");
    expect(await listDaysForTrip(TRIP_A)).toHaveLength(2);
    expect(await listDaysForTrip(TRIP_B)).toHaveLength(1);
  });
});

describe("listDaysForTrip", () => {
  it("returns days sorted by date", async () => {
    await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-12");
    const days = await listDaysForTrip(TRIP_A);
    expect(days.map((d) => d.date)).toEqual(["2027-02-10", "2027-02-11", "2027-02-12"]);
  });

  it("returns an empty array for a trip with no days yet", async () => {
    expect(await listDaysForTrip("no-such-trip")).toEqual([]);
  });
});

describe("updateDay", () => {
  it("updates dayLabel/summary/remarks and bumps the revision", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    const updated = await updateDay(day.id, { summary: "Arrival + check-in", remarks: "Grab SIM card at airport" }, day.revision);
    expect(updated.summary).toBe("Arrival + check-in");
    expect(updated.remarks).toBe("Grab SIM card at airport");
    expect(updated.revision).toBe(day.revision + 1);
    expect(updated.date).toBe(day.date); // date itself is not patchable
  });

  it("throws StaleRevisionError on a revision mismatch", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    await expect(updateDay(day.id, { dayLabel: "X" }, day.revision + 1)).rejects.toBeInstanceOf(StaleRevisionError);
  });

  it("throws NotFoundError for a missing day", async () => {
    await expect(updateDay("day_does-not-exist", { dayLabel: "X" }, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an empty dayLabel", async () => {
    const [day] = await ensureDaysForTripRange(TRIP_A, "2027-02-10", "2027-02-10");
    await expect(updateDay(day.id, { dayLabel: "   " }, day.revision)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("getDay", () => {
  it("returns undefined for a missing id", async () => {
    expect(await getDay("day_missing")).toBeUndefined();
  });
});
