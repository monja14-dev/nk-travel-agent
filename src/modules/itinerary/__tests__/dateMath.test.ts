import { describe, it, expect } from "vitest";
import {
  parseTimeToMinutes,
  isValidTimeString,
  computeDurationMinutes,
  isTimeRangeConsistent,
  formatDurationMinutes,
} from "../dateMath";

describe("parseTimeToMinutes / isValidTimeString", () => {
  it("parses well-formed 24h times", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("09:05")).toBe(545);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("rejects malformed or out-of-range times", () => {
    for (const bad of ["24:00", "9:05", "09:5", "9:5", "", "noon", "12:60", "-1:00", "012:00"]) {
      expect(parseTimeToMinutes(bad), bad).toBeUndefined();
      expect(isValidTimeString(bad), bad).toBe(false);
    }
  });

  it("accepts every valid hour and minute boundary", () => {
    expect(isValidTimeString("23:00")).toBe(true);
    expect(isValidTimeString("00:59")).toBe(true);
  });
});

describe("computeDurationMinutes", () => {
  it("returns undefined when either time is missing — never invents", () => {
    expect(computeDurationMinutes(undefined, "10:00", false)).toBeUndefined();
    expect(computeDurationMinutes("09:00", undefined, false)).toBeUndefined();
    expect(computeDurationMinutes(undefined, undefined, false)).toBeUndefined();
  });

  it("computes a same-day duration normally", () => {
    expect(computeDurationMinutes("09:00", "10:30", false)).toBe(90);
    expect(computeDurationMinutes("00:00", "00:00", false)).toBe(0);
  });

  it("computes an overnight duration when crossesMidnight is true", () => {
    // 23:35 -> 02:00 the next day = 25 minutes to midnight + 120 minutes = 145
    expect(computeDurationMinutes("23:35", "02:00", true)).toBe(145);
    // The real Taiwan baseline's "Preparation for rest" block: 23:01-23:59
    expect(computeDurationMinutes("23:01", "23:59", false)).toBe(58);
  });

  it("returns undefined for an end-before-start pair NOT marked crossesMidnight — a data inconsistency, not a rollover", () => {
    expect(computeDurationMinutes("10:00", "09:00", false)).toBeUndefined();
  });

  it("trusts crossesMidnight as-is even when end > start by clock value", () => {
    // Pathological but the flag is authoritative, not inferred — a full
    // 24h + (end-start) is still a well-defined (if unusual) answer.
    expect(computeDurationMinutes("08:00", "09:00", true)).toBe(24 * 60 - 8 * 60 + 9 * 60);
  });
});

describe("isTimeRangeConsistent", () => {
  it("is true when either time is absent — nothing to check yet", () => {
    expect(isTimeRangeConsistent(undefined, "10:00", false)).toBe(true);
    expect(isTimeRangeConsistent("09:00", undefined, false)).toBe(true);
  });

  it("is false exactly for end-before-start without crossesMidnight", () => {
    expect(isTimeRangeConsistent("10:00", "09:00", false)).toBe(false);
    expect(isTimeRangeConsistent("10:00", "09:00", true)).toBe(true);
  });

  it("is true for a normal same-day range", () => {
    expect(isTimeRangeConsistent("09:00", "17:00", false)).toBe(true);
  });
});

describe("formatDurationMinutes", () => {
  it("formats hours and minutes", () => {
    expect(formatDurationMinutes(0)).toBe("0m");
    expect(formatDurationMinutes(45)).toBe("45m");
    expect(formatDurationMinutes(60)).toBe("1h");
    expect(formatDurationMinutes(244)).toBe("4h 4m");
  });

  it("returns a placeholder for invalid input", () => {
    expect(formatDurationMinutes(-5)).toBe("—");
    expect(formatDurationMinutes(NaN)).toBe("—");
  });
});
