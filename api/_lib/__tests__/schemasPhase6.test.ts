import { describe, it, expect } from "vitest";
import { parseProviderOutput } from "../schemas";

/**
 * Phase 6 audit finding: pickTypedChanges() already computes which of a
 * proposal's `changes` fields it silently dropped — an unrecognized key,
 * or a recognized key whose value is the wrong runtime type (e.g. the
 * model sending `travelerCount: "3"`, a string, instead of a number).
 * Its own doc comment says "the drop itself is reported by the caller,
 * not here" — but every call site in parseProposal() destructured only
 * `{ changes }`, discarding `droppedKeys` entirely, so a proposal with
 * one bad field still came back as a normal, fully-approvable proposal
 * with no warning that part of what the model asked to change was never
 * actually included. These tests confirm the fix: a surviving proposal
 * with any dropped field now also produces a warning naming it.
 */
describe("parseProviderOutput — dropped change fields are reported (Phase 6)", () => {
  it("warns when a trip-update proposal has one well-typed field and one wrong-typed field, but still returns the proposal", () => {
    const raw = JSON.stringify({
      reply: "Updating the trip.",
      proposals: [
        {
          kind: "trip-update",
          tripId: "trip_abc",
          expectedRevision: 3,
          // travelerCount should be a number — sent as a string by mistake.
          changes: { destination: "Palawan", travelerCount: "3" },
          rationale: "Switching destinations.",
        },
      ],
    });

    const result = parseProviderOutput(raw);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      kind: "trip-update",
      changes: { destination: "Palawan" },
    });
    // travelerCount must NOT have silently survived with the wrong type.
    expect((result.proposals[0] as { changes: Record<string, unknown> }).changes.travelerCount).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("travelerCount"))).toBe(true);
  });

  it("warns when a trip-override-upsert proposal includes an unrecognized field name", () => {
    const raw = JSON.stringify({
      reply: "Here's a budget suggestion.",
      proposals: [
        {
          kind: "trip-override-upsert",
          tripId: "trip_abc",
          expectedRevision: null,
          changes: { budgetTargetMin: 40000, notARealField: "oops" },
          rationale: "y",
        },
      ],
    });

    const result = parseProviderOutput(raw);
    expect(result.proposals).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("notARealField"))).toBe(true);
  });

  it("warns when an itinerary-item-upsert proposal has a wrong-typed boolean field", () => {
    const raw = JSON.stringify({
      reply: "Adjusting the item.",
      proposals: [
        {
          kind: "itinerary-item-upsert",
          tripId: "trip_abc",
          dayId: "day_1",
          itemId: "item_1",
          expectedRevision: 2,
          // crossesMidnight should be boolean — sent as a string.
          changes: { bookingStatus: "confirmed", crossesMidnight: "true" },
          rationale: "y",
        },
      ],
    });

    const result = parseProviderOutput(raw);
    expect(result.proposals).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("crossesMidnight"))).toBe(true);
  });

  it("does not warn at all when every change field is recognized and well-typed", () => {
    const raw = JSON.stringify({
      reply: "Clean update.",
      proposals: [
        {
          kind: "trip-update",
          tripId: "trip_abc",
          expectedRevision: 3,
          changes: { destination: "Palawan" },
          rationale: "y",
        },
      ],
    });

    const result = parseProviderOutput(raw);
    expect(result.warnings).toEqual([]);
  });
});
