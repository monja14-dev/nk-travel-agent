import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Phase 6 — "test offline saved data." The app's core data (trips,
 * itinerary, budget, bookings, reminders, research results, profile,
 * overrides) lives entirely in IndexedDB and must keep working with no
 * network at all — the only legitimate network call anywhere in the
 * client bundle is the AI chat feature's own `fetch("/api/ai-chat")`.
 * This is the static-analysis half of that guarantee (the same role
 * noClientLeak.test.ts plays for the credential-leak guarantee): it
 * walks every source file OUTSIDE src/modules/ai/ and fails if any of
 * them reference a network primitive, so a future change can't quietly
 * make a "core" screen depend on connectivity without this test noticing
 * — rather than relying on a one-time manual audit that can go stale.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..", "..");
const srcDir = join(projectRoot, "src");
const aiDir = join(srcDir, "modules", "ai");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const coreFiles = walk(srcDir).filter((f) => !f.startsWith(aiDir));

// Matches a real network call, not incidental text — e.g.
// research/validation.ts's "must look like a URL" error messages contain
// the substring "http" but never call anything network-shaped.
const NETWORK_PATTERNS = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bnew\s+WebSocket\s*\(/, /\baxios[.(]/];

describe("core app data stays usable offline (no network outside the AI chat module)", () => {
  it("no file outside src/modules/ai/ makes a network call", () => {
    const offenders: string[] = [];

    for (const file of coreFiles) {
      const content = readFileSync(file, "utf-8");
      for (const pattern of NETWORK_PATTERNS) {
        if (pattern.test(content)) {
          offenders.push(`${relative(projectRoot, file)} matches ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("sanity check: the scan actually found core source files (guards against a silently-empty walk)", () => {
    expect(coreFiles.length).toBeGreaterThan(20);
  });

  it("sanity check: the AI module itself DOES use fetch — confirms the exclusion is narrowing the right thing, not hiding a broken scan", () => {
    const aiFiles = walk(aiDir);
    const anyFetch = aiFiles.some((f) => /\bfetch\s*\(/.test(readFileSync(f, "utf-8")));
    expect(anyFetch).toBe(true);
  });
});
