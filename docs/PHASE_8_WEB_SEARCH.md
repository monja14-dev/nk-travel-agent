# Phase 8 — Built-in web search for the NK Concierge

Status: **Step A implemented, awaiting owner test.** Branch `phase-7-ui`
(Preview only). Nothing deployed to Production; `main` untouched.

## Why

Phase 4 decided "no live providers yet", so Stay Hunter / Food Hunter research
meant the owner finding things and pasting them in. The owner asked for the
Concierge to do the searching itself ("built in"). This is the first half of
that: the Concierge can search the web and answer with sources. Saving what it
finds into Stay Hunter / Food Hunter is **Step B** (not built yet).

## What it does and does not do

- Uses Anthropic's server-side `web_search` tool (`web_search_20250305`).
  Searches run on Anthropic's side; our code fetches no web pages.
- Results are **page snippets**. It still cannot see live availability or a
  quote for exact dates on Agoda / Booking.com / Airbnb (they have no public
  API and resist automation). The prompt forbids claiming availability, and
  forbids the `verified` label for anything found by searching
  (`estimate` / `stale` / `unknown` only).
- Every property / place it mentions should come with its URL; the pages the
  search returned are also shown under the reply as "Sources".
- Web content is treated as untrusted data in the prompt (prompt-injection
  guard). Independently, nothing the AI says can be saved without the
  existing Approve step, and proposals are still server-validated.

## Changes (no database / schema change)

| File | Change |
|---|---|
| `api/_lib/anthropicClient.ts` | `callAnthropicDetailed`: attaches the tool, continues `pause_turn`, returns only the text after the last search (drops "I'll search…" narration), reports search count + sources + search errors. `callAnthropic` unchanged for callers. |
| `api/_lib/gateway.ts` | `webSearch` flag, `WEB_SEARCH_MAX_USES = 5` (server-side cost cap), 120 s timeout for search turns, today's date added to context on search turns, plain error if the tool is rejected, warning if a search fails. |
| `api/_lib/schemas.ts` | optional `webSearch` boolean in the request; optional `sources` / `searchCount` in the response; JSON extraction tolerates a sentence of narration before the object. |
| `api/_lib/streaming.ts` + `api/ai-chat.ts` | Search turns are streamed with whitespace keep-alive so they can exceed the Edge runtime's 25 s "start responding" limit (it may stream up to 300 s). Errors travel in the body as `{ error, status }` because the HTTP status is already sent. Non-search turns are unchanged. |
| `api/_lib/systemPrompt.ts` + `prompts/web-search.md` | Addendum appended **only** when search is on; overrides the "no live access" wording for that turn. Sync-tested like the other prompt files. |
| `src/modules/ai/AiChatPanel.tsx`, `types.ts` | "Search the web" checkbox (default on), "searching…" status, collapsible Sources list (links only for http/https), handles the in-body error shape. |

## Cost (read this)

- Search fee: **$10 per 1,000 searches** ($0.01 each), at most 5 per message
  = up to $0.05 per message, plus normal model tokens. Failed searches are not
  billed.
- Search results count as input tokens, so a research message is commonly
  10k–30k input tokens. Rough total: on the order of **$0.10–$0.25 per research
  message** — an estimate only; it depends on the model in `ANTHROPIC_MODEL`.
  Check real numbers in Claude Console → Usage after trying it, and set a
  monthly spend limit there.
- The cap (5) lives in `WEB_SEARCH_MAX_USES` in `api/_lib/gateway.ts`. The
  browser can only switch search on or off; it cannot raise the cap.
- Turning the checkbox off makes the message a normal, cheap, fast chat.

## Requirements (owner)

- Web search must be enabled for the Anthropic organization (it is on by
  default; an admin can disable it in Claude Console → Settings →
  Capabilities). If it is off, the chat says so plainly and nothing breaks.
- The model in `ANTHROPIC_MODEL` must support web search. If it does not, the
  same plain message appears. No new environment variable is needed.

## Verification

- Automated (owner runs `npm test`): new tests for the client (tool attached
  with `max_uses`, narration dropped, sources de-duplicated and http(s)-only,
  `pause_turn` continuation and its bounded loop, search errors), the gateway
  (cap cannot be raised by the client, addendum + date only when searching,
  400 "web search not enabled" message, failed-search warning, timeouts), the
  stream (keep-alive padding, errors in body, no leaked exception text), the
  schema (`webSearch` flag, narration tolerance) and the prompt sync.
- Authoring-environment check: the new/changed `api/` code and tests were
  type-checked with `tsc --strict` and the API test files were run with a
  small stand-in test runner (92 of 93 tests ran green; the one failure was a
  missing matcher in the stand-in, not a product failure). The real
  `npm run build` / `npm test` result is the owner's, and the `src/` change
  could not be type-checked here.
- **Not verified:** a real search against the live API (needs the owner's key
  and a Preview deployment). Manual check: on the Preview, open a trip's
  Concierge, ask "find 3 hotels in Shinjuku under ¥15,000/night", expect a
  wait of up to a minute or two, a reply with URLs and `estimate`/`stale`
  labels, a Sources list, and no proposal unless you asked for a trip change.

## Known limitations

- A search turn cannot be saved to Stay Hunter / Food Hunter from chat yet
  (Step B). The Concierge says so and points to those screens.
- Latency: roughly 10–60 s per research message.
- The keep-alive pads the response with spaces; any proxy that buffers the
  whole response would defeat it (Vercel does not).
- Search quality is whatever the web returns; the prompt makes the AI label
  and cite, it cannot make a snippet price current.
