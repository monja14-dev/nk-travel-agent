/**
 * Keeps a slow gateway call alive on Vercel's Edge runtime.
 *
 * The Edge runtime requires a function to *begin* responding within 25
 * seconds, but lets it keep streaming for up to 300. A web-search turn can
 * easily outlast 25 seconds, so for those turns the response is returned
 * immediately and padded with spaces until the real JSON body is ready.
 * Leading whitespace is legal JSON, so the browser's `response.json()` is
 * unaffected.
 *
 * The one catch: once a response has started, its HTTP status can no longer
 * change. So on this path the status is always 200 and a failure is
 * reported inside the body as `{ error, status }`. The client treats a body
 * containing `error` as a failure either way.
 */

import type { GatewayResult } from "./gateway";

export const KEEP_ALIVE_INTERVAL_MS = 10_000;

const UNEXPECTED_ERROR_BODY = {
  error: "Something went wrong on the server. Try again — nothing was changed.",
  status: 500,
};

export function streamGatewayResult(
  run: () => Promise<GatewayResult>,
  keepAliveMs: number = KEEP_ALIVE_INTERVAL_MS,
): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The browser went away (e.g. the person pressed Cancel). Nothing
          // useful to do; the gateway call is aborted separately via the
          // request's own signal.
        }
      };

      write(" ");
      timer = setInterval(() => write(" "), keepAliveMs);

      run()
        .then((result): unknown =>
          result.status === 200 ? result.body : { ...result.body, status: result.status },
        )
        .catch((err: unknown): unknown => {
          console.error("[ai-gateway] unexpected error:", err instanceof Error ? err.message : String(err));
          return UNEXPECTED_ERROR_BODY;
        })
        .then((body) => {
          if (timer !== undefined) clearInterval(timer);
          write(JSON.stringify(body));
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // already closed by a cancel
            }
          }
        });
    },
    cancel() {
      closed = true;
      if (timer !== undefined) clearInterval(timer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
