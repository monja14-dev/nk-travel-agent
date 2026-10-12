/**
 * Vercel Edge Function: POST /api/ai-chat
 *
 * This file is the ONLY place in the project allowed to read
 * process.env.ANTHROPIC_API_KEY — it's never imported by anything under
 * src/, so it's never part of the client bundle Vite produces (verified
 * structurally by api/_lib/__tests__/noClientLeak.test.ts, and should be
 * spot-checked for real with `grep -r ANTHROPIC dist/` after a
 * production build — see docs/PHASE_LOG.md).
 *
 * Edge runtime (not Node serverless) is used deliberately: it only
 * needs `fetch`, `Request`/`Response`, and `process.env`, all of which
 * Vercel's Edge runtime supports, and it avoids taking on `@vercel/node`
 * as a new dependency just for type definitions.
 *
 * All the actual logic (validation, credential check, calling the
 * provider, parsing its output, mapping errors to status codes) lives
 * in ./_lib/gateway.ts, which is plain, dependency-light TypeScript
 * exercised directly by vitest — this file only wires that logic to the
 * real request/response and real environment.
 */

import { handleAiChatRequest } from "./_lib/gateway";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed. POST a chat message to this endpoint." });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const result = await handleAiChatRequest(
    rawBody,
    { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL },
    { fetchImpl: fetch },
    request.signal,
  );

  return jsonResponse(result.status, result.body);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
