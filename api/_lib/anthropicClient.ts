/**
 * Thin wrapper around Anthropic's Messages API. Takes an injectable
 * `fetchImpl` so the gateway (and this module's own tests) never need a
 * real network call — see api/_lib/__tests__/anthropicClient.test.ts.
 *
 * Web search (Phase 8): when `webSearch` is set, Anthropic's server-side
 * `web_search` tool is attached to the request. Searches run on
 * Anthropic's side — nothing here fetches a web page itself, and the API
 * key never leaves this server-only module.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** The basic (non-dynamic-filtering) version of the tool. The newer
 * versions need code execution or newer models; this one only needs the
 * tool to be enabled for the organization. */
const WEB_SEARCH_TOOL_TYPE = "web_search_20250305";

/** A long search turn can come back with stop_reason "pause_turn"; the
 * paused turn is sent back unchanged to continue it. Bounded so a
 * misbehaving response can never loop (and bill) forever. */
const MAX_PAUSE_CONTINUATIONS = 3;

export class ProviderError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export class ProviderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The AI provider did not respond within ${timeoutMs}ms.`);
    this.name = "ProviderTimeoutError";
  }
}

/** Distinct from ProviderTimeoutError: this means the CALLER (the
 * person using the chat, via their own cancel action) aborted the
 * request — not that the provider was slow. The gateway maps these to
 * different, honest messages rather than lumping "you cancelled" in
 * with "the AI was too slow." */
export class RequestCancelledError extends Error {
  constructor() {
    super("The request was cancelled.");
    this.name = "RequestCancelledError";
  }
}

export interface AnthropicChatMessage {
  role: "user" | "assistant";
  /** A plain string for ordinary turns. Content blocks only ever appear
   * internally, when continuing a paused web-search turn. */
  content: string | unknown[];
}

export interface WebSearchOptions {
  /** Hard cap on searches per request (the tool's `max_uses`). This is
   * the cost ceiling: each search is billed per use. */
  maxUses: number;
}

export interface CallAnthropicOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: AnthropicChatMessage[];
  maxTokens?: number;
  /** External cancellation signal — e.g. the incoming HTTP request being
   * aborted because the person clicked "Cancel" in the chat UI. */
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Attach the server-side web_search tool. Off unless provided. */
  webSearch?: WebSearchOptions;
}

export interface SearchSource {
  title: string;
  url: string;
}

export interface AnthropicCallResult {
  text: string;
  /** Searches actually run, as reported by the provider's usage. */
  searchCount: number;
  /** De-duplicated http(s) pages the searches returned, in first-seen order. */
  sources: SearchSource[];
  /** Provider error codes from individual searches that failed (e.g.
   * "too_many_requests", "unavailable"). Failed searches are not billed. */
  searchErrors: string[];
}

const DEFAULT_MAX_TOKENS = 2048;
/** With search on, the answer carries search results as input and a
 * longer written reply, so it gets more room. */
const WEB_SEARCH_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 25_000;

/** Calls Anthropic's Messages API and returns the concatenated text of
 * the response's text content blocks. Throws ProviderTimeoutError,
 * RequestCancelledError, or ProviderError — never lets a raw fetch
 * rejection or an un-typed error escape, so the gateway can match on
 * exactly these three cases. */
export async function callAnthropic(options: CallAnthropicOptions): Promise<string> {
  return (await callAnthropicDetailed(options)).text;
}

/** Same as callAnthropic, but also reports how many searches ran and
 * which pages they returned. */
export async function callAnthropicDetailed(options: CallAnthropicOptions): Promise<AnthropicCallResult> {
  const {
    apiKey,
    model,
    systemPrompt,
    messages,
    maxTokens = options.webSearch ? WEB_SEARCH_MAX_TOKENS : DEFAULT_MAX_TOKENS,
    signal: externalSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    webSearch,
  } = options;

  const internalController = new AbortController();
  let timedOut = false;

  // One timer for the whole call, including any pause_turn continuations.
  const timer = setTimeout(() => {
    timedOut = true;
    internalController.abort();
  }, timeoutMs);

  const onExternalAbort = () => internalController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      internalController.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort);
    }
  }

  try {
    let conversation: AnthropicChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    let searchCount = 0;
    const sources = new Map<string, SearchSource>();
    const searchErrors: string[] = [];

    for (let round = 0; round <= MAX_PAUSE_CONTINUATIONS; round++) {
      let response: Response;
      try {
        response = await fetchImpl(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: conversation,
            ...(webSearch
              ? { tools: [{ type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: webSearch.maxUses }] }
              : {}),
          }),
          signal: internalController.signal,
        });
      } catch (err) {
        if (internalController.signal.aborted) {
          if (timedOut) throw new ProviderTimeoutError(timeoutMs);
          throw new RequestCancelledError();
        }
        // A real network failure (DNS, connection refused, etc.), not an
        // abort — still a provider-side failure from the caller's point
        // of view, so it gets the same typed error as a bad HTTP status.
        throw new ProviderError(err instanceof Error ? err.message : "Network error calling the AI provider.");
      }

      if (!response.ok) {
        let detail = "";
        try {
          detail = await response.text();
        } catch {
          // best-effort only — a failing .text() read shouldn't mask the
          // original non-ok status
        }
        throw new ProviderError(
          `AI provider returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`,
          response.status,
        );
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        // Reading the body is part of the same timeout/cancel window: a
        // search turn can take a while to finish arriving.
        if (internalController.signal.aborted) {
          if (timedOut) throw new ProviderTimeoutError(timeoutMs);
          throw new RequestCancelledError();
        }
        throw new ProviderError("AI provider response was not valid JSON.");
      }

      const body = asRecord(json, "AI provider response was not a JSON object.");
      const content = body.content;
      if (!Array.isArray(content)) {
        throw new ProviderError("AI provider response had no content array.");
      }

      searchCount += countSearches(body, content);
      collectSources(content, sources);
      collectSearchErrors(content, searchErrors);

      if (webSearch && body.stop_reason === "pause_turn") {
        // The provider paused a long turn; continue it by sending the
        // assistant content back exactly as received.
        conversation = [...conversation, { role: "assistant", content }];
        continue;
      }

      return {
        text: extractFinalText(content),
        searchCount,
        sources: [...sources.values()],
        searchErrors,
      };
    }

    throw new ProviderError("AI provider kept pausing the turn; giving up after several continuations.");
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProviderError(message);
  }
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Prefers the provider's own usage figure (that is what is billed); falls
 * back to counting search calls in the content. */
function countSearches(body: Record<string, unknown>, content: unknown[]): number {
  const usage = body.usage;
  if (isRecord(usage) && isRecord(usage.server_tool_use)) {
    const n = usage.server_tool_use.web_search_requests;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  }
  return content.filter((b) => isRecord(b) && b.type === "server_tool_use" && b.name === "web_search").length;
}

function collectSources(content: unknown[], into: Map<string, SearchSource>): void {
  for (const block of content) {
    if (!isRecord(block) || block.type !== "web_search_tool_result") continue;
    const results = block.content;
    if (!Array.isArray(results)) continue; // an error object, handled separately
    for (const result of results) {
      if (!isRecord(result) || result.type !== "web_search_result") continue;
      const url = typeof result.url === "string" ? result.url : "";
      // Only http(s) pages ever become a link the person can click.
      if (!/^https?:\/\/\S+$/i.test(url) || into.has(url)) continue;
      const title = typeof result.title === "string" && result.title.trim() ? result.title.trim() : url;
      into.set(url, { title: title.slice(0, 200), url });
    }
  }
}

function collectSearchErrors(content: unknown[], into: string[]): void {
  for (const block of content) {
    if (!isRecord(block) || block.type !== "web_search_tool_result") continue;
    const result = block.content;
    if (isRecord(result) && typeof result.error_code === "string") into.push(result.error_code);
  }
}

/** The model's answer is the text AFTER its last search activity. Text
 * before that is narration ("I'll search for…") and would corrupt the
 * JSON-only reply if concatenated into it. With no search blocks this is
 * simply all the text blocks, same as before web search existed. */
function extractFinalText(content: unknown[]): string {
  let start = 0;
  content.forEach((block, i) => {
    if (isRecord(block) && (block.type === "server_tool_use" || block.type === "web_search_tool_result")) {
      start = i + 1;
    }
  });

  const text = content
    .slice(start)
    .filter((block): block is { type: string; text: string } => {
      return isRecord(block) && block.type === "text" && typeof block.text === "string";
    })
    .map((block) => block.text)
    .join("");

  if (!text) {
    throw new ProviderError("AI provider response had no text content.");
  }
  return text;
}
