import { describe, it, expect } from "vitest";
import { getDisplayVerificationStatus, STALE_AFTER_MS } from "../verification";
import type { ResultAttribution } from "../../../db/schema";

const NOW = new Date("2027-02-01T00:00:00.000Z");

function attribution(overrides: Partial<ResultAttribution> = {}): ResultAttribution {
  return {
    sourceLabel: "Manually researched",
    verificationStatus: "verified",
    retrievedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("getDisplayVerificationStatus", () => {
  it("shows the stored status as-is when it's fresh", () => {
    const status = getDisplayVerificationStatus(attribution({ verificationStatus: "verified" }), NOW);
    expect(status).toBe("verified");
  });

  it("demotes an old 'verified'/'estimate' result to 'stale'", () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000);
    const status = getDisplayVerificationStatus(attribution({ verificationStatus: "verified", retrievedAt: old.toISOString() }), NOW);
    expect(status).toBe("stale");
  });

  it("does not demote a result that's old but still within the staleness window", () => {
    const recent = new Date(NOW.getTime() - STALE_AFTER_MS + 1000);
    const status = getDisplayVerificationStatus(attribution({ verificationStatus: "estimate", retrievedAt: recent.toISOString() }), NOW);
    expect(status).toBe("estimate");
  });

  it("never relabels 'unknown' as 'stale' — it was never known to begin with", () => {
    const veryOld = new Date(NOW.getTime() - STALE_AFTER_MS * 100);
    const status = getDisplayVerificationStatus(attribution({ verificationStatus: "unknown", retrievedAt: veryOld.toISOString() }), NOW);
    expect(status).toBe("unknown");
  });

  it("falls back to the stored status (rather than crashing) when retrievedAt isn't a valid date", () => {
    const status = getDisplayVerificationStatus(attribution({ verificationStatus: "verified", retrievedAt: "not a date" }), NOW);
    expect(status).toBe("verified");
  });
});
