/**
 * Thin wrapper around Anthropic's Messages API. Takes an injectable
 * `fetchImpl` so the gateway (and this module's own tests) never need a
 * real network call — see api/_lib/__tests__/anthropicClient.test.ts.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

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
  content: string;
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
}

const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 25_000;

/** Calls Anthropic's Messages API and returns the concatenated text of
 * the response's text content blocks. Throws ProviderTimeoutError,
 * RequestCancelledError, or ProviderError — never lets a raw fetch
 * rejection or an un-typed error escape, so the gateway can match on
 * exactly these three cases. */
export async function callAnthropic(options: CallAnthropicOptions): Promise<string> {
  const {
    apiKey,
    model,
    systemPrompt,
    messages,
    maxTokens = DEFAULT_MAX_TOKENS,
    signal: externalSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  const internalController = new AbortController();
  let timedOut = false;

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
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
      throw new ProviderError("AI provider response was not valid JSON.");
    }

    return extractText(json);
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

function extractText(json: unknown): string {
  if (typeof json !== "object" || json === null) {
    throw new ProviderError("AI provider response was not a JSON object.");
  }
  const body = json as Record<string, unknown>;
  const content = body.content;
  if (!Array.isArray(content)) {
    throw new ProviderError("AI provider response had no content array.");
  }
  const text = content
    .filter((block): block is { type: string; text: string } => {
      return (
        typeof block === "object" &&
        block !== null &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string"
      );
    })
    .map((block) => block.text)
    .join("");

  if (!text) {
    throw new ProviderError("AI provider response had no text content.");
  }
  return text;
}
