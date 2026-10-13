/**
 * The AI gateway's core request handler — deliberately separate from
 * api/ai-chat.ts (the actual Vercel function) so it can be exercised
 * directly in vitest with a mocked fetch and no real network, Vercel
 * runtime, or credentials. api/ai-chat.ts is a thin adapter that reads
 * process.env and the real request, then hands off to this function.
 */

import {
  validateAiChatRequestBody,
  parseProviderOutput,
  RequestValidationError,
  MalformedProviderOutputError,
  type AiChatResponseBody,
  MAX_REQUEST_BODY_BYTES,
} from "./schemas";
import {
  callAnthropicDetailed,
  type AnthropicCallResult,
  ProviderError,
  ProviderTimeoutError,
  RequestCancelledError,
} from "./anthropicClient";
import { buildSystemPrompt } from "./systemPrompt";

/** Hard cap on web searches per chat message. This is the cost ceiling
 * (each search is billed per use) and it is fixed here on the server: the
 * browser can only switch search on or off, never raise this number. */
export const WEB_SEARCH_MAX_USES = 5;

/** A search turn is much slower than a plain one. The Vercel Edge function
 * must *start* responding within 25s but may stream for up to 300s, and
 * api/ai-chat.ts keeps the response alive while this runs. */
export const WEB_SEARCH_TIMEOUT_MS = 120_000;

/** Enough pages to check the answer against, not a wall of links. */
const MAX_SOURCES_RETURNED = 20;

export interface GatewayEnv {
  /** undefined when the server isn't configured — the gateway reports
   * this as a clean 500 rather than letting a `fetch` call fail with a
   * confusing error deeper in the stack. */
  apiKey: string | undefined;
  model: string | undefined;
}

export interface GatewayDeps {
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

export interface GatewayResult {
  status: number;
  body: AiChatResponseBody | { error: string; fieldErrors?: Record<string, string> };
}

const GENERIC_PROVIDER_ERROR_MESSAGE =
  "The AI didn't respond successfully. Try again in a moment — nothing was changed.";

const WEB_SEARCH_UNAVAILABLE_MESSAGE =
  "Web search isn't available for this AI setup (it may be switched off for the Anthropic account, or the " +
  "configured model doesn't support it). Turn off \"Search the web\" to keep chatting — nothing was changed.";

export async function handleAiChatRequest(
  rawBody: unknown,
  env: GatewayEnv,
  deps: GatewayDeps,
  signal: AbortSignal,
): Promise<GatewayResult> {
  // Reject oversized payloads before doing anything else with them.
  const approxSize = safeJsonByteLength(rawBody);
  if (approxSize > MAX_REQUEST_BODY_BYTES) {
    return {
      status: 413,
      body: { error: `Request body is too large (over ${MAX_REQUEST_BODY_BYTES} bytes).` },
    };
  }

  let request;
  try {
    request = validateAiChatRequestBody(rawBody);
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return { status: 400, body: { error: err.message, fieldErrors: err.fieldErrors } };
    }
    throw err;
  }

  if (!env.apiKey || !env.model) {
    // Never state which one is missing — that's an implementation
    // detail an attacker probing the endpoint gets no benefit from
    // learning, and a real server-config error either way.
    return { status: 500, body: { error: "The AI assistant is not configured on the server yet." } };
  }

  const overrideContextText = request.context.override
    ? `This trip currently has its own preference override (revision ${request.context.override.revision}): ` +
      JSON.stringify(request.context.override)
    : "This trip has no override yet — it's inheriting the couple profile and app defaults.";

  const itineraryContextText =
    request.context.itinerary.length > 0
      ? `Itinerary days and items for this trip (JSON — use exact dayId/itemId/revision values, never invent one): ${JSON.stringify(
          request.context.itinerary,
        )}`
      : "This trip's itinerary has no days yet (nothing to target with an itinerary-item-upsert proposal).";

  // Only when searching: the model needs today's date to judge how old a
  // price or review it finds is. Plain turns are byte-for-byte unchanged.
  const dateLine = request.webSearch ? `Today's date: ${new Date().toISOString().slice(0, 10)}\n` : "";

  const contextPreamble =
    `Context for this turn (JSON):\n` +
    dateLine +
    `Trip: ${JSON.stringify(request.context.trip)}\n` +
    `Couple profile: ${JSON.stringify(request.context.profile)}\n` +
    `${overrideContextText}\n` +
    `${itineraryContextText}`;

  const messages = [
    ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: `${contextPreamble}\n\nMessage: ${request.message}` },
  ];

  let call: AnthropicCallResult;
  try {
    call = await callAnthropicDetailed({
      apiKey: env.apiKey,
      model: env.model,
      systemPrompt: buildSystemPrompt({ webSearch: request.webSearch }),
      messages,
      signal,
      timeoutMs: deps.timeoutMs ?? (request.webSearch ? WEB_SEARCH_TIMEOUT_MS : undefined),
      fetchImpl: deps.fetchImpl,
      webSearch: request.webSearch ? { maxUses: WEB_SEARCH_MAX_USES } : undefined,
    });
  } catch (err) {
    if (err instanceof ProviderTimeoutError) {
      return { status: 504, body: { error: "The AI took too long to respond. Try again — nothing was changed." } };
    }
    if (err instanceof RequestCancelledError) {
      // 499 (Client Closed Request) isn't an official status, but is a
      // widely-used convention for exactly this case; in practice the
      // client that cancelled is usually not still listening for a
      // response at all.
      return { status: 499, body: { error: "The request was cancelled." } };
    }
    if (err instanceof ProviderError) {
      // Log the real detail server-side only — never forward a raw
      // provider error body to the client, which could leak
      // implementation details or, in principle, echo back parts of
      // the request.
      console.error("[ai-gateway] provider error:", err.message);
      // A 400 that names web search means the tool itself was rejected
      // (switched off for the org, or unsupported by the model). Say so
      // plainly rather than a vague retry message — retrying won't help.
      if (request.webSearch && err.status === 400 && /web.?search/i.test(err.message)) {
        return { status: 502, body: { error: WEB_SEARCH_UNAVAILABLE_MESSAGE } };
      }
      return { status: 502, body: { error: GENERIC_PROVIDER_ERROR_MESSAGE } };
    }
    throw err;
  }

  try {
    const parsed = parseProviderOutput(call.text);
    if (!request.webSearch) return { status: 200, body: parsed };

    const warnings = [...parsed.warnings];
    if (call.searchErrors.length > 0) {
      warnings.push(
        `Some web searches didn't go through (${[...new Set(call.searchErrors)].join(", ")}), so this answer may be less complete.`,
      );
    }
    return {
      status: 200,
      body: {
        ...parsed,
        warnings,
        sources: call.sources.slice(0, MAX_SOURCES_RETURNED),
        searchCount: call.searchCount,
      },
    };
  } catch (err) {
    if (err instanceof MalformedProviderOutputError) {
      console.error("[ai-gateway] malformed provider output:", err.message);
      return {
        status: 502,
        body: { error: "The AI's response couldn't be understood. Try rephrasing — nothing was changed." },
      };
    }
    throw err;
  }
}

function safeJsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0; // unserializable input fails validation right after anyway
  }
}
