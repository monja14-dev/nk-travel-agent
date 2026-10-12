import { describe, it, expect, vi } from "vitest";
import { handleAiChatRequest } from "../gateway";

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
