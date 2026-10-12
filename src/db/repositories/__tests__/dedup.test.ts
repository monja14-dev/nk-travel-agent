import { describe, it, expect } from "vitest";
import { normalizeNameForDedup } from "../dedup";

describe("normalizeNameForDedup", () => {
  it("is case-insensitive", () => {
    expect(normalizeNameForDedup("Henann Prime Beach Resort")).toBe(normalizeNameForDedup("HENANN PRIME BEACH RESORT"));
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(normalizeNameForDedup("  Henann   Prime  Beach Resort  ")).toBe(normalizeNameForDedup("Henann Prime Beach Resort"));
  });

  it("treats punctuation as a word separator (matching how it's dropped on both sides)", () => {
    // A straightforward exact-after-normalization matcher, not a
    // semantic one — "&" collapses to a separator like any other
    // punctuation, it isn't expanded to the word "and". Documented as
    // intentionally simple; see docs/PHASE_LOG.md.
    expect(normalizeNameForDedup("Jollibee!")).toBe(normalizeNameForDedup("Jollibee"));
    expect(normalizeNameForDedup("Mama's Kitchen")).toBe(normalizeNameForDedup("Mama s Kitchen"));
  });

  it("strips diacritics", () => {
    expect(normalizeNameForDedup("Café Léon")).toBe(normalizeNameForDedup("Cafe Leon"));
  });

  it("still distinguishes genuinely different names", () => {
    expect(normalizeNameForDedup("Henann Prime Beach Resort")).not.toBe(normalizeNameForDedup("Henann Garden Resort"));
  });
});
