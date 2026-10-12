import { describe, it, expect } from "vitest";
import { validateTripInput, hasErrors, type TripInput } from "../validation";

function validInput(overrides: Partial<TripInput> = {}): TripInput {
  return {
    name: "Boracay Honeymoon",
    destination: "Boracay",
    country: "Philippines",
    startDate: "2027-02-10",
    endDate: "2027-02-13",
    travelerCount: 2,
    ...overrides,
  };
}

describe("validateTripInput", () => {
  it("accepts a fully valid trip", () => {
    const errors = validateTripInput(validInput());
    expect(hasErrors(errors)).toBe(false);
  });

  it("requires a non-blank name", () => {
    expect(validateTripInput(validInput({ name: "  " })).name).toBeDefined();
  });

  it("requires destination and country", () => {
    const errors = validateTripInput(validInput({ destination: "", country: "" }));
    expect(errors.destination).toBeDefined();
    expect(errors.country).toBeDefined();
  });

  it("rejects an end date before the start date", () => {
    const errors = validateTripInput(
      validInput({ startDate: "2027-02-13", endDate: "2027-02-10" }),
    );
    expect(errors.endDate).toBeDefined();
  });

  it("accepts a same-day trip (start === end)", () => {
    const errors = validateTripInput(validInput({ startDate: "2027-02-10", endDate: "2027-02-10" }));
    expect(hasErrors(errors)).toBe(false);
  });

  it("rejects a malformed date string", () => {
    expect(validateTripInput(validInput({ startDate: "next week" })).startDate).toBeDefined();
  });

  it("rejects a traveler count below 1 or non-integer", () => {
    expect(validateTripInput(validInput({ travelerCount: 0 })).travelerCount).toBeDefined();
    expect(validateTripInput(validInput({ travelerCount: 1.5 })).travelerCount).toBeDefined();
  });

  it("rejects an invalid room count but allows it to be omitted", () => {
    expect(validateTripInput(validInput({ roomCount: 0 })).roomCount).toBeDefined();
    expect(hasErrors(validateTripInput(validInput()))).toBe(false); // no roomCount at all
  });
});
