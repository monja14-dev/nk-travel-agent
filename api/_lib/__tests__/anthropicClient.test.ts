import { describe, it, expect, vi, afterEach } from "vitest";
import {
  callAnthropic,
  callAnthropicDetailed,
  ProviderError,
  ProviderTimeoutError,
  RequestCancelledError,
} from "../anthropicClient";

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

describe("callAnthropicDetailed — web search (Phase 8)", () => {
  const searchTurn = (finalText: string) => ({
    content: [
      { type: "text", text: "I'll search for hotels in Shinjuku." },
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "shinjuku hotels" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [
          { type: "web_search_result", url: "https://example.com/a", title: "Hotel A", page_age: "1 week", encrypted_content: "x" },
          { type: "web_search_result", url: "https://example.com/a", title: "Hotel A again", encrypted_content: "x" },
          { type: "web_search_result", url: "javascript:alert(1)", title: "Bad", encrypted_content: "x" },
          { type: "web_search_result", url: "https://example.com/b", title: "Hotel B", encrypted_content: "x" },
        ],
      },
      { type: "text", text: finalText },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 20, server_tool_use: { web_search_requests: 1 } },
  });

  const base = {
    apiKey: "sk-test",
    model: "claude-test",
    systemPrompt: "system",
    messages: [{ role: "user" as const, content: "find hotels" }],
  };

  it("does not attach the tool unless webSearch is set", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse({ content: [{ type: "text", text: "ok" }] }),
    );
    await callAnthropicDetailed({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(sent.tools).toBeUndefined();
  });

  it("attaches the web_search tool with the given max_uses", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse(searchTurn('{"reply":"x","proposals":[]}')),
    );
    await callAnthropicDetailed({
      ...base,
      webSearch: { maxUses: 5 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(sent.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]);
  });

  it("returns only the text after the last search, dropping the 'I'll search…' narration", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse(searchTurn('{"reply":"Found two.","proposals":[]}')),
    );
    const result = await callAnthropicDetailed({
      ...base,
      webSearch: { maxUses: 5 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.text).toBe('{"reply":"Found two.","proposals":[]}');
    expect(result.text).not.toMatch(/I'll search/);
  });

  it("reports the provider's search count and de-duplicated http(s) sources only", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse(searchTurn("done")),
    );
    const result = await callAnthropicDetailed({
      ...base,
      webSearch: { maxUses: 5 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.searchCount).toBe(1);
    expect(result.sources).toEqual([
      { title: "Hotel A", url: "https://example.com/a" },
      { title: "Hotel B", url: "https://example.com/b" },
    ]);
  });

  it("records a failed search's error code instead of treating it as sources", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse({
        content: [
          { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } },
          {
            type: "web_search_tool_result",
            tool_use_id: "s1",
            content: { type: "web_search_tool_result_error", error_code: "unavailable" },
          },
          { type: "text", text: "could not search" },
        ],
      }),
    );
    const result = await callAnthropicDetailed({
      ...base,
      webSearch: { maxUses: 5 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.sources).toEqual([]);
    expect(result.searchErrors).toEqual(["unavailable"]);
    expect(result.text).toBe("could not search");
  });

  it("continues a paused turn by sending the assistant content back unchanged, and sums the searches", async () => {
    const pausedContent = [
      { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "s1",
        content: [{ type: "web_search_result", url: "https://example.com/a", title: "A", encrypted_content: "enc" }],
      },
    ];
    const responses = [
      jsonResponse({
        content: pausedContent,
        stop_reason: "pause_turn",
        usage: { server_tool_use: { web_search_requests: 1 } },
      }),
      jsonResponse({
        content: [{ type: "text", text: "final" }],
        stop_reason: "end_turn",
        usage: { server_tool_use: { web_search_requests: 2 } },
      }),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => responses[call++]);

    const result = await callAnthropicDetailed({
      ...base,
      webSearch: { maxUses: 5 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = JSON.parse(fetchImpl.mock.calls[1][1].body as string);
    expect(second.messages).toHaveLength(2);
    expect(second.messages[1]).toEqual({ role: "assistant", content: pausedContent });
    expect(result.text).toBe("final");
    expect(result.searchCount).toBe(3);
  });

  it("gives up with a ProviderError if the provider keeps pausing forever", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse({
        content: [{ type: "server_tool_use", id: "s", name: "web_search", input: { query: "q" } }],
        stop_reason: "pause_turn",
      }),
    );
    await expect(
      callAnthropicDetailed({
        ...base,
        webSearch: { maxUses: 5 },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
    // 1 original + 3 continuations, then stop.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not continue on pause_turn when search is off", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
      jsonResponse({ content: [{ type: "text", text: "plain" }], stop_reason: "pause_turn" }),
    );
    const result = await callAnthropicDetailed({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.text).toBe("plain");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
