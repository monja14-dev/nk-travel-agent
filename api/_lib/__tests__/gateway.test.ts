import { describe, it, expect, vi } from "vitest";
import { handleAiChatRequest, WEB_SEARCH_MAX_USES, WEB_SEARCH_TIMEOUT_MS } from "../gateway";

function validRequestBody(overrides: Record<string, unknown> = {}) {
  return {
    tripId: "trip_abc",
    message: "What do you think of this itinerary?",
    context: {
      trip: {
        id: "trip_abc",
        revision: 3,
        name: "Japan Trip",
        destination: "Tokyo",
        country: "Japan",
        startDate: "2027-02-22",
        endDate: "2027-02-26",
        travelerCount: 2,
        status: "planning",
      },
      profile: {
        revision: 1,
        priorityOrder: ["experience", "value"],
        accommodationPreferences: "Clean and comfortable.",
        foodPreferences: "Authentic local food.",
        pace: "comfortable",
      },
      override: null,
    },
    history: [],
    ...overrides,
  };
}

function okFetch(bodyText: string) {
  return vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: bodyText }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

const VALID_ENV = { apiKey: "sk-test", model: "claude-test" };

describe("handleAiChatRequest — valid responses", () => {
  it("returns 200 with the parsed reply and proposals on a well-formed provider response", async () => {
    const fetchImpl = okFetch(
      JSON.stringify({
        reply: "Here's what I think.",
        proposals: [
          {
            kind: "trip-update",
            tripId: "trip_abc",
            expectedRevision: 3,
            changes: { notes: "Remember to book the teamLab tickets early." },
            rationale: "Popular exhibits sell out.",
          },
        ],
      }),
    );

    const result = await handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(200);
    const body = result.body as { reply: string; proposals: unknown[] };
    expect(body.reply).toBe("Here's what I think.");
    expect(body.proposals).toHaveLength(1);
  });
});

describe("handleAiChatRequest — request validation", () => {
  it("returns 400 for an invalid request body, without calling the provider", async () => {
    const fetchImpl = okFetch(JSON.stringify({ reply: "unused", proposals: [] }));

    const result = await handleAiChatRequest(
      { tripId: "", message: "" },
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 413 for an oversized request body, without calling the provider", async () => {
    const fetchImpl = okFetch(JSON.stringify({ reply: "unused", proposals: [] }));
    const hugeMessage = "a".repeat(200_000);

    const result = await handleAiChatRequest(
      validRequestBody({ message: hugeMessage }),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("handleAiChatRequest — missing credentials", () => {
  it("returns 500 and never calls the provider when the API key is missing", async () => {
    const fetchImpl = okFetch(JSON.stringify({ reply: "unused", proposals: [] }));

    const result = await handleAiChatRequest(
      validRequestBody(),
      { apiKey: undefined, model: "claude-test" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(500);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toMatch(/sk-|api[_-]?key/i);
  });

  it("returns 500 and never calls the provider when the model is missing", async () => {
    const fetchImpl = okFetch(JSON.stringify({ reply: "unused", proposals: [] }));

    const result = await handleAiChatRequest(
      validRequestBody(),
      { apiKey: "sk-test", model: undefined },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(500);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("handleAiChatRequest — malformed provider output", () => {
  it("returns 502 when the provider's text isn't parseable JSON", async () => {
    const fetchImpl = okFetch("Sure! I'd book the hotel near Shinjuku.");

    const result = await handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(502);
  });

  it("returns 502 when the provider's JSON has no usable reply field", async () => {
    const fetchImpl = okFetch(JSON.stringify({ proposals: [] }));

    const result = await handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(502);
  });
});

describe("handleAiChatRequest — provider failures", () => {
  it("returns 502 with a generic message (not the raw provider error) on a non-ok HTTP status", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit): Promise<Response> =>
        new Response("secret internal provider error detail", { status: 500 }),
    );

    const result = await handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).not.toMatch(/secret internal provider error detail/);
  });

  it("returns 502 when fetch itself throws (network failure)", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
      throw new Error("network down");
    });

    const result = await handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );

    expect(result.status).toBe(502);
  });
});

describe("handleAiChatRequest — timeouts", () => {
  it("returns 504 when the provider doesn't respond in time", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit): Promise<Response> => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    const result = await handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 },
      new AbortController().signal,
    );

    expect(result.status).toBe(504);
  });
});

describe("handleAiChatRequest — cancellation", () => {
  it("returns 499 when the caller's signal aborts before the provider responds", async () => {
    const externalController = new AbortController();
    const fetchImpl = vi.fn((_url: string, init: RequestInit): Promise<Response> => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    const resultPromise = handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10_000 },
      externalController.signal,
    );

    externalController.abort();

    const result = await resultPromise;
    expect(result.status).toBe(499);
  });
});

describe("handleAiChatRequest — web search (Phase 8)", () => {
  function searchFetch(finalText: string) {
    return vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "Let me search." },
            { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } },
            {
              type: "web_search_tool_result",
              tool_use_id: "s1",
              content: [{ type: "web_search_result", url: "https://example.com/h", title: "Hotel H", encrypted_content: "x" }],
            },
            { type: "text", text: finalText },
          ],
          stop_reason: "end_turn",
          usage: { server_tool_use: { web_search_requests: 1 } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
  }

  function sentBody(fetchImpl: { mock: { calls: unknown[][] } }) {
    return JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string);
  }

  it("does not attach the tool or the addendum when webSearch is not requested", async () => {
    const fetchImpl = okFetch(JSON.stringify({ reply: "plain", proposals: [] }));
    await handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );
    const sent = sentBody(fetchImpl);
    expect(sent.tools).toBeUndefined();
    expect(sent.system).not.toMatch(/Web search addendum/);
    expect(sent.messages[sent.messages.length - 1].content).not.toMatch(/Today's date/);
  });

  it("attaches the tool capped at WEB_SEARCH_MAX_USES, adds the addendum and today's date", async () => {
    const fetchImpl = searchFetch(JSON.stringify({ reply: "Found one.", proposals: [] }));
    await handleAiChatRequest(
      validRequestBody({ webSearch: true }),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );
    const sent = sentBody(fetchImpl);
    expect(sent.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES }]);
    expect(sent.system).toMatch(/Web search addendum/);
    expect(sent.messages[sent.messages.length - 1].content).toMatch(/Today's date: \d{4}-\d{2}-\d{2}/);
  });

  it("the client cannot raise the search cap — extra fields in the body are ignored", async () => {
    const fetchImpl = searchFetch(JSON.stringify({ reply: "ok", proposals: [] }));
    await handleAiChatRequest(
      validRequestBody({ webSearch: true, maxUses: 500, max_uses: 500 }),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );
    expect(sentBody(fetchImpl).tools[0].max_uses).toBe(WEB_SEARCH_MAX_USES);
  });

  it("returns the reply, the sources and the search count, parsing only the post-search text", async () => {
    const fetchImpl = searchFetch(JSON.stringify({ reply: "Found one.", proposals: [] }));
    const result = await handleAiChatRequest(
      validRequestBody({ webSearch: true }),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );
    expect(result.status).toBe(200);
    const body = result.body as { reply: string; sources?: unknown[]; searchCount?: number };
    expect(body.reply).toBe("Found one.");
    expect(body.sources).toEqual([{ title: "Hotel H", url: "https://example.com/h" }]);
    expect(body.searchCount).toBe(1);
  });

  it("omits sources/searchCount on a normal (non-search) turn", async () => {
    const fetchImpl = okFetch(JSON.stringify({ reply: "plain", proposals: [] }));
    const result = await handleAiChatRequest(
      validRequestBody(),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );
    expect(result.body).not.toHaveProperty("sources");
    expect(result.body).not.toHaveProperty("searchCount");
  });

  it("rejects a non-boolean webSearch with 400, without calling the provider", async () => {
    const fetchImpl = okFetch(JSON.stringify({ reply: "unused", proposals: [] }));
    const result = await handleAiChatRequest(
      validRequestBody({ webSearch: "yes" }),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );
    expect(result.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explains plainly when the provider rejects the web search tool (400 naming web search)", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit): Promise<Response> =>
        new Response('{"error":{"type":"invalid_request_error","message":"Web search is not enabled for this organization"}}', {
          status: 400,
        }),
    );
    const result = await handleAiChatRequest(
      validRequestBody({ webSearch: true }),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );
    expect(result.status).toBe(502);
    const body = result.body as { error: string };
    expect(body.error).toMatch(/Web search isn't available/);
    expect(body.error).not.toMatch(/organization|invalid_request_error/);
  });

  it("surfaces failed searches as a warning on an otherwise good answer", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
      return new Response(
        JSON.stringify({
          content: [
            { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } },
            {
              type: "web_search_tool_result",
              tool_use_id: "s1",
              content: { type: "web_search_tool_result_error", error_code: "too_many_requests" },
            },
            { type: "text", text: JSON.stringify({ reply: "Couldn't search, going from what I know.", proposals: [] }) },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const result = await handleAiChatRequest(
      validRequestBody({ webSearch: true }),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
      new AbortController().signal,
    );
    expect(result.status).toBe(200);
    const body = result.body as { warnings: string[] };
    expect(body.warnings.join(" ")).toMatch(/too_many_requests/);
  });

  it("uses the longer search timeout by default but still honours an explicit timeoutMs", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit): Promise<Response> => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const result = await handleAiChatRequest(
      validRequestBody({ webSearch: true }),
      VALID_ENV,
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 },
      new AbortController().signal,
    );
    expect(result.status).toBe(504);
    expect(WEB_SEARCH_TIMEOUT_MS).toBeGreaterThan(25_000);
  });
});
