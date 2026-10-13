import { describe, it, expect } from "vitest";
import {
  validateAiChatRequestBody,
  parseProviderOutput,
  RequestValidationError,
  MalformedProviderOutputError,
  MAX_MESSAGE_LENGTH,
  MAX_HISTORY_TURNS,
  MAX_PROPOSALS_PER_RESPONSE,
} from "../schemas";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    tripId: "trip_abc",
    message: "What do you think of this hotel?",
    context: {
      trip: {
        id: "trip_abc",
        revision: 3,
        name: "Japan Trip",
        destination: "Tokyo",
        country: "Japan",
        startDate: "2027-02-22",
        endDate: "2027-02-26",
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

describe("validateAiChatRequestBody", () => {
  it("accepts a well-formed request and returns it with the message trimmed to the limit", () => {
    const result = validateAiChatRequestBody(validBody());
    expect(result.tripId).toBe("trip_abc");
    expect(result.context.trip.name).toBe("Japan Trip");
    expect(result.context.override).toBeNull();
  });

  it("accepts a request with an override present", () => {
    const body = validBody({
      context: {
        ...validBody().context,
        override: {
          revision: 2,
          currency: "PHP",
          mustHaveAmenities: ["pool"],
          hotelVsAirbnbOpen: true,
        },
      },
    });
    const result = validateAiChatRequestBody(body);
    expect(result.context.override).toEqual({
      revision: 2,
      currency: "PHP",
      mustHaveAmenities: ["pool"],
      hotelVsAirbnbOpen: true,
    });
  });

  it("rejects a non-object body", () => {
    expect(() => validateAiChatRequestBody(null)).toThrow(RequestValidationError);
    expect(() => validateAiChatRequestBody("hello")).toThrow(RequestValidationError);
  });

  it("rejects a missing tripId", () => {
    const body = validBody({ tripId: "" });
    try {
      validateAiChatRequestBody(body);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RequestValidationError);
      expect((err as RequestValidationError).fieldErrors.tripId).toBeDefined();
    }
  });

  it("rejects an over-long message", () => {
    const body = validBody({ message: "a".repeat(MAX_MESSAGE_LENGTH + 1) });
    expect(() => validateAiChatRequestBody(body)).toThrow(RequestValidationError);
  });

  it("rejects a request missing trip context fields", () => {
    const body = validBody({ context: { ...validBody().context, trip: { id: "trip_abc" } } });
    try {
      validateAiChatRequestBody(body);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RequestValidationError);
      const fieldErrors = (err as RequestValidationError).fieldErrors;
      expect(Object.keys(fieldErrors).some((k) => k.startsWith("context.trip."))).toBe(true);
    }
  });

  it("truncates history to the most recent MAX_HISTORY_TURNS entries", () => {
    const longHistory = Array.from({ length: MAX_HISTORY_TURNS + 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const result = validateAiChatRequestBody(validBody({ history: longHistory }));
    expect(result.history).toHaveLength(MAX_HISTORY_TURNS);
    // Most recent kept, not the oldest.
    expect(result.history[result.history.length - 1].content).toBe(`turn ${longHistory.length - 1}`);
  });

  it("rejects a history entry with an invalid role", () => {
    const body = validBody({ history: [{ role: "system", content: "x" }] });
    expect(() => validateAiChatRequestBody(body)).toThrow(RequestValidationError);
  });
});

describe("parseProviderOutput — valid responses", () => {
  it("parses a reply with no proposals", () => {
    const result = parseProviderOutput(JSON.stringify({ reply: "Sure, here's my take.", proposals: [] }));
    expect(result.reply).toBe("Sure, here's my take.");
    expect(result.proposals).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("parses a reply with a valid trip-update proposal", () => {
    const raw = JSON.stringify({
      reply: "I'd suggest extending the trip by a day.",
      proposals: [
        {
          kind: "trip-update",
          tripId: "trip_abc",
          expectedRevision: 3,
          changes: { endDate: "2027-02-27" },
          rationale: "An extra day gives more buffer for the Tokyo day trips.",
        },
      ],
    });
    const result = parseProviderOutput(raw);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ kind: "trip-update", tripId: "trip_abc", expectedRevision: 3 });
    expect(result.warnings).toEqual([]);
  });

  it("parses a reply with a valid trip-override-upsert proposal, including a null expectedRevision", () => {
    const raw = JSON.stringify({
      reply: "Here's a suggested budget range.",
      proposals: [
        {
          kind: "trip-override-upsert",
          tripId: "trip_abc",
          expectedRevision: null,
          changes: { budgetTargetMin: 40000, budgetTargetMax: 60000, mustHaveAmenities: ["pool"] },
          rationale: "Matches what you mentioned wanting to spend.",
        },
      ],
    });
    const result = parseProviderOutput(raw);
    expect(result.proposals[0]).toMatchObject({ kind: "trip-override-upsert", expectedRevision: null });
  });

  it("strips a markdown code fence around the JSON defensively", () => {
    const raw = "```json\n" + JSON.stringify({ reply: "hi", proposals: [] }) + "\n```";
    const result = parseProviderOutput(raw);
    expect(result.reply).toBe("hi");
  });
});

describe("parseProviderOutput — malformed output", () => {
  it("throws MalformedProviderOutputError for non-JSON text", () => {
    expect(() => parseProviderOutput("I think you should book the hotel!")).toThrow(MalformedProviderOutputError);
  });

  it("throws MalformedProviderOutputError when reply is missing", () => {
    expect(() => parseProviderOutput(JSON.stringify({ proposals: [] }))).toThrow(MalformedProviderOutputError);
  });

  it("throws MalformedProviderOutputError when the JSON is an array, not an object", () => {
    expect(() => parseProviderOutput(JSON.stringify(["reply"]))).toThrow(MalformedProviderOutputError);
  });

  it("drops an individual malformed proposal and reports it as a warning, without discarding the reply", () => {
    const raw = JSON.stringify({
      reply: "Here's what I found.",
      proposals: [
        { kind: "trip-update", tripId: "trip_abc", changes: { name: "x" }, rationale: "y" }, // missing expectedRevision
        { kind: "trip-update", tripId: "trip_abc", expectedRevision: 3, changes: {}, rationale: "y" }, // empty changes
        { kind: "something-unsupported", tripId: "trip_abc" },
      ],
    });
    const result = parseProviderOutput(raw);
    expect(result.reply).toBe("Here's what I found.");
    expect(result.proposals).toEqual([]);
    expect(result.warnings).toHaveLength(3);
  });

  it("caps proposals at MAX_PROPOSALS_PER_RESPONSE and warns about the rest", () => {
    const proposals = Array.from({ length: MAX_PROPOSALS_PER_RESPONSE + 3 }, (_, i) => ({
      kind: "trip-update",
      tripId: "trip_abc",
      expectedRevision: 1,
      changes: { notes: `note ${i}` },
      rationale: "why",
    }));
    const result = parseProviderOutput(JSON.stringify({ reply: "many ideas", proposals }));
    expect(result.proposals).toHaveLength(MAX_PROPOSALS_PER_RESPONSE);
    expect(result.warnings.some((w) => w.includes("dropped"))).toBe(true);
  });

  it("drops unrecognized fields within a valid proposal's changes rather than failing it", () => {
    const raw = JSON.stringify({
      reply: "ok",
      proposals: [
        {
          kind: "trip-update",
          tripId: "trip_abc",
          expectedRevision: 1,
          changes: { name: "New name", someUnknownField: "nope" },
          rationale: "why",
        },
      ],
    });
    const result = parseProviderOutput(raw);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].changes).toEqual({ name: "New name" });
  });
});

describe("webSearch flag and narration tolerance (Phase 8)", () => {
  it("defaults webSearch to false when omitted", () => {
    expect(validateAiChatRequestBody(validBody()).webSearch).toBe(false);
  });

  it("passes webSearch: true through", () => {
    expect(validateAiChatRequestBody(validBody({ webSearch: true })).webSearch).toBe(true);
  });

  it("rejects a non-boolean webSearch", () => {
    expect(() => validateAiChatRequestBody(validBody({ webSearch: "yes" }))).toThrow(RequestValidationError);
  });

  it("parses the JSON object even when a sentence of narration precedes it", () => {
    const parsed = parseProviderOutput('Here you go. {"reply":"Found two hotels.","proposals":[]}');
    expect(parsed.reply).toBe("Found two hotels.");
  });

  it("still rejects text with no JSON object in it at all", () => {
    expect(() => parseProviderOutput("Sure! I'd book the hotel near Shinjuku.")).toThrow();
  });
});
