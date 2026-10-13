# Prompts

Version-controlled source of the behavior the NK Travel Agent chat-based
assistant already had, established and exercised in chat **before** this
app existed, migrated here per the master prompt's Phase 3 instruction to
"review the available existing Claude prompts and research workflows,
then migrate the approved instructions into version-controlled prompt
files."

The migration source was `/docs/EXISTING_AGENT_CAPABILITIES.md` (written
in Phase 1, itself captured from the original chat prompts — the NK
Travel Agent master prompt, the NK Couple Travel Profile, and the Boracay
honeymoon trip-specific prompt) plus the master prompt's own AI/research
safeguards section. Nothing here is newly invented behavior.

## Files

- `system-prompt.md` — the assistant's core identity and the hard rules
  it must follow: proposals only (never a direct database write),
  distinguishing verified/estimate/stale/unknown data, never inventing
  prices/availability/reviews, and what it can and can't structurally
  change in this app yet.
- `response-schema.md` — the exact JSON contract the model's response
  must follow, so the server can parse it safely. This is the
  "structured response schemas" piece of Phase 3.
- `couple-travel-profile.md` — the original "Prompt 2" (NK Couple Travel
  Profile) text, kept here as the canonical provenance record. The
  *live* version of this data is the `travelerProfiles` IndexedDB record
  seeded in `src/db/repositories/travelerProfilesRepo.ts` — editable by
  the couple from the app's Profile screen. This file is the historical
  source it was seeded from, not a second source of truth.
- `web-search.md` — the Phase 8 addendum described below; appended to the
  runtime prompt only when web search is on for that message.
- `modes/*.md` — one file per mode the chat-based agent already had
  (Stay Hunter, Food Hunter, Itinerary Planner, Budget Planner,
  Transportation Planner, Decision Support). `api/_lib/systemPrompt.ts`
  concatenates these into the actual runtime system prompt.

## What's wired in vs. documented only

All of the above **is** wired into the live Phase 3 AI gateway
(`api/_lib/systemPrompt.ts` is kept in sync with these files word-for-
word — see the comment at the top of that file for why it's a duplicate
rather than a runtime file read).

What's **not** wired in, and explicitly out of scope for Phase 3 per the
owner's instruction ("do not build every research integration"):

- **Update (Phase 8, owner-approved):** the Concierge can now search the
  web through Anthropic's server-side `web_search` tool, when the person
  leaves "Search the web" switched on. `web-search.md` is an addendum that
  is appended to the system prompt **only on those turns**; it overrides
  the "no live access" wording below for that turn. It does not make
  Agoda/Booking.com/Airbnb searchable (see the next point) and search
  results are never labelled `verified`. When search is off, the prompt is
  exactly what it was before. See `docs/PHASE_8_WEB_SEARCH.md`.
- Any live external research/booking API (Agoda, Booking.com, Airbnb,
  Klook, government fee sites, etc.). `EXISTING_AGENT_CAPABILITIES.md`
  already confirmed, from direct testing during the Boracay trip, that
  Agoda/Booking.com/Airbnb have no public search API and resist
  automated price/availability lookups — this is a **confirmed-
  unavailable** access, not an oversight. Live pricing stays a manual
  research/paste workflow, as already decided in Phase 1. The mode
  prompts below instruct the model accordingly: it can reason, compare,
  and structure what the user pastes in, but it must never claim to have
  looked up a live price or availability itself.
- Itinerary days/items, expenses, bookings, research sources, and
  reminders as AI-proposable entities — those modules have no repository
  or UI yet (still Phase 2 scope boundaries), so the model is explicitly
  told it can only propose changes to a trip's own fields or its
  per-trip override, nothing else, until a later phase adds the rest.

## Keeping the `.md` files and `systemPrompt.ts` in sync

`api/_lib/systemPrompt.ts` embeds this content as a plain TypeScript
string constant rather than reading these files from disk at request
time. That's a deliberate reliability choice, not an oversight: Vercel's
Edge runtime (and, generally, serverless bundling) doesn't guarantee a
file outside the function's own traced import graph is present at
runtime, since `fs.readFileSync` calls aren't statically traceable the
way `import`/`require` are. A missing-file error at 2am in production,
undetectable from local dev, was judged a worse risk than this
duplication. If this becomes a maintenance problem, a build-time script
that generates `systemPrompt.ts` from these `.md` files (checked by a
test that fails if they drift) would remove the duplication — not done
here to keep Phase 3's scope contained.
