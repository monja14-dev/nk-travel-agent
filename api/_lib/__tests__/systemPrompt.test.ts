import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SYSTEM_PROMPT,
  RESPONSE_SCHEMA,
  MODE_STAY_HUNTER,
  MODE_FOOD_HUNTER,
  MODE_ITINERARY_PLANNER,
  MODE_BUDGET_PLANNER,
  MODE_TRANSPORTATION_PLANNER,
  MODE_DECISION_SUPPORT,
} from "../systemPrompt";

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(here, "..", "..", "..", "prompts");

function readPrompt(relativePath: string): string {
  return readFileSync(join(promptsDir, relativePath), "utf-8");
}

/**
 * systemPrompt.ts deliberately duplicates /prompts/*.md as string
 * constants rather than reading them at request time (see the comment
 * at the top of systemPrompt.ts and /prompts/README.md for why). This
 * test is what keeps that duplication honest — only ever run via
 * `npm run test` in Node, never at request time, so it doesn't carry
 * the same fs-availability risk the runtime code is avoiding.
 */
describe("systemPrompt.ts stays in sync with /prompts", () => {
  it("SYSTEM_PROMPT matches prompts/system-prompt.md", () => {
    expect(SYSTEM_PROMPT).toBe(readPrompt("system-prompt.md"));
  });

  it("RESPONSE_SCHEMA matches prompts/response-schema.md", () => {
    expect(RESPONSE_SCHEMA).toBe(readPrompt("response-schema.md"));
  });

  it("MODE_STAY_HUNTER matches prompts/modes/stay-hunter.md", () => {
    expect(MODE_STAY_HUNTER).toBe(readPrompt("modes/stay-hunter.md"));
  });

  it("MODE_FOOD_HUNTER matches prompts/modes/food-hunter.md", () => {
    expect(MODE_FOOD_HUNTER).toBe(readPrompt("modes/food-hunter.md"));
  });

  it("MODE_ITINERARY_PLANNER matches prompts/modes/itinerary-planner.md", () => {
    expect(MODE_ITINERARY_PLANNER).toBe(readPrompt("modes/itinerary-planner.md"));
  });

  it("MODE_BUDGET_PLANNER matches prompts/modes/budget-planner.md", () => {
    expect(MODE_BUDGET_PLANNER).toBe(readPrompt("modes/budget-planner.md"));
  });

  it("MODE_TRANSPORTATION_PLANNER matches prompts/modes/transportation-planner.md", () => {
    expect(MODE_TRANSPORTATION_PLANNER).toBe(readPrompt("modes/transportation-planner.md"));
  });

  it("MODE_DECISION_SUPPORT matches prompts/modes/decision-support.md", () => {
    expect(MODE_DECISION_SUPPORT).toBe(readPrompt("modes/decision-support.md"));
  });
});
