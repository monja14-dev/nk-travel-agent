import type { ResearchVerificationStatus, ResultAttribution } from "../../db/schema";

/**
 * "Clearly label... stale data" (master prompt, Phase 4) is handled as a
 * DERIVED status, not a stored one — nothing saved here can stay
 * "verified" forever on its own, since prices and availability change
 * regardless of what was true when it was captured. `verificationStatus`
 * on the record is what was true AT retrieval time; this function layers
 * age on top of that for what to actually show someone looking at it now.
 */
export const STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function getDisplayVerificationStatus(
  attribution: ResultAttribution,
  now: Date = new Date(),
): ResearchVerificationStatus {
  // "unknown" means the field/claim was never confirmed in the first
  // place — age doesn't make that worse, so it's left as-is rather than
  // relabeled "stale" (which would imply it was once known and has since
  // drifted).
  if (attribution.verificationStatus === "unknown") return "unknown";

  const retrievedMs = new Date(attribution.retrievedAt).getTime();
  if (!Number.isFinite(retrievedMs)) return attribution.verificationStatus;

  if (now.getTime() - retrievedMs > STALE_AFTER_MS) return "stale";
  return attribution.verificationStatus;
}

export const VERIFICATION_LABELS: Record<ResearchVerificationStatus, string> = {
  verified: "Verified",
  estimate: "Estimate",
  stale: "May be outdated",
  unknown: "Unknown",
};
