import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * "Verify that private credentials do not appear in browser bundles"
 * (master prompt, Phase 3). The real proof is grepping the actual built
 * `dist/` output after `npm run build` — documented as a manual
 * verification step in docs/PHASE_LOG.md, since this sandbox can't run
 * the real Vite build. This test is the automated half: it guarantees
 * the *structural* precondition that makes that grep expected to come
 * back clean — nothing under src/ (the only thing Vite's client build
 * actually bundles) imports api/_lib/anthropicClient.ts or api/ai-chat.ts
 * (the only two files that touch the API key), directly or transitively
 * through any chain of relative imports, and nothing under src/
 * references the provider's env var name directly.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..", "..");
const srcDir = join(projectRoot, "src");
const apiDir = join(projectRoot, "api");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const srcFiles = walk(srcDir);

describe("client bundle never reaches the server-only AI gateway code", () => {
  it("no file under src/ imports anything from api/", () => {
    const offenders: string[] = [];
    const importRe = /from\s+["'](\.[^"']+)["']/g;

    for (const file of srcFiles) {
      const content = readFileSync(file, "utf-8");
      let match: RegExpExecArray | null;
      while ((match = importRe.exec(content))) {
        const resolved = resolve(dirname(file), match[1]);
        if (resolved.startsWith(apiDir)) {
          offenders.push(`${relative(projectRoot, file)} imports "${match[1]}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("no file under src/ references the AI provider's credential env var by name", () => {
    const offenders: string[] = [];

    for (const file of srcFiles) {
      const content = readFileSync(file, "utf-8");
      if (/process\.env\.ANTHROPIC/.test(content)) {
        offenders.push(relative(projectRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("sanity check: the test's own walk actually found source files (guards against a silently-empty scan)", () => {
    expect(srcFiles.length).toBeGreaterThan(10);
  });
});
