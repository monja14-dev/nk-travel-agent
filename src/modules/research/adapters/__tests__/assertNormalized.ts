import { expect } from "vitest";
import type { NormalizeOutcome } from "../types";

/**
 * `expect(outcome.ok).toBe(true)` is a function call, not an `if` — it
 * tells vitest what to check, but it tells TypeScript nothing, so
 * `outcome.candidate` still errors under `tsc -b` even right after that
 * line (the union isn't narrowed). This assertion function uses a real
 * `asserts` type predicate so the compiler narrows `outcome` to the
 * `ok: true` branch for every line after the call, exactly the way a
 * genuine `if (!outcome.ok) throw ...` would. Also fails the test (via
 * `expect`) with the actual field errors shown, rather than a bare
 * "candidate is undefined" if normalize() unexpectedly failed.
 */
export function assertNormalized<T>(
  outcome: NormalizeOutcome<T>,
): asserts outcome is { ok: true; candidate: T; fieldErrors: Record<string, never> } {
  if (!outcome.ok) {
    expect.fail(`Expected normalize() to succeed, but got field errors: ${JSON.stringify(outcome.fieldErrors)}`);
  }
}
