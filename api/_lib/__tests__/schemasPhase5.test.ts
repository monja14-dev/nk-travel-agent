import { describe, it, expect } from "vitest";
import { validateAiChatRequestBody, parseProviderOutput, RequestValidationError } from "../schemas";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    tripId: "trip_abc",
    message: "Can you suggest an afternoon activity for day 2?",
    context: {
      trip: {
        id: "trip_abc",
        revision: 3,
        name: "Taiwan Trip",
        destination: "Taipei",
        country: "Taiwan",
        startDate: "2027-02-10",
        endDate: "2027-02-12",
        travelerCount: 2,
        status: "planning",
      },
      profile: {
        revision: 1,
        priorityOrder: ["experience", "value"],
        accommodationPreferences: "Clean and comfortable.",
        foodPreferences: "Authentic local food.",
        pace: "comfortable",
      },
      override: null,
    },
    history: [],
    ...overrides,
  };
}

describe("validateAiChatRequestBody — itinerary context (Phase 5)", () => {
  it("defaults itinerary to [] when the field is absent — older/simpler callers still work", () => {
    const result = validateAiChatRequestBody(validBody());
    expect(result.context.itinerary).toEqual([]);
  });

  it("accepts a well-formed itinerary context with days and items", () => {
    const body = validBody({
      context: {
        ...validBody().context,
        itinerary: [
          {
            dayId: "day_1",
            date: "2027-02-10",
            dayLabel: "Day 1",
            items: [
              { itemId: "item_1", revision: 2, order: 0, startTime: "09:00", endTime: "11:00", category: "activity", title: "Grassland walk", bookingStatus: "not_booked" },
            ],
          },
          { dayId: "day_2", date: "2027-02-11", dayLabel: "Day 2", items: [] },
        ],
      },
    });
    const result = validateAiChatRequestBody(body);
    expect(result.context.itinerary).toHaveLength(2);
    expect(result.context.itinerary[0].items[0]).toMatchObject({ itemId: "item_1", revision: 2, title: "Grassland walk" });
  });

  it("rejects itinerary context that isn't an array", () => {
    const body = validBody({ context: { ...validBody().context, itinerary: "nope" } });
    expect(() => validateAiChatRequestBody(body)).toThrow(RequestValidationError);
  });

  it("rejects a day entry missing required fields", () => {
    const body = validBody({ context: { ...validBody().context, itinerary: [{ dayId: "day_1" }] } });
    try {
      validateAiChatRequestBody(body);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RequestValidationError);
      const fieldErrors = (err as RequestValidationError).fieldErrors;
      expect(Object.keys(fieldErrors).some((k) => k.startsWith("context.itinerary"))).toBe(true);
    }
  });

  it("rejects an item entry missing required fields", () => {
    const body = validBody({
      context: {
        ...validBody().context,
        itinerary: [{ dayId: "day_1", date: "2027-02-10", dayLabel: "Day 1", items: [{ itemId: "item_1" }] }],
      },
    });
    expect(() => validateAiChatRequestBody(body)).toThrow(RequestValidationError);
  });
});

describe("parseProviderOutput — itinerary-item-upsert proposal (Phase 5)", () => {
  function raw(proposal: Record<string, unknown>) {
    return JSON.stringify({ reply: "Here's an idea for day 2.", proposals: [proposal] });
  }

  it("parses a valid proposal creating a NEW item (itemId: null, expectedRevision: null)", () => {
    const result = parseProviderOutput(
      raw({
        kind: "itinerary-item-upsert",
        tripId: "trip_abc",
        dayId: "day_2",
        itemId: null,
        expectedRevision: null,
        changes: { title: "Visit Shilin Night Market", category: "food", startTime: "18:00", endTime: "20:00" },
        rationale: "Evening food market fits the relaxed pace you asked for.",
      }),
    );
    expect(result.warnings).toEqual([]);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      kind: "itinerary-item-upsert",
      dayId: "day_2",
      itemId: null,
      expectedRevision: null,
    });
  });

  it("parses a valid proposal updating an EXISTING item (itemId + numeric expectedRevision)", () => {
    const result = parseProviderOutput(
      raw({
        kind: "itinerary-item-upsert",
        tripId: "trip_abc",
        dayId: "day_2",
        itemId: "item_1",
        expectedRevision: 2,
        changes: { bookingStatus: "confirmed", farePlanned: 150, currency: "TWD" },
        rationale: "Marking this booked now that it's confirmed.",
      }),
    );
    expect(result.proposals[0]).toMatchObject({ kind: "itinerary-item-upsert", itemId: "item_1", expectedRevision: 2 });
  });

  it("drops a proposal mixing itemId: null with a non-null expectedRevision", () => {
    const result = parseProviderOutput(
      raw({
        kind: "itinerary-item-upsert",
        tripId: "trip_abc",
        dayId: "day_2",
        itemId: null,
        expectedRevision: 2,
        changes: { title: "X" },
        rationale: "y",
      }),
    );
    expect(result.proposals).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it("drops a proposal targeting an existing item with a null expectedRevision", () => {
    const result = parseProviderOutput(
      raw({
        kind: "itinerary-item-upsert",
        tripId: "trip_abc",
        dayId: "day_2",
        itemId: "item_1",
        expectedRevision: null,
        changes: { title: "X" },
        rationale: "y",
      }),
    );
    expect(result.proposals).toEqual([]);
  });

  it("drops a proposal missing dayId", () => {
    const result = parseProviderOutput(
      raw({ kind: "itinerary-item-upsert", tripId: "trip_abc", itemId: null, expectedRevision: null, changes: { title: "X" }, rationale: "y" }),
    );
    expect(result.proposals).toEqual([]);
  });

  it("drops unrecognized fields within changes rather than failing the whole proposal", () => {
    const result = parseProviderOutput(
      raw({
        kind: "itinerary-item-upsert",
        tripId: "trip_abc",
        dayId: "day_2",
        itemId: null,
        expectedRevision: null,
        changes: { title: "X", someMadeUpField: "nope" },
        rationale: "y",
      }),
    );
    expect(result.proposals[0].changes).toEqual({ title: "X" });
  });

  it("coerces number-typed fields correctly and rejects a wrong-typed value for a numeric field", () => {
    const result = parseProviderOutput(
      raw({
        kind: "itinerary-item-upsert",
        tripId: "trip_abc",
        dayId: "day_2",
        itemId: null,
        expectedRevision: null,
        changes: { title: "X", farePlanned: "not-a-number", travelTimeMinutes: 15 },
        rationale: "y",
      }),
    );
    expect(result.proposals[0].changes).toEqual({ title: "X", travelTimeMinutes: 15 }); // farePlanned dropped, travelTimeMinutes kept
  });
});
