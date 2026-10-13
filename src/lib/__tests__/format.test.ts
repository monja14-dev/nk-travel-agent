import { describe, expect, it } from "vitest";
import { daysBetween, daysInclusive, formatDateRange, formatMoney, parseISODate, todayISO } from "../format";

describe("parseISODate", () => {
  it("parses real dates and rejects malformed or overflowing ones", () => {
    expect(parseISODate("2027-02-22")?.toISOString()).toBe("2027-02-22T00:00:00.000Z");
    expect(parseISODate("2027-02-31")).toBeNull(); // would silently roll into March
    expect(parseISODate("2027-13-01")).toBeNull();
    expect(parseISODate("22/02/2027")).toBeNull();
    expect(parseISODate("")).toBeNull();
  });
});

describe("daysInclusive / daysBetween", () => {
  it("counts both endpoints", () => {
    expect(daysInclusive("2027-02-22", "2027-02-26")).toBe(5);
    expect(daysInclusive("2027-02-22", "2027-02-22")).toBe(1);
  });
  it("returns 0 for inverted or invalid ranges", () => {
    expect(daysInclusive("2027-02-26", "2027-02-22")).toBe(0);
    expect(daysInclusive("x", "2027-02-22")).toBe(0);
  });
  it("daysBetween is signed and null on bad input", () => {
    expect(daysBetween("2027-02-22", "2027-02-26")).toBe(4);
    expect(daysBetween("2027-02-26", "2027-02-22")).toBe(-4);
    expect(daysBetween("2027-02-22", "nope")).toBeNull();
  });
  it("is not thrown off by a leap day", () => {
    expect(daysInclusive("2028-02-28", "2028-03-01")).toBe(3);
  });
});

describe("formatDateRange", () => {
  it("collapses shared month and year", () => {
    expect(formatDateRange("2027-02-22", "2027-02-26")).toBe("22–26 Feb 2027");
  });
  it("shows both months when they differ within a year", () => {
    expect(formatDateRange("2027-02-28", "2027-03-03")).toBe("28 Feb – 3 Mar 2027");
  });
  it("shows both years when the range crosses New Year", () => {
    expect(formatDateRange("2026-12-28", "2027-01-02")).toBe("28 Dec 2026 – 2 Jan 2027");
  });
  it("handles a single-day trip", () => {
    expect(formatDateRange("2027-02-22", "2027-02-22")).toBe("22 Feb 2027");
  });
  it("falls back to the raw text for unreadable dates", () => {
    expect(formatDateRange("bad", "2027-02-22")).toBe("bad to 2027-02-22");
  });
});

describe("formatMoney", () => {
  it("formats a known currency", () => {
    expect(formatMoney(1500, "USD")).toBe("$1,500");
  });
  it("keeps cents for per-item prices when asked, and still drops them by default", () => {
    expect(formatMoney(12.5, "USD", 2)).toBe("$12.50");
    expect(formatMoney(12, "USD", 2)).toBe("$12");
    expect(formatMoney(12.5, "USD")).toBe("$13");
  });
  it("falls back instead of throwing on an unrecognized currency code", () => {
    expect(formatMoney(1234.6, "not a code")).toBe("1,235 not a code");
  });
});

describe("todayISO", () => {
  it("uses the local calendar date, zero-padded", () => {
    expect(todayISO(new Date(2027, 0, 5, 23, 59))).toBe("2027-01-05");
  });
});
