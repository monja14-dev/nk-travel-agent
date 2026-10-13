import { describe, it, expect } from "vitest";
import { streamGatewayResult } from "../streaming";
import type { GatewayResult } from "../gateway";

async function readAll(response: Response): Promise<string> {
  return await response.text();
}

describe("streamGatewayResult", () => {
  it("returns a 200 JSON response straight away and delivers the gateway's body once ready", async () => {
    const response = streamGatewayResult(
      async (): Promise<GatewayResult> => ({ status: 200, body: { reply: "hi", proposals: [], warnings: [] } }),
      5,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    const parsed = JSON.parse(await readAll(response));
    expect(parsed).toEqual({ reply: "hi", proposals: [], warnings: [] });
  });

  it("pads with whitespace while waiting, and the result still parses as JSON", async () => {
    const response = streamGatewayResult(
      () =>
        new Promise<GatewayResult>((resolve) =>
          setTimeout(() => resolve({ status: 200, body: { reply: "slow", proposals: [], warnings: [] } }), 60),
        ),
      10,
    );
    const text = await readAll(response);
    // Several keep-alive spaces came before the JSON.
    expect(text.length - text.trimStart().length).toBeGreaterThan(2);
    expect(JSON.parse(text).reply).toBe("slow");
  });

  it("reports a gateway error inside the body (with its real status), since the HTTP status is already sent", async () => {
    const response = streamGatewayResult(
      async (): Promise<GatewayResult> => ({ status: 502, body: { error: "The AI didn't respond successfully." } }),
      5,
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(await readAll(response))).toEqual({
      error: "The AI didn't respond successfully.",
      status: 502,
    });
  });

  it("turns an unexpected throw into a generic error body without leaking the message", async () => {
    const response = streamGatewayResult(async (): Promise<GatewayResult> => {
      throw new Error("secret internal detail");
    }, 5);
    const text = await readAll(response);
    expect(JSON.parse(text).status).toBe(500);
    expect(text).not.toMatch(/secret internal detail/);
  });
});
