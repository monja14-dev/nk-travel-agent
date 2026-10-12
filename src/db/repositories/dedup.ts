/**
 * Shared by accommodationResultsRepo.ts and foodResultsRepo.ts. Deliberately
 * simple — an exact match after normalization, not fuzzy/typo-tolerant
 * matching — so it's predictable and testable; see docs/PHASE_LOG.md for
 * why a smarter matcher wasn't built for this phase.
 */
export function normalizeNameForDedup(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (e.g. "café" -> "cafe")
    .replace(/[^a-z0-9]+/g, " ") // collapse punctuation/symbols to a single space
    .trim()
    .replace(/\s+/g, " ");
}
