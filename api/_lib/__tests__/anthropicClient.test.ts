import { describe, it, expect, vi, afterEach } from "vitest";
import { callAnthropic, ProviderError, ProviderTimeoutError, RequestCancelledError } from "../anthropicClient";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("callAnthropic — valid responses", () => {
  it("returns the concatenated text of the response's text content blocks", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse({
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "there." },
        ],
      }),
    );

    const text = await callAnthropic({
      apiKey: "sk-test",
      model: "claude-test",
      systemPrompt: "system",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(text).toBe("Hello there.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    expect(call[1].headers).toMatchObject({ "x-api-key": "sk-test" });
  });

  it("ignores non-text content blocks (e.g. a future tool_use block) rather than erroring", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse({ content: [{ type: "tool_use", id: "x" }, { type: "text", text: "ok" }] }),
    );
    const text = await callAnthropic({
      apiKey: "sk-test",
      model: "claude-test",
      systemPrompt: "system",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(text).toBe("ok");
  });
});

describe("callAnthropic — missing credentials", () => {
  it("is the gateway's responsibility, not this module's — callAnthropic will happily send an empty key", async () => {
    // Documented by this test rather than asserted as a throw: the
    // "missing credentials" check belongs in gateway.ts, which never
    // calls callAnthropic at all when env.apiKey is falsy (see
    // gateway.test.ts). This module just sends whatever key it's given.
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit): Promise<Response> => {
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("");
      return jsonResponse({ content: [{ type: "text", text: "ok" }] });
    });
    await callAnthropic({
      apiKey: "",
      model: "claude-test",
      systemPrompt: "system",
      messages: [],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("callAnthropic — provider failures", () => {
  it("throws ProviderError on a non-ok HTTP status", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit): Promise<Response> => new Response("rate limited", { status: 429 }),
    );
    await expect(
      callAnthropic({
        apiKey: "sk-test",
        model: "claude-test",
        systemPrompt: "system",
        messages: [],
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws ProviderError when fetch itself rejects (network failure)", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
      throw new Error("getaddrinfo ENOTFOUND api.anthropic.com");
    });
    await expect(
      callAnthropic({
        apiKey: "sk-test",
        model: "claude-test",
        systemPrompt: "system",
        messages: [],
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws ProviderError when the response body isn't valid JSON", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit): Promise<Response> => new Response("not json", { status: 200 }),
    );
    await expect(
      callAnthropic({
        apiKey: "sk-test",
        model: "claude-test",
        systemPrompt: "system",
        messages: [],
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws ProviderError when the response has no content array", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit): Promise<Response> => jsonResponse({ unexpected: true }),
    );
    await expect(
      callAnthropic({
        apiKey: "sk-test",
        model: "claude-test",
        systemPrompt: "system",
        messages: [],
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("callAnthropic — timeouts", () => {
  it("throws ProviderTimeoutError when the provider doesn't respond within timeoutMs", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit): Promise<Response> => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    await expect(
      callAnthropic({
        apiKey: "sk-test",
        model: "claude-test",
        systemPrompt: "system",
        messages: [],
        timeoutMs: 20,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});

describe("callAnthropic — cancellation", () => {
  it("throws RequestCancelledError when the external signal aborts before the provider responds", async () => {
    const externalController = new AbortController();
    const fetchImpl = vi.fn((_url: string, init: RequestInit): Promise<Response> => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    const callPromise = callAnthropic({
      apiKey: "sk-test",
      model: "claude-test",
      systemPrompt: "system",
      messages: [],
      timeoutMs: 10_000, // long enough that only the external abort fires
      signal: externalController.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    externalController.abort();

    await expect(callPromise).rejects.toBeInstanceOf(RequestCancelledError);
  });

  it("throws RequestCancelledError immediately when the external signal is already aborted", async () => {
    const externalController = new AbortController();
    externalController.abort();

    const fetchImpl = vi.fn((_url: string, init: RequestInit): Promise<Response> => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        if (signal.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    await expect(
      callAnthropic({
        apiKey: "sk-test",
        model: "claude-test",
        systemPrompt: "system",
        messages: [],
        signal: externalController.signal,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(RequestCancelledError);
  });
});
