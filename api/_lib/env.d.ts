/**
 * Vercel's Edge runtime provides a minimal `process.env` for reading
 * environment variables, but it isn't Node — the rest of Node's
 * `process` API (and everything else @types/node would declare
 * globally) doesn't exist there. This declares only the one shape
 * actually used (by api/ai-chat.ts), rather than adding "node" to
 * tsconfig.api.json's "types" and pulling in @types/node's global
 * fetch/Request/Response declarations, which can collide with the
 * "DOM" lib's own versions of those same globals already relied on by
 * anthropicClient.ts.
 */
declare const process: {
  env: Record<string, string | undefined>;
};
