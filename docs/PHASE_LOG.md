# Phase Log

Running record of phase completion reports, per master prompt §12. Each
entry is written at the time the phase is attempted — including when it's
blocked — not rewritten afterward to look cleaner.

---

## Phase 1 — Pure scaffold

**Status:** ✅ VERIFIED AND COMPLETE. Repo:
https://github.com/monja14-dev/nk-travel-agent (branch `main`).

**Context:** attempted first from the cloud sandbox session; blocked
because that sandbox's egress policy returns 403 for `registry.npmjs.org`
(confirmed via direct proxy test, not assumed). No device shell tool was
available on the linked computer either, so files were written here and
pushed to the device via the file-commit bridge, with verification handed
to the owner to run locally.

**Features implemented:**

- Project scaffold: Vite + React 18 + TypeScript, Tailwind CSS, PostCSS.
- IndexedDB schema v1 (`src/db/schema.ts`): `Trip`, `TravelerProfile`,
  `TripOverride`, `ItineraryDay`, `ItineraryItem`, `Expense`, `Booking`,
  `ResearchSource`, `Reminder`, `ChangeLogEntry`, `BackupMeta`. Every
  mutable record carries `revision`/`createdAt`/`updatedAt`.
- Migration runner (`src/db/migrations.ts`): versioned, additive-only,
  refuses to open the db if a version has no registered migration rather
  than silently skipping it.
- DB client (`src/db/client.ts`): singleton open, four status states
  (`idle`/`loading`/`ready`/`error`/`read-only`), write-gating
  (`withWriteTransaction` throws if status isn't `ready`), `blocked`/
  `blocking`/`terminated` handlers so a second tab or a dropped connection
  can't silently corrupt data.
- Minimal `App.tsx` shell showing the four states — intentionally not a
  feature screen.
- One real vitest file (`src/db/__tests__/client.test.ts`) against
  `fake-indexeddb`: opens the db, confirms schema version, round-trips a
  `Trip` record.
- Documentation required before/alongside this phase:
  `/docs/EXISTING_AGENT_CAPABILITIES.md`,
  `/docs/TAIWAN_WORKBOOK_SCHEMA.md`.

**Files created:** see the file tree committed alongside this log —
`package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`,
`vitest.setup.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`,
`src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/db/*`,
`src/modules/README.md`, this file, and the two docs above.

**Database/schema changes:** new, schema version 1 (first version — not a
migration from anything).

**Tests actually executed:** **none yet, by me.** `npm install`,
`npm run build`, and `npm run test` could not be run from either available
shell (cloud sandbox: npm registry blocked by egress policy; linked
device: no shell tool present). Owner must run them locally — see Manual
QA below — and report the real output before this phase can be marked
verified.

**Production build result:** not attempted (same reason).

**Known issues and limitations:**

- Unverified: this scaffold has never been compiled or type-checked. It's
  written carefully and consistently, but "carefully written" is not the
  same as "proven to build" — treat every claim above about what it does
  as a design intent until the build/test output says otherwise.
- No git repository initialized yet, and no GitHub repo created — the
  Claude session's GitHub access here is scoped to pre-connected
  repositories only and cannot create a new one.
- No Vercel project, no deployment, no `.env` handling yet — out of scope
  for Phase 1 by design.

**Backup/checkpoint:** none (nothing to check in yet — see Manual QA).

**Manual QA steps for the owner:**

1. Open a terminal in `C:\Projects\nk-travel-agent`.
2. `npm install` — report any errors verbatim.
3. `npm run test` — should run 3 passing tests in
   `src/db/__tests__/client.test.ts`. Report pass/fail and any output.
4. `npm run build` — should produce a `dist/` folder with no TypeScript
   errors. Report pass/fail and any output.
5. `npm run dev` — open the shown local URL; the page should say
   "Local database ready." within a second. Report what you actually see.
6. If all four pass: `git init`, commit, create an empty GitHub repo under
   `monja14-dev` (e.g. `nk-travel-agent`), add it as `origin`, push. Tell
   me the repo URL so it's on record for Phase 2.

**Next step requiring approval:** the results of steps 2–5 above. Phase 2
(whatever it is — likely the Trips module or Vercel deploy wiring) does
not start until Phase 1 is reported as actually green.

---

### Phase 1 — verification log

- `npm install`: **passed** (166 packages). Noted, not yet acted on: 13
  `npm audit` findings (2 critical) and esbuild's postinstall script was
  skipped by npm's install-scripts gate — owner ran
  `npm install-scripts approve esbuild` to cover it.
- `npm run test`: **passed**, all 3 tests in `client.test.ts` green, for
  real (owner ran it, pasted actual vitest output).
- `npm run build`, attempt 1: **failed**, 6 real TypeScript errors:
  1. `vitest.config.ts` imported `defineConfig` from `"vite"` instead of
     `"vitest/config"`, so TS didn't recognize the `test` field.
  2. `src/db/client.ts`'s `withWriteTransaction` was generic over an
     externally-bound array-of-keys type parameter, then forwarded that
     opaque generic into idb's own overloaded `.transaction()` — a known
     TS inference dead end when a generic array type is passed through a
     second generic function. Fixed by dropping the extra generic layer
     and using a concrete exported `StoreName[]` type instead.
  3. `src/db/migrations.ts` had `tx` typed as plain `string[]` instead of
     the real store-name union — a straightforward bug, not a TS
     limitation. Fixed to use the same `StoreName` type as client.ts.
- `npm run build`, attempt 2: **failed**, 5 remaining errors — the
  `StoreName` fix from attempt 1 didn't actually work. `keyof
  NkTravelAgentDB & string` collapsed to plain `string` rather than the
  literal union of store names, because `NkTravelAgentDB` extends idb's
  `DBSchema`, which carries a string index signature that absorbs the
  specific keys under `keyof` — confirmed directly from the compiler's own
  error output, not assumed. Fixed by writing the `StoreName` union out
  explicitly (11 literals) instead of deriving it.
- `npm run build`, attempt 3: **passed**. `tsc -b` clean, `vite build`
  produced `dist/` (index.html, ~6.3kB CSS, ~149kB JS before gzip) in
  1.45s. Owner ran this, pasted real output.

This is the expected shape of Phase 1 — written code had real compile
errors across two rounds, including one case where my own fix was wrong
on the first try. Each fix traces to an exact compiler error in the
owner's pasted output, not a guess.

- `npm run dev`: **passed** — owner confirmed the browser showed "Local
  database ready." (screenshot).
- Git/GitHub: `git init`, root commit, then amended once to remove 6
  accidentally-tracked build artifacts (`tsconfig.tsbuildinfo`,
  `tsconfig.node.tsbuildinfo`, `vite.config.js`/`.d.ts`,
  `vitest.config.js`/`.d.ts` — root cause: `tsconfig.node.json` initially
  lacked any output redirection, and a referenced/composite TS project
  cannot set `noEmit` at all (TS6310) — fixed by giving it its own
  `outDir` under `node_modules/`, which is already gitignored). Final
  local `git status`: clean. Pushed to
  `https://github.com/monja14-dev/nk-travel-agent`, branch `main`,
  31 objects — confirmed via the owner's pasted push output, not assumed.

**Phase 1 is closed.** Next phase (likely Vercel deploy wiring, or the
Trips module) requires explicit approval per the master prompt before
starting.

---

## Phase 2 — Trips, traveler profiles, per-trip overrides

**Status:** ✅ VERIFIED AND COMPLETE. Same repo/branch as Phase 1.

**Context:** scope was explicitly set by the owner: "Build the dashboard,
trip creation/editing, duplication, archiving, trip details, traveler
profiles and per-trip preference overrides... Do not connect AI or build
the full itinerary module yet." Same cloud-sandbox + device-bridge
workflow as Phase 1 (no npm registry access in the sandbox, no shell tool
on the linked device) — code was written and pushed here, then
`npm run test`, `npm run build`, and interactive manual QA were all run by
the owner locally and reported back verbatim, not assumed.

**Features implemented:**

- **Trips repository** (`src/db/repositories/tripsRepo.ts`): `listTrips`
  (sorted by start date, archived filtered out unless requested),
  `getTrip`, `createTrip`/`updateTrip` (both validated via
  `modules/trips/validation.ts`, both revision-checked on update),
  `archiveTrip`/`unarchiveTrip`, `duplicateTrip` (new id, "(Copy)" name,
  `structuredClone`s the trip and its override so the copy shares no
  object/array references with the original — the actual mechanism behind
  "no leakage between trips").
- **Traveler profile repository** (`travelerProfilesRepo.ts`): single
  well-known record (`DEFAULT_PROFILE_ID`) seeded with the real Couple
  Travel Profile content from chat, `getOrCreateDefaultProfile` (race-safe
  — re-checks inside the write transaction before seeding), revision-
  checked `updateProfile`.
- **Trip override repository** (`tripOverridesRepo.ts`): `getOverrideForTrip`
  via the `by-trip` index, `upsertOverrideForTrip` (create-or-update,
  revision-checked once one exists), `clearOverrideForTrip` (idempotent).
- **Profile inheritance** (`modules/trips/effectiveSettings.ts`): pure,
  DB-free `getEffectiveTripSettings(profile, override)` merging a trip's
  settings from the couple profile plus an optional override, with
  per-field `"override" | "app-default"` source tags for the UI to show.
- **Backup/restore** (`src/db/backup.ts`): `exportBackup` (generic over
  `ALL_STORE_NAMES`, so a future store is included automatically),
  `restoreBackup` (validates shape before touching anything, takes a
  safety backup of current data, then replaces every store's contents
  inside one transaction). Implemented and tested; **not yet wired to any
  UI control** — see Known issues below.
- **UI** (all new): `Dashboard` (active/archived trip list with
  loading/empty/error states), `TripForm` (shared create/edit, inline
  per-field validation), `TripDetails` (trip summary, Effective
  Preferences panel with source badges, Edit/Duplicate/Archive-
  Unarchive/Edit-preferences actions), `TripOverrideForm` (per-trip
  override editor + Clear override), `ProfileForm` (couple profile
  editor). Navigation is a plain `View` discriminated union
  (`src/navigation/types.ts`) switched via React state in `App.tsx` —
  deliberately no router dependency added, per the master prompt's
  preference for the smaller verified implementation.
- **Change log:** every trip/override create/update/delete is recorded
  via `buildChangeLogEntry` in the same transaction as the mutation
  (`changeLogHelper.ts`).

**Files created/changed:**

- New: `src/lib/id.ts`, `src/lib/time.ts`, `src/modules/trips/validation.ts`,
  `src/modules/trips/effectiveSettings.ts`,
  `src/db/repositories/changeLogHelper.ts`,
  `src/db/repositories/tripsRepo.ts`,
  `src/db/repositories/travelerProfilesRepo.ts`,
  `src/db/repositories/tripOverridesRepo.ts`, `src/db/backup.ts`,
  `src/navigation/types.ts`, `src/modules/trips/Dashboard.tsx`,
  `src/modules/trips/TripForm.tsx`, `src/modules/trips/TripDetails.tsx`,
  `src/modules/trips/TripOverrideForm.tsx`,
  `src/modules/profile/ProfileForm.tsx`.
- Changed: `src/lib/errors.ts` (added `InvalidBackupError`),
  `src/db/client.ts` (generalized the write-gate into exported
  `getReadyDb`, added `StoreName`/`ALL_STORE_NAMES`), `src/db/index.ts`
  (barrel exports for the above), `src/App.tsx` (added navigation on top
  of the unchanged Phase 1 db-status gate).
- Tests (all new): `modules/trips/__tests__/validation.test.ts`,
  `modules/trips/__tests__/effectiveSettings.test.ts`,
  `modules/trips/__tests__/profileInheritance.integration.test.ts`,
  `db/repositories/__tests__/testSupport.ts`,
  `db/repositories/__tests__/tripsRepo.test.ts`,
  `db/repositories/__tests__/travelerProfilesRepo.test.ts`,
  `db/repositories/__tests__/tripOverridesRepo.test.ts`,
  `db/repositories/__tests__/reloadPersistence.test.ts`,
  `db/__tests__/backup.test.ts`.

**Database/schema changes:** none. Still schema version 1 — Phase 2 is
pure application logic on top of the Phase 1 schema; no new stores or
indexes.

**Tests actually executed:** real, pasted by the owner — `npm run test`,
9 test files, **51 tests, all passing**:

```
 ✓ src/db/__tests__/backup.test.ts (4)
 ✓ src/db/__tests__/client.test.ts (3)
 ✓ src/modules/trips/__tests__/effectiveSettings.test.ts (3)
 ✓ src/modules/trips/__tests__/profileInheritance.integration.test.ts (3)
 ✓ src/modules/trips/__tests__/validation.test.ts (8)
 ✓ src/db/repositories/__tests__/reloadPersistence.test.ts (3)
 ✓ src/db/repositories/__tests__/travelerProfilesRepo.test.ts (6)
 ✓ src/db/repositories/__tests__/tripOverridesRepo.test.ts (6)
 ✓ src/db/repositories/__tests__/tripsRepo.test.ts (15)

 Test Files  9 passed (9)
      Tests  51 passed (51)
   Duration  6.46s
```

Coverage includes the specific things the owner asked for by name: CRUD
(`tripsRepo.test.ts`), reload persistence via a simulated app reload —
`vi.resetModules()` + dynamic re-`import()`, not just re-calling a
function (`reloadPersistence.test.ts`), profile inheritance through real
repos and real IndexedDB, not just the pure-function unit test
(`profileInheritance.integration.test.ts`), per-trip overrides including
a dedicated cross-trip isolation test on the `by-trip` index
(`tripOverridesRepo.test.ts`), duplication including a no-shared-
references test (`tripsRepo.test.ts`), archiving, and backup round-trips
including a validation-rejection-leaves-data-untouched test
(`backup.test.ts`).

**Production build result:** real, pasted by the owner — `tsc -b &&
vite build`:

```
vite v5.4.21 building for production...
✓ 51 modules transformed.
dist/index.html                   0.40 kB
dist/assets/index-CAWUpQ30.css    9.73 kB │ gzip:  2.57 kB
dist/assets/index-CAEl8a6z.js   179.56 kB │ gzip: 55.15 kB
✓ built in 1.08s
```

Clean on the first attempt this time — no new TypeScript errors, unlike
Phase 1's two failed rounds. (Several known idb/TS generics pitfalls from
Phase 1 were deliberately avoided up front: e.g. a generic field-updater
in the three form components casts its spread result to the concrete form
type, because TS widens a computed property keyed by a generic type
parameter to an index signature rather than preserving the literal-key
structure.) No new npm packages were added this phase, so `npm install`
was not re-run.

**Manual QA actually performed:** real, interactive, in the running dev
app (`npm run dev`) — not just automated test coverage. Nine scripted
steps, all confirmed by the owner against the actual running UI:

1. Dashboard shows the correct empty state on first load.
2. Created a trip ("Japan Trip") — landed on its own details page.
3. Details page showed the inherited couple-profile defaults with
   "app default" badges before any override existed.
4. Saved a trip override (budget 40000–60000 PHP, amenity "Pool") — the
   same fields immediately showed "trip override" badges.
5. Navigated away (dashboard) and back — override still there, confirming
   it's real IndexedDB data, not component state.
6. Duplicated the trip — landed directly on "Japan Trip (Copy)" with the
   override already carried over.
7. Edited the duplicate's override (changed the amenity) — the
   **original's** override was confirmed unaffected. This is the
   interactive confirmation of the "no leakage between trips" requirement,
   on top of the automated test for it.
8. Archived the original trip — disappeared from the default list,
   reappeared under "Show archived trips," unarchive restored it.
9. Edited the couple profile (changed pace) and did a full browser
   reload (F5, not just in-app navigation) — the edit was still there,
   confirming it's written to IndexedDB rather than held in memory.

**Known issues and limitations:**

- No itinerary, expenses, bookings, research sources, or reminders UI —
  those stores exist in the schema since Phase 1 but have no repository
  or screen yet. Explicitly out of scope for Phase 2 per the owner's
  instructions.
- No AI integration of any kind — explicitly out of scope for Phase 2.
- Navigation is plain React state with no URL routing: a browser refresh
  always returns to the dashboard rather than preserving the current
  trip's view. Acceptable for this phase's scope (confirmed working as
  designed in manual QA step 9, which relies on this exact behavior to
  prove persistence); worth revisiting if a later phase wants
  deep-linking to a specific trip.
- `tripOverridesRepo` has no field-level validator of its own (unlike
  `tripsRepo`). Budget min/max and numeric-parsing checks live only in
  `TripOverrideForm.tsx` at the UI boundary — a deliberate scope choice
  documented in that file's comments, so the already-tested repo contract
  didn't need to change. This means a future second caller of
  `upsertOverrideForTrip` (e.g. an AI proposal in a later phase) would
  need its own validation before calling it; flagging now rather than
  leaving it implicit.
- `exportBackup`/`restoreBackup` are implemented and covered by automated
  tests (round-trip, and validation-rejection-leaves-data-untouched), but
  there is no "Export backup" / "Restore from file" control anywhere in
  the UI yet. The logic is verified; the UI surface for it is not built.
- Still no Vercel deployment — local-only, as expected at this stage.

**Backup/checkpoint:** `exportBackup`/`restoreBackup` exist and are
tested (see above) but aren't reachable from the UI yet — there is
nothing new to manually check in beyond what git already tracks.

**Next step requiring approval:** Phase 2 is complete and verified with
real evidence at every layer — automated tests (51/51), a clean
production build, and a full interactive manual QA pass against the
running app, all reported by the owner rather than assumed. Phase 3 —
candidates include the full itinerary module, a backup/restore UI, AI
research/integration, or Vercel deploy wiring — does not start until the
owner explicitly approves which one, per the master prompt's incremental-
phase rule.

---

## Phase 3 — Secure AI gateway, proposal-only chat

**Status:** ✅ VERIFIED AND COMPLETE. Same repo/branch as Phases 1–2
(not yet re-pushed to GitHub as of this entry — see Next step below).

**Context:** scope was set verbatim by the owner: migrate the existing
chat-based prompts into version-controlled files; build a secure
server-side AI gateway on a Vercel-supported runtime with credentials
server-side only; add request validation, structured response schemas,
timeouts, error states, and limits; connect a basic chat UI to the active
trip context where the AI can only ever produce proposals, never direct
writes, with preview, revision-conflict checking, and required approval;
test the full matrix (valid responses, malformed output, missing
credentials, timeouts, provider failures, stale proposals, cancellation);
verify no credential leakage into the browser bundle; do not build every
research integration; report any unavailable API access; run tests and
build; stop for approval. Same cloud-sandbox + device-bridge workflow as
Phases 1–2 (no npm registry access in the sandbox) — code was written and
pushed here, then `npm install`/`npm run test`/`npm run build` and the
bundle-leak check were all run by the owner locally and reported back
verbatim.

**Features implemented:**

- **Prompt migration** (`/prompts/*.md`): the chat-based agent's existing
  behavior, captured in `docs/EXISTING_AGENT_CAPABILITIES.md` back in
  Phase 1, migrated into version-controlled files — `system-prompt.md`
  (core identity and hard rules: proposals only, never invent
  prices/availability/reviews, label every factual claim
  verified/estimate/stale/unknown), `response-schema.md` (the exact JSON
  contract), `couple-travel-profile.md` (the original Prompt 2 text,
  recovered verbatim, kept as provenance — the live source of truth is
  still the `travelerProfiles` IndexedDB record), and `modes/*.md` (Stay
  Hunter, Food Hunter, Itinerary Planner, Budget Planner, Transportation
  Planner, Decision Support). See `prompts/README.md` for what's wired in
  versus documented-only.
- **AI gateway** (`api/ai-chat.ts` + `api/_lib/*`): a Vercel Edge Function
  (not Node serverless — avoids a new `@vercel/node` dependency, and Edge
  only needs `fetch`/`Request`/`Response`/`process.env`, all of which
  Vercel's Edge runtime supports). `api/ai-chat.ts` is the *only* file in
  the project allowed to read `process.env.ANTHROPIC_API_KEY` /
  `ANTHROPIC_MODEL`; everything else (`schemas.ts`, `anthropicClient.ts`,
  `gateway.ts`) is plain, credential-free TypeScript exercised directly by
  vitest with a mocked `fetch`, so the whole request/validate/call/parse
  pipeline is tested without any real network call or real key.
- **Request validation & limits** (`schemas.ts`): hand-rolled (no new
  dependency, matching `modules/trips/validation.ts`'s style) — rejects a
  malformed body with field-level errors, caps message length (4000
  chars), history length (20 turns) and per-turn length (4000 chars),
  request body size (100KB), and proposals per response (5, with excess
  dropped and reported as a warning rather than failing the turn).
- **Structured response parsing** (`schemas.ts`): a response with no
  usable `reply` throws (unrecoverable); an individual malformed proposal
  within an otherwise-valid response is dropped and reported via
  `warnings[]` rather than failing the whole turn. Only two proposal
  kinds are recognized — `trip-update` and `trip-override-upsert` —
  matching exactly what Phase 2 built; nothing itinerary/expense/booking-
  related is proposable yet, since those modules don't exist.
- **Timeout & cancellation** (`anthropicClient.ts`): an internal,
  timeout-driven `AbortController` composed with the incoming request's
  own cancellation signal, distinguishing "the AI was too slow"
  (`ProviderTimeoutError` → 504) from "the person clicked Cancel"
  (`RequestCancelledError` → 499) from a real provider/network failure
  (`ProviderError` → 502, real detail logged server-side only, never
  forwarded to the client).
- **Proposal preview & apply** (`src/modules/ai/previewProposal.ts`,
  `applyProposal.ts`): before a proposal can be approved, it's checked
  fresh against live IndexedDB — not the snapshot the AI saw — producing
  a field-by-field from/to diff and a staleness flag. Approving routes
  through the exact same revision-checked `updateTrip`/
  `upsertOverrideForTrip` functions every other write in the app uses;
  the AI gets no write path of its own. A proposal whose expected
  revision has moved on is blocked, with the record left exactly as it
  actually is — never reverted, never corrupted.
- **Chat UI** (`src/modules/ai/AiChatPanel.tsx`, reachable via a new "Ask
  NK AI" button on Trip Details): sends the trip's live context (trip,
  couple profile, override, each with its revision) plus recent history
  on every turn, re-reading fresh data immediately before sending so an
  earlier approved proposal in the same conversation can't make the next
  one look falsely stale. Shows the AI's reply, any proposals as cards
  with an Approve/Reject per proposal, and a Cancel button while a
  request is in flight.

**Files created/changed:**

- New prompt files: `prompts/README.md`, `prompts/system-prompt.md`,
  `prompts/response-schema.md`, `prompts/couple-travel-profile.md`,
  `prompts/modes/{stay-hunter,food-hunter,itinerary-planner,
  budget-planner,transportation-planner,decision-support}.md`.
- New gateway files: `api/ai-chat.ts`, `api/_lib/systemPrompt.ts`,
  `api/_lib/schemas.ts`, `api/_lib/anthropicClient.ts`,
  `api/_lib/gateway.ts`, `api/_lib/env.d.ts` (a narrow ambient
  declaration for the one global Vercel's Edge runtime actually provides
  — `process.env` — added instead of pulling in all of `@types/node`'s
  globals, which would risk colliding with the `DOM` lib's own
  `fetch`/`Request`/`Response` types already used here).
- New gateway tests: `api/_lib/__tests__/{systemPrompt,schemas,
  anthropicClient,gateway,noClientLeak}.test.ts`.
- New client-side AI module: `src/modules/ai/{types,buildContext,
  previewProposal,applyProposal}.ts`, `src/modules/ai/AiChatPanel.tsx`,
  and their tests in `src/modules/ai/__tests__/`.
- Changed: `src/navigation/types.ts` (added the `trip-ai` view),
  `src/modules/trips/TripDetails.tsx` (added the "Ask NK AI" button),
  `src/App.tsx` (wired the new view), `tsconfig.json` (added the new
  `tsconfig.api.json` project reference).
- New config: `tsconfig.api.json` (so `tsc -b` type-checks `api/`),
  `.env.example` (documents `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`).
- Changed (unrelated fix, found by running the real test suite — see
  verification log below): `src/db/repositories/__tests__/tripsRepo.test.ts`
  (one pre-existing Phase 2 test had a timing flake, unrelated to this
  phase's code).
- `package.json`: added `@types/node` as a devDependency (the first
  phase needing real Node type definitions — for the gateway tests'
  `node:fs`/`node:path`/`node:url` imports; the bare `process` global
  itself is covered by `env.d.ts`, not by this).

**Database/schema changes:** none. Still schema version 1 — the gateway
is deliberately stateless and never touches IndexedDB; only the client
(already-existing Phase 2 repos) writes anything, and only after a human
approves.

**Tests actually executed:** real, pasted by the owner, across two
rounds (see verification log below for what failed and why) — final
result, `npm run test`, 17 test files, **118 tests, all passing**:

```
 ✓ api/_lib/__tests__/anthropicClient.test.ts (10)
 ✓ api/_lib/__tests__/gateway.test.ts (11)
 ✓ api/_lib/__tests__/noClientLeak.test.ts (3)
 ✓ api/_lib/__tests__/schemas.test.ts (18)
 ✓ api/_lib/__tests__/systemPrompt.test.ts (8)
 ✓ src/db/__tests__/backup.test.ts (4)
 ✓ src/db/__tests__/client.test.ts (3)
 ✓ src/db/repositories/__tests__/reloadPersistence.test.ts (3)
 ✓ src/db/repositories/__tests__/travelerProfilesRepo.test.ts (6)
 ✓ src/db/repositories/__tests__/tripOverridesRepo.test.ts (6)
 ✓ src/db/repositories/__tests__/tripsRepo.test.ts (15)
 ✓ src/modules/ai/__tests__/applyProposal.test.ts (8)
 ✓ src/modules/ai/__tests__/buildContext.test.ts (4)
 ✓ src/modules/ai/__tests__/previewProposal.test.ts (5)
 ✓ src/modules/trips/__tests__/effectiveSettings.test.ts (3)
 ✓ src/modules/trips/__tests__/profileInheritance.integration.test.ts (3)
 ✓ src/modules/trips/__tests__/validation.test.ts (8)

 Test Files  17 passed (17)
      Tests  118 passed (118)
```

Coverage against the owner's explicit test matrix: valid responses
(`gateway.test.ts`), malformed output — unparseable text and a missing
`reply` field (`schemas.test.ts`, `gateway.test.ts`), missing credentials
— missing key and missing model, each confirmed to never call the
provider and never leak the key string in the error body
(`gateway.test.ts`), timeouts (`anthropicClient.test.ts`,
`gateway.test.ts`), provider failures — non-ok HTTP status (with the real
error detail confirmed absent from the client-facing body) and a thrown
network error (`anthropicClient.test.ts`, `gateway.test.ts`), stale
proposals — a trip-update whose revision has moved on, an override
proposal expecting "doesn't exist yet" when one now does, and an override
proposal whose revision has moved on, each confirmed to leave the real
record exactly as it actually is (`applyProposal.test.ts`,
`previewProposal.test.ts`), and cancellation — both mid-flight and
pre-aborted (`anthropicClient.test.ts`, `gateway.test.ts`). The
credential-leak guard (`noClientLeak.test.ts`) walks every file under
`src/` and asserts zero imports resolving into `api/` and zero
`process.env.ANTHROPIC` references — I independently re-ran the same
check myself with a standalone script before this was ever pushed, not
just trusting the test file's own logic.

**Production build result:** real, pasted by the owner, across two
rounds (see verification log below) — final result, `tsc -b && vite
build`:

```
vite v5.4.21 building for production...
✓ 55 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.27 kB
dist/assets/index-CB9G_TTI.css   10.49 kB │ gzip:  2.70 kB
dist/assets/index-D-LGeoqU.js   189.57 kB │ gzip: 57.52 kB
✓ built in 996ms
```

**Credential-leak check against the real built output:** the owner ran
`Select-String -Path "dist\assets\*.js" -Pattern "ANTHROPIC"` against the
actual `dist/` from the build above — zero matches, confirmed. This is
the real-world proof behind the structural guarantee `noClientLeak.test.ts`
already checks at the source level.

**Manual QA actually performed / explicitly not possible this phase:**

- The credential bundle check above is real, interactive verification
  against the actual built output — not assumed.
- **Full interactive chat QA (sending a real message, getting a real AI
  reply) was not performed and could not be performed this phase.**
  Unlike Phases 1–2, `/api/ai-chat` is a Vercel Edge Function with no
  plain-Vite equivalent — `npm run dev` does not serve it at all. Real
  interactive testing needs either the Vercel CLI's `vercel dev` or an
  actual Vercel deployment, both with a real `ANTHROPIC_API_KEY`
  configured — neither exists yet. I also have no Anthropic API key
  available in this session, so no live call to the real provider has
  been made from my side either. The automated test suite above (which
  mocks the network call) is what verifies the gateway's own correctness
  in lieu of this, and is what the owner's test matrix instruction maps
  onto directly.

**Unavailable API access (reported per the owner's explicit
instruction):**

1. Agoda, Booking.com, and Airbnb have no public search API and actively
   resist automated price/availability lookups — confirmed by direct
   testing during the Boracay trip research, recorded in
   `docs/EXISTING_AGENT_CAPABILITIES.md` back in Phase 1, and re-surfaced
   into the mode prompts this phase. No live research/booking integration
   was built, by design — this stays a manual research/paste workflow.
2. I have no Anthropic API key in this cloud sandbox, so no live
   end-to-end call to the real Anthropic API has been or could be made
   from my side. All gateway correctness (request validation, response
   parsing, error mapping, timeout/cancellation handling) is verified via
   mocked-fetch tests instead, per the point above.

**Known issues and limitations:**

- Only two proposal kinds exist — `trip-update` and
  `trip-override-upsert` — because those are the only two things Phase 2
  built a revision-checked write path for. The AI cannot propose
  itinerary days, expenses, bookings, research sources, or reminders;
  `prompts/modes/itinerary-planner.md` says so explicitly so the model
  doesn't imply otherwise to the couple.
- Conversation history is held only in React state (`AiChatPanel.tsx`) —
  it resets on navigation away or page reload, unlike every other piece
  of data in this app, which is IndexedDB-backed. Acceptable for this
  phase's scope (the gateway itself is correctly stateless by design);
  worth revisiting if persistent chat history is ever wanted.
- No "regenerate" or "retry" action on a failed send — the person has to
  retype their message. Minor UX gap, not a correctness issue.
- As with Phase 2's override repo, `applyProposal.ts` merges a *partial*
  AI-proposed override onto the current one (or sensible defaults),
  re-reading it fresh at apply time rather than trusting anything cached
  from earlier in the turn — the same "re-check immediately before
  writing" discipline used everywhere else in this phase.
- Still no Vercel deployment and no real Anthropic credentials configured
  anywhere — both required before the chat can actually be used, as
  called out above.
- Not yet re-pushed to GitHub as of this entry (Phase 1/2 were). Will be
  pushed once this report is in and the owner confirms Phase 3 is closed.

**Backup/checkpoint:** no new backup surface — the gateway never touches
IndexedDB, so Phase 2's existing `exportBackup`/`restoreBackup` already
covers everything an AI proposal can ever end up writing (it writes
through the same `tripsRepo`/`tripOverridesRepo` functions, nothing new).

**Next step requiring approval:** Phase 3 is complete and verified with
real evidence at every layer — automated tests (118/118, covering the
owner's full named test matrix), a clean production build, and a real
credential-leak check against the actual built bundle, all reported by
the owner rather than assumed. The one thing not verifiable this phase —
an actual live AI conversation — requires a real Anthropic API key and
either `vercel dev` or a Vercel deployment, neither of which exists yet;
that would be a reasonable first step of whatever comes next, alongside
whichever of the itinerary module, backup/restore UI, or Vercel deploy
wiring the owner wants to prioritize. Phase 4 does not start until the
owner explicitly approves which one, per the master prompt's incremental-
phase rule.

---

### Phase 3 — verification log

- `npm run test`, attempt 1: **17 test files run, 1 failed (117/118
  passing).** Every new Phase 3 test passed on the first try —
  `anthropicClient` (10), `gateway` (11), `noClientLeak` (3), `schemas`
  (18), `systemPrompt` (8), `applyProposal` (8), `buildContext` (4),
  `previewProposal` (5) — covering the owner's full named test matrix.
  The one failure was in `tripsRepo.test.ts`, a **pre-existing Phase 2
  test untouched this phase**: `createTrip` followed immediately by
  `updateTrip` landed in the same millisecond on the owner's machine, so
  `updatedAt` (millisecond-resolution `Date.toISOString()`) came out
  identical even though `revision` correctly bumped 1→2 — a test-timing
  flake, not a real data-integrity bug (nothing in the app relies on
  `updatedAt` for conflict detection; `revision` is the real mechanism,
  and it was correct). Fixed by adding a 2ms delay in that one test
  rather than touching production code relied on elsewhere.
- `npm run test`, attempt 2: **passed, 118/118**, for real (owner ran it,
  pasted actual vitest output — reproduced in full above).
- `npm run build`, attempt 1: **failed, 10 real TypeScript errors**, all
  in new Phase 3 code:
  1. (6 errors) `node:fs`/`node:path`/`node:url` in the gateway's test
     files, and the bare `process` global in `api/ai-chat.ts`, had no
     type definitions — this is the first phase needing real Node types
     at all. Fixed by adding `@types/node` as a devDependency (owner ran
     `npm install`, confirmed 2 packages added) for the module imports,
     and a narrow local ambient declaration (`api/_lib/env.d.ts`) for
     just the one global actually used, instead of adding `"node"` to
     `tsconfig.api.json`'s `types` array — which would have pulled in
     `@types/node`'s own `fetch`/`Request`/`Response` globals and risked
     colliding with the `DOM` lib's versions of those same globals
     already relied on by `anthropicClient.ts`. (This specific collision
     risk was reasoned through, not hit and fixed after the fact — I
     can't run a real `tsc` in this sandbox to confirm either way, so the
     more conservative fix was chosen deliberately.)
  2. (2 errors) `api/_lib/schemas.ts`: `parseProposal`'s two proposal
     branches assign the generic helper `pickTypedChanges`'s result
     (necessarily `Partial<Record<K, unknown>>`, since the helper is
     generic over the field-name union) directly into a proposal's
     concretely-typed `changes` field. The helper already runtime-checks
     each value's type via `typeOf` before accepting it, but TypeScript
     has no way to carry that check's result into a narrower static type
     — fixed with an explicit assertion at exactly that trust boundary
     (`changes as TripUpdateProposal["changes"]` /
     `... TripOverrideProposal["changes"]`), not a blanket `as any`.
- `npm run build`, attempt 2: **passed.** `tsc -b` clean, `vite build`
  produced `dist/` (index.html, ~10.5kB CSS, ~190kB JS before gzip) in
  996ms. Owner ran this, pasted real output (reproduced in full above).
- Credential-leak check against the real `dist/` output
  (`Select-String -Path "dist\assets\*.js" -Pattern "ANTHROPIC"`):
  **zero matches**, confirmed by the owner.

This is the expected shape of a phase this size — written code had real
compile errors on the first build attempt, same as Phase 1. Every fix
above traces to an exact compiler error or test failure in the owner's
pasted output, not a guess; the one test failure and all ten build errors
were in code paths I had already manually reviewed line-by-line before
pushing, which is itself useful signal: manual review and static
verification scripts (both done before pushing this phase) catch a lot,
but real `tsc`/`vitest` execution still found things they didn't.

**Phase 3 is closed.** Next phase requires explicit approval per the
master prompt before starting.

---

## Phase 4 — Research adapters: accommodation comparison & Food Hunter

**Status:** ✅ VERIFIED AND COMPLETE. Same repo/branch as Phases 1–3.

**Context:** scope was set verbatim by the owner: build modular research
adapters for the accommodation and food workflows; preserve existing
Claude research behavior where accessible; integrate only providers for
which valid access is available; create normalized result schemas
covering prices, mandatory fees, cancellation conditions, ratings, review
volume, location, dishes, venue details, source URLs, retrieval
timestamps, and verification status; build the accommodation comparison
table and the five Food Hunter categories (must-try, local favorites,
hidden gems, budget eats, special occasions) with save-to-trip actions and
source attribution; clearly label estimates, unavailable fields, stale
data, and unverified information; never invent live prices, discounts, or
availability; do not bypass provider terms or assume unrestricted scraping
is permitted; test data normalization, missing fields, duplicate results,
source attribution, and provider failures; run tests and build; document
integration limitations; stop for approval.

Before writing any code, I asked the owner directly: no API credentials
for any accommodation/food provider exist in this session, and "integrate
only providers for which valid access is available" makes that the
controlling fact. The owner chose explicitly: **no live providers this
phase.** Everything below was built on that basis — one real, fully
working adapter (manual/pasted research) plus the adapter architecture a
future credentialed provider would plug into, rather than a stubbed-out
fake integration.

Same cloud-sandbox + device-bridge workflow as Phases 1–3 (no npm registry
access in the sandbox) — code was written and pushed here, then
`npm run test` and `npm run build` were run by the owner locally and
reported back verbatim, across two build attempts (see verification log
below).

**Features implemented:**

- **Normalized schemas** (`src/db/schema.ts`): `AccommodationResult`
  (name, property type, location, map URL, price/night + currency,
  `mandatoryFees[]`, cancellation policy, rating + scale, review count,
  notes) and `FoodResult` (name, one of the five fixed
  `FoodHunterCategory` values, `dishes[]`, cuisine, price range, location,
  map URL, rating + scale, review count, notes). Both embed a
  `ResultAttribution` (source label, optional source URL, retrieval
  timestamp, verification status) directly, matching the inline
  `sourceUrl`/`verifiedAt` pattern `ItineraryItem` already used since
  Phase 1, rather than reusing the thinner `ResearchSource` stub (topic/
  url/notes only — never used by any phase, and the wrong shape for
  structured comparison data). Every optional field (price, rating,
  cancellation policy, fee amounts, etc.) is left genuinely `undefined`
  when unresearched rather than defaulted to 0/empty — a fabricated
  default would misrepresent unresearched data as confirmed, which is the
  same "never invent" rule applied to the data model itself.
- **Adapter architecture** (`src/modules/research/adapters/`):
  `AccommodationAdapter`/`FoodAdapter` interfaces, each with
  `checkAvailability()` (the literal enforcement of "integrate only
  providers for which valid access is available" — a registry entry is
  only used when this reports `available: true`) and `normalize(raw)`
  (coerces loosely-typed input into the normalized schema, returning a
  discriminated-union `NormalizeOutcome` so a caller's TypeScript
  narrowing is unambiguous after checking `.ok`). Exactly one concrete
  adapter ships this phase — `manualAccommodationAdapter`/
  `manualFoodAdapter` — which formalizes the existing chat-based research
  workflow (you paste in what was researched; it validates, coerces
  numeric strings, and defaults attribution) without replacing it. No
  live provider (Google Places, Yelp, TripAdvisor, etc.) is stubbed in,
  by the owner's own explicit choice above — a disabled adapter with no
  real `normalize()` behind it would be dead code pretending to be a
  feature.
- **Validation** (`src/modules/research/validation.ts`): field-level
  validators for both result types — name required; property
  type/category must be a recognized value; URLs must look like URLs;
  a price requires a currency; fee amounts and ratings must be finite and
  non-negative, with a rating checked against its own stated scale;
  review counts must be non-negative integers; attribution's source label
  is required and its verification status must be one of the four known
  values. Called from inside each adapter (defense-in-depth) and
  independently again inside the repository's create function, matching
  the one-validator-called-from-multiple-layers pattern
  `modules/trips/validation.ts` already established.
- **Verification/staleness** (`src/modules/research/verification.ts`):
  `getDisplayVerificationStatus()` derives the displayed status at read
  time rather than trusting a stored value forever — anything over 30
  days old is shown as "may be outdated" regardless of how it was
  originally tagged, except "unknown," which is never demoted (it was
  never known in the first place, so age doesn't make it worse).
- **Duplicate detection** (`src/db/repositories/dedup.ts`): name-based,
  case/diacritic/punctuation-insensitive, scoped per trip. Food results
  are deliberately **not** scoped by category too — the same real-world
  venue showing up under two categories is still almost certainly the
  duplicate a person would want surfaced, not two distinct places.
- **Repositories** (`accommodationResultsRepo.ts`, `foodResultsRepo.ts`):
  `list*ForTrip`, `create*` (validates, checks for a duplicate, writes,
  logs the change — all inside one transaction), `delete*` (idempotent —
  silently no-ops on an already-gone id, matching Phase 2's
  `clearOverrideForTrip` precedent).
- **Save orchestration** (`src/modules/research/saveResult.ts`):
  `saveAccommodationResult`/`saveFoodResult` wrap an adapter's
  `normalize()` call in a try/catch — this is what lets a provider
  failure (an adapter that throws mid-call, the shape a future live
  adapter's network error would take) come back as a clean, typed
  `adapter-error` outcome instead of crashing the save flow — and map
  every outcome (saved / invalid / duplicate / adapter-error) to one
  typed union the UI switches on directly.
- **UI:** `AccommodationComparison.tsx` (a comparison table sorted by
  price, missing fields shown as "Not available"/"None known" rather than
  blank, a color-coded verification badge per row, an "Add an
  accommodation option" form) and `FoodHunter.tsx` (the five fixed
  category sections, always rendered even when empty, each item showing
  dishes/cuisine/price range/rating/source, an "Add a food find" form).
  Both reachable from new buttons on Trip Details.

**Files created/changed:**

- New: `src/db/repositories/dedup.ts`,
  `src/db/repositories/accommodationResultsRepo.ts`,
  `src/db/repositories/foodResultsRepo.ts`,
  `src/modules/research/validation.ts`,
  `src/modules/research/verification.ts`,
  `src/modules/research/saveResult.ts`,
  `src/modules/research/AccommodationComparison.tsx`,
  `src/modules/research/FoodHunter.tsx`,
  `src/modules/research/adapters/types.ts`,
  `src/modules/research/adapters/coerce.ts`,
  `src/modules/research/adapters/manualAccommodationAdapter.ts`,
  `src/modules/research/adapters/manualFoodAdapter.ts`,
  `src/modules/research/adapters/registry.ts`.
- New tests: `db/repositories/__tests__/{dedup,accommodationResultsRepo,
  foodResultsRepo}.test.ts`,
  `modules/research/__tests__/{verification,saveResult}.test.ts`,
  `modules/research/adapters/__tests__/{manualAccommodationAdapter,
  manualFoodAdapter,registry,assertNormalized}.test.ts` (the last of
  these, `assertNormalized.ts`, is a test-only type-narrowing helper, not
  a test file itself — see verification log below for why it exists).
- Changed: `src/db/schema.ts` (new types, `SCHEMA_VERSION` 1→2),
  `src/db/migrations.ts` (version-2 migration), `src/db/client.ts` (new
  store types, `StoreName`, `ALL_STORE_NAMES`), `src/lib/errors.ts`
  (added `DuplicateResultError`), `src/navigation/types.ts` (two new
  views), `src/modules/trips/TripDetails.tsx` (two new buttons),
  `src/App.tsx` (two new view branches).
- Changed (pre-existing Phase 2 test, fixed proactively before pushing —
  see verification log): `src/db/__tests__/backup.test.ts`'s
  "exportBackup covers every known store" test hardcoded an 11-store
  list; with two new stores this phase it would have failed for real.
  Fixed to compare against the live `ALL_STORE_NAMES` export instead, so
  it can't go stale again.

**Database/schema changes:** `SCHEMA_VERSION` 1→2. New migration adds two
stores, each with a `by-trip` index: `accommodationResults`,
`foodResults`. Purely additive — no existing store, index, or field was
touched, matching the migration runner's add-only rule from Phase 1.

**Tests actually executed:** real, pasted by the owner — `npm run test`,
25 test files, **180 tests, all passing**:

```
 ✓ api/_lib/__tests__/anthropicClient.test.ts (10)
 ✓ api/_lib/__tests__/gateway.test.ts (11)
 ✓ api/_lib/__tests__/noClientLeak.test.ts (3)
 ✓ api/_lib/__tests__/schemas.test.ts (18)
 ✓ api/_lib/__tests__/systemPrompt.test.ts (8)
 ✓ src/db/__tests__/backup.test.ts (4)
 ✓ src/db/__tests__/client.test.ts (4)
 ✓ src/db/repositories/__tests__/accommodationResultsRepo.test.ts (9)
 ✓ src/db/repositories/__tests__/dedup.test.ts (5)
 ✓ src/db/repositories/__tests__/foodResultsRepo.test.ts (7)
 ✓ src/db/repositories/__tests__/reloadPersistence.test.ts (3)
 ✓ src/db/repositories/__tests__/travelerProfilesRepo.test.ts (6)
 ✓ src/db/repositories/__tests__/tripOverridesRepo.test.ts (6)
 ✓ src/db/repositories/__tests__/tripsRepo.test.ts (15)
 ✓ src/modules/ai/__tests__/applyProposal.test.ts (8)
 ✓ src/modules/ai/__tests__/buildContext.test.ts (4)
 ✓ src/modules/ai/__tests__/previewProposal.test.ts (5)
 ✓ src/modules/research/__tests__/saveResult.test.ts (7)
 ✓ src/modules/research/__tests__/verification.test.ts (5)
 ✓ src/modules/trips/__tests__/effectiveSettings.test.ts (3)
 ✓ src/modules/trips/__tests__/profileInheritance.integration.test.ts (3)
 ✓ src/modules/trips/__tests__/validation.test.ts (8)
 ✓ src/modules/research/adapters/__tests__/manualAccommodationAdapter.test.ts (14)
 ✓ src/modules/research/adapters/__tests__/manualFoodAdapter.test.ts (10)
 ✓ src/modules/research/adapters/__tests__/registry.test.ts (4)

 Test Files  25 passed (25)
      Tests  180 passed (180)
```

Coverage against the owner's explicit test matrix: data normalization and
missing fields — numeric-string coercion, defaulted attribution,
genuinely-absent-not-fabricated optional fields, every required/invalid
field case for both result types
(`manualAccommodationAdapter.test.ts`/`manualFoodAdapter.test.ts`),
duplicate results — case/diacritic/punctuation-insensitive matching,
cross-trip non-collision, cross-category collision for food
(`dedup.test.ts`, `accommodationResultsRepo.test.ts`,
`foodResultsRepo.test.ts`), source attribution — defaults, staleness
derivation, "unknown" never demoted (`verification.test.ts`), and
provider failures — a mock adapter whose `normalize()` throws mid-call,
proven to come back as a typed `adapter-error` with nothing written,
since no real credentialed provider exists this phase to fail for real
(`saveResult.test.ts`).

**Production build result:** real, pasted by the owner, across two
rounds (see verification log below) — final result, `tsc -b && vite
build`:

```
vite v5.4.21 building for production...
✓ 67 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.27 kB
dist/assets/index-BODyLHK4.css   11.43 kB │ gzip:  2.86 kB
dist/assets/index-yAWnjTBP.js   218.09 kB │ gzip: 63.00 kB
✓ built in 1.10s
```

No new npm packages were added this phase, so `npm install` was not
re-run.

**Unavailable API access (reported per the owner's explicit
instruction):**

1. Agoda, Booking.com, and Airbnb still have no public search API and
   still actively resist automated price/availability lookups — carried
   over unchanged from Phases 1 and 3's findings. No live
   booking-platform integration exists or was attempted.
2. No credentials for any accommodation or food-discovery provider
   (Google Places, Yelp Fusion, TripAdvisor Content API, or similar)
   exist in this session. Per the owner's own explicit decision this
   phase (recorded above), none was integrated — the adapter *interface*
   a future credentialed provider would implement is built and tested,
   but the only adapter actually shipped is the manual/pasted-research
   one. Wiring in a real provider is future-phase work, gated on the
   owner obtaining and supplying real credentials.

**Known issues and limitations:**

- Results are saved only through direct, human-authored forms — not
  routed through Phase 3's AI-proposal/approval mechanism. The master
  prompt's "AI-generated changes must be proposals" rule is moot here
  since no AI writes anything in this phase, but it's flagged explicitly
  as a deliberate scope boundary rather than a silent gap: a later phase
  connecting the AI chat to accommodation/food research would need its
  own proposal kind for these two stores, the same way `trip-update` and
  `trip-override-upsert` work today.
- Only one adapter exists per workflow (manual). The registry/
  availability-gating machinery is real and tested
  (`registry.test.ts`), but there is nothing live for it to gate yet.
- As called out above, duplicate detection for food results is
  deliberately not scoped by category — a venue saved under "must-try"
  and later saved again under "budget-eats" is treated as the same
  duplicate, not two distinct entries. Documented in
  `foodResultsRepo.ts`'s comments in case a future phase wants this
  reconsidered.
- Still no Vercel deployment and no real provider credentials of any
  kind — unchanged from Phase 3.

**Backup/checkpoint:** no new backup *surface*, but automatic coverage:
`exportBackup`/`restoreBackup` iterate `ALL_STORE_NAMES` generically
(Phase 2), so both new stores are included in every backup/restore
automatically — confirmed by the fixed `backup.test.ts` assertion above,
not just assumed.

**Next step requiring approval:** Phase 4 is complete and verified with
real evidence — automated tests (180/180, covering the owner's full named
test matrix despite zero live providers existing to test against) and a
clean production build, both reported by the owner rather than assumed,
plus one real build failure found and fixed along the way (see
verification log). No live accommodation/food provider is integrated,
by the owner's own explicit choice this phase; wiring one in — along with
whatever else the owner wants next, such as the itinerary module,
Vercel deployment, or connecting a real provider once credentials exist —
is Phase 5 territory and does not start until explicitly approved, per
the master prompt's incremental-phase rule.

---

### Phase 4 — verification log

- `npm run test`: **passed on the first try, 25 test files, 180/180**, for
  real (owner ran it, pasted actual vitest output — reproduced in full
  above). Every new Phase 4 test passed, including the provider-failure
  tests exercised against mock throwing adapters.
- `npm run build`, attempt 1: **failed, 17 real TypeScript errors**, all
  in two new test files (`manualAccommodationAdapter.test.ts`,
  `manualFoodAdapter.test.ts`): `expect(outcome.ok).toBe(true);` followed
  by `outcome.candidate` on the next line. `expect(...).toBe(...)` is a
  function call, not an `if` — it tells vitest what to check at runtime,
  but tells the TypeScript compiler nothing, so `outcome` was still seen
  as the full `NormalizeOutcome` union and `candidate` doesn't exist on
  its `{ok: false}` branch. The tests had passed under `vitest run`
  because vitest's transform step doesn't type-check; `tsc -b` (a
  separate, real compilation step `npm run build` runs first) caught it.
  This is exactly the discriminated-union narrowing risk the production
  code (`saveResult.ts`, `adapters/types.ts`) was deliberately written to
  avoid — it had just leaked into the tests written around it instead.
  Fixed by adding `assertNormalized()` — a small helper using a real
  TypeScript `asserts outcome is {ok: true; ...}` type predicate — and
  using it in place of the non-narrowing `expect(outcome.ok).toBe(true)`
  everywhere `outcome.candidate` is read afterward. This gives the
  compiler the same narrowing a genuine `if (!outcome.ok) throw ...` would
  (which is exactly what the helper does internally), while still failing
  the test with the actual field errors shown if normalize() ever
  unexpectedly fails.
- `npm run build`, attempt 2: **passed.** `tsc -b` clean, `vite build`
  produced `dist/` (index.html, ~11.4kB CSS, ~218kB JS before gzip) in
  1.10s. Owner ran this, pasted real output (reproduced in full above).

Same pattern as Phases 1 and 3: real `tsc` found something manual review
and the static-analysis script used while writing this phase did not —
in this case, in test code rather than production code. The fix was
applied at the root cause (give the compiler real narrowing information)
rather than papering over it with a type assertion.

**Phase 4 is closed.** Next phase requires explicit approval per the
master prompt before starting.

---

## Phase 5 — Detailed itinerary, budget/bookings/reminders, XLSX export

**Status:** ✅ VERIFIED AND COMPLETE. Same repo/branch as Phases 1–4.

**Context:** scope was set verbatim by the owner: build an independently
editable detailed itinerary (date, start/end, duration, category,
address, transport, travel time, fare, activity cost, opening hours,
booking status, notes, sources, actual status); support overnight
activities, cross-midnight calculations, schedule conflict detection,
manual reordering, and AI draft alternatives without replacing approved
plans; implement an XLSX export with exactly eight sheets (Trip Overview,
High-Level Itinerary, Detailed Itinerary, Reminders, Budget, Bookings,
Change Log, Research Sources) using Taiwan_041026.xlsx as the baseline,
with formats, filters, frozen headers, formulas, currency handling, and
formula-injection protection; include planned-vs-actual expenses,
per-person totals, and change history; test date calculations, midnight
transitions, empty/large itineraries, totals, workbook integrity,
special characters, formula injection, and backup round-trips; run tests
and build; report actual results; stop for approval.

Same cloud-sandbox + device-bridge workflow as Phases 1–4 (no npm
registry access in the sandbox) — code was written and pushed here, then
`npm install`, `npm run test`, and `npm run build` were run by the owner
locally and reported back verbatim, across three build attempts (see
verification log below).

Taiwan_041026.xlsx was inspected directly (via openpyxl) before writing
any export code: it has exactly 3 sheets (`Itinerary_Immigration`,
`Detailed Itinerary v4_Group`, `Reminders`), no frozen panes and no
autofilter in the original. The 8-sheet structure, frozen headers, and
autofilters this phase adds are new, not something preserved from the
baseline — the baseline's real overnight-row pattern (a "Preparation for
rest" block at 23:01–23:59 followed by a separate "Rest" block at
00:00–06:00, both still under "Day 1") was carried over as ground truth
for the cross-midnight design and is now a test fixture
(`timeline.test.ts`).

**Features implemented:**

- **Detailed itinerary schema** (`src/db/schema.ts`): `ItineraryItem`
  extended with `travelTimeMinutes`, `openingHours`, split
  `farePlanned`/`fareActual` and `activityCostPlanned`/
  `activityCostActual` (replacing Phase 1's unused single
  `plannedCost`/`actualCost` pair, confirmed safe to rename since nothing
  shipped ever read them), an optional `attribution?: ResultAttribution`
  (reusing Phase 4's type instead of a bare `sourceUrl`/`verifiedAt`
  pair), `comments`, and `actualStatus`. All new numeric fields stay
  genuinely `undefined` when unknown rather than defaulting to 0 — the
  same "never invent" rule Phase 4 applied to research data, applied here
  to cost/time data. No `SCHEMA_VERSION` bump: every store this phase
  needed (`itineraryDays`, `itineraryItems`, `expenses`, `bookings`,
  `researchSources`, `reminders`, `changeLog`) already existed from
  Phase 1's migration — this phase only added interface fields and new
  repository/UI/validation code on top of them.
- **Cross-midnight modeling** (`src/db/schema.ts`,
  `src/modules/itinerary/timeline.ts`): two independent, explicit,
  stored boolean flags rather than one inferred from comparing clock
  values. `crossesMidnight` (unchanged from Phase 1): this item's own end
  is the day after its own start (a single overnight block, e.g. a
  23:35→02:00 flight). `newCalendarDay` (new): this item's start is the
  day after the *previous* item in the day's sequence — the exact shape
  of the real baseline's "Preparation for rest" → "Rest" row pair, where
  neither item's own start/end crosses midnight but the second is clearly
  the next day. Comparing raw clock times can't tell a genuine rollover
  apart from a same-day double-booking entered out of order — which is
  the whole reason `crossesMidnight` was already a stored flag rather
  than inferred — so `newCalendarDay` follows the same principle instead
  of introducing a heuristic that would reintroduce that exact ambiguity.
  `buildDayTimeline()` walks a day's items in `order`, keeping a running
  day offset that only ever advances on these two explicit flags, never
  on comparing wall-clock values.
- **Schedule conflict detection** (`timeline.ts`):
  `detectScheduleConflicts()` builds the day's absolute timeline, then
  does pairwise interval-overlap checks on every entry that has a real
  end time. An item with no end time never participates — a zero-width
  window can't conflict with anything — so an unknown duration is never
  mistaken for a conflict.
- **Date/duration math** (`src/modules/itinerary/dateMath.ts`):
  `parseTimeToMinutes`/`isValidTimeString` (strict 24h `HH:MM`),
  `computeDurationMinutes` (returns `undefined`, never a guess, when a
  time is missing or the stored combination is inconsistent — e.g.
  end-before-start without `crossesMidnight` set), `isTimeRangeConsistent`
  (what `validation.ts` uses to reject that one genuinely-wrong
  combination without rejecting "times not entered yet"), and
  `formatDurationMinutes` for display and for the XLSX export.
- **Itinerary repositories**
  (`src/db/repositories/itineraryDaysRepo.ts`,
  `itineraryItemsRepo.ts`): `ensureDaysForTripRange()` idempotently
  bulk-creates one `ItineraryDay` per calendar date in the trip's range
  (dates that already have a day are left completely untouched, not even
  their revision) — this is how the AI proposal surface stays to exactly
  one new kind instead of needing its own day-creation proposal, and how
  the itinerary screen bootstraps itself on every load. Full
  revision-checked CRUD for items, plus `reorderItems()` (throws rather
  than silently reassigning order around a stale snapshot if the given id
  list doesn't exactly match the day's current items; only writes items
  whose order actually changed).
- **Detailed Itinerary UI**
  (`src/modules/itinerary/ItineraryPlanner.tsx`): day cards with an
  editable label, a red conflict banner when `detectScheduleConflicts`
  finds any, manual up/down reordering, and an inline form (all fields
  from the master prompt's list) used for both adding and editing an
  item. Reachable from a new "Detailed Itinerary" button on Trip Details.
- **AI draft alternatives**: a new `itinerary-item-upsert` proposal kind
  (`api/_lib/schemas.ts`, `src/modules/ai/types.ts`) —
  `itemId: null` + `expectedRevision: null` together propose a *new*
  item; a non-null `itemId` + numeric `expectedRevision` propose editing
  an *existing* one. The AI never proposes creating a day (days are
  always pre-created by `ensureDaysForTripRange`, so a valid `dayId`
  always already exists to target). "Draft alternatives without
  replacing approved plans" falls directly out of the proposal mechanism
  Phase 3 already built: nothing is ever written until a human approves
  each proposal individually, so several `itinerary-item-upsert`
  proposals in one AI response are simply several independently
  approvable/rejectable drafts — no new replace-vs-draft logic was
  needed. The chat's request `context` gained an optional
  `itinerary: ItineraryDayContextSnapshot[]` field (defaults to `[]`, so
  none of the ~29 pre-existing gateway/schema tests needed changes) so
  the AI always sees real, current day/item ids and revisions.
- **Budget, Bookings, Reminders** (`src/modules/budget/`,
  `src/modules/bookings/`, `src/modules/reminders/`, each with its own
  repo + validation + screen): standard revision-checked CRUD matching
  the established pattern exactly. `computeBudgetTotals()`
  (`budgetMath.ts`) groups by currency — never summed across currencies,
  since a trip can legitimately mix them (a USD flight booked ahead, PHP
  day-to-day spend) — and `totalActualKnown` only ever sums expenses that
  actually have a logged actual amount, never assuming actual == planned
  for one that hasn't happened yet; `missingActualCount` tracks how many
  are still planned-only. All three screens are reachable from new
  buttons on Trip Details.
- **XLSX export** (`src/modules/export/`): `exceljs` added as a new
  dependency. `collectExportData.ts` gathers every store a trip touches;
  `buildWorkbook.ts` (pure, no IndexedDB — the only place this phase's
  XLSX tests need to exercise) builds all 8 required sheets with a
  frozen header row and an autofilter on every tabular sheet. Live
  formulas, not pre-computed numbers, wherever the sheets reference each
  other: Trip Overview's trip length (`=EndDate-StartDate+1`),
  High-Level Itinerary's per-day item count and cost totals
  (`COUNTIF`/`SUMIF` against Detailed Itinerary's own Date/cost columns),
  Detailed Itinerary's cost-column totals row, and Budget's per-currency
  breakdown (`SUMIF`/`COUNTIFS` against the expense list, per-person
  figures dividing by Trip Overview's traveler-count cell by reference)
  — editing a row directly in Excel updates these without re-exporting.
  `sanitizeForSpreadsheet()` (`sanitize.ts`) prefixes a leading apostrophe
  onto any free-text value starting with `=`, `+`, `-`, `@`, tab, or
  carriage return, applied to every user-authored string written into any
  sheet — OWASP's CSV/XLSX-injection mitigation, applied defensively
  regardless of the separate question of whether ExcelJS's own string-
  typed cells already prevent formula evaluation on their own. A new
  "Export to Excel" button on Trip Details triggers it; it's a *dynamic*
  `import()`, not a top-level one (see verification log — `exceljs`
  roughly 5×'d the production bundle when imported statically), so it
  loads in its own chunk only on first use rather than on every page
  load.
- **Research Sources sheet**: consolidates four things rather than
  reading only the mostly-empty `researchSources` store — that store's
  own rows, plus every `AccommodationResult`/`FoodResult`/`ItineraryItem`
  attribution, each tagged with a Source Type column. `changeLogHelper.ts`
  gained `listChangeLogForTrip()` (its first reader) for the Change Log
  sheet, which writes each entry's before/after as sanitized JSON,
  length-capped at 2000 characters with a `…(truncated)` marker so one
  pathological record can't produce an unbounded cell.

**Files created/changed:**

- New: `src/modules/itinerary/{dateMath,timeline,validation,
  ItineraryPlanner}.ts(x)`, `src/db/repositories/{itineraryDaysRepo,
  itineraryItemsRepo,expensesRepo,bookingsRepo,remindersRepo,
  researchSourcesRepo}.ts`, `src/modules/budget/{budgetMath,validation,
  BudgetTracker}.ts(x)`, `src/modules/bookings/{validation,
  BookingsTracker}.ts(x)`, `src/modules/reminders/{validation,
  RemindersChecklist}.ts(x)`, `src/modules/export/{sanitize,types,
  collectExportData,buildWorkbook,exportTrip}.ts`.
- New tests: `src/modules/itinerary/__tests__/{dateMath,timeline}.test.ts`,
  `src/db/repositories/__tests__/{itineraryDaysRepo,itineraryItemsRepo,
  expensesRepo,bookingsRepo,remindersRepo}.test.ts`,
  `src/modules/budget/__tests__/budgetMath.test.ts`,
  `src/modules/export/__tests__/{sanitize,buildWorkbook}.test.ts`,
  `api/_lib/__tests__/schemasPhase5.test.ts`,
  `src/modules/ai/__tests__/{applyProposalPhase5,previewProposalPhase5,
  buildContextPhase5}.test.ts`, `src/db/__tests__/backupPhase5.test.ts`
  (new files rather than edits to the Phase 2–4 test files covering the
  same functions, so nothing already-approved needed to be touched).
- Changed: `src/modules/ai/{types,previewProposal,applyProposal,
  buildContext,AiChatPanel}.ts(x)` (new proposal kind + itinerary
  context), `api/_lib/{schemas,gateway,systemPrompt}.ts` (server-side
  mirror of the same), `prompts/{system-prompt,response-schema}.md` and
  `prompts/modes/itinerary-planner.md` (describe the new capability —
  mirrored into `systemPrompt.ts` and checked byte-for-byte via a Node
  script before pushing, not just visually), `src/navigation/types.ts`
  (4 new views), `src/App.tsx` and `src/modules/trips/TripDetails.tsx`
  (new screens wired in, export button), `src/db/repositories/
  changeLogHelper.ts` (added `listChangeLogForTrip`), `package.json`
  (added `exceljs`).

**Database/schema changes:** `SCHEMA_VERSION` stays at 2 — no migration.
Every store this phase needed already existed from Phase 1; only
`ItineraryItem`'s interface gained fields (IndexedDB stores are
schemaless, so this needs no migration, matching how optional fields have
been added in every prior phase).

**Tests actually executed:** real, pasted by the owner — `npm run test`,
**40 test files, 322 tests, all passing**:

```
 Test Files  40 passed (40)
      Tests  322 passed (322)
   Start at  13:54:11
   Duration  14.23s (transform 1.84s, setup 3.09s, collect 18.09s, tests 1.64s, environment 10ms, prepare 7.34s)
```

(Full per-file listing omitted here for length; every Phase 1–4 test file
still passed unchanged alongside the 14 new Phase 5 files.) Coverage
against the owner's explicit test matrix: date calculations and midnight
transitions — strict time parsing, same-day and overnight duration math,
the real baseline's exact "Preparation for rest"/"Rest" row pair proven
to roll the day forward correctly, and a deliberate same-day
double-booking proven to still register as a real conflict rather than
being explained away as a rollover (`dateMath.test.ts`,
`timeline.test.ts`); schedule conflict detection — multiple independent
conflicts in one day, zero-conflict for timeless items
(`timeline.test.ts`); manual reordering — full shuffle, a no-op reorder
leaving revisions untouched, a rejected mismatched id list
(`itineraryItemsRepo.test.ts`); empty/large itineraries — a 0-item day
producing a well-formed (not malformed) totals-row range, a 300-item
itinerary across 20 days keeping every per-day order sequence and the
totals formula's range in sync (`itineraryItemsRepo.test.ts`,
`buildWorkbook.test.ts`); totals — per-currency/per-person budget math
never assuming actual == planned, live SUMIF/COUNTIFS budget-sheet
formulas, Detailed Itinerary's cost-column totals row
(`budgetMath.test.ts`, `buildWorkbook.test.ts`); workbook integrity — all
8 sheets present in the required order, every sheet's header frozen,
every tabular sheet autofiltered, a full write→reload round-trip through
a real XLSX buffer (`buildWorkbook.test.ts`); special characters —
quotes, em dashes, and Chinese characters round-tripped exactly through
both IndexedDB and the exported workbook
(`itineraryItemsRepo.test.ts`, `buildWorkbook.test.ts`); formula
injection — every OWASP-listed leading character (`=`,`+`,`-`,`@`, tab,
carriage return), a realistic DDE-style payload, and confirmation that a
sanitized title is written back as a plain string cell, never a formula
object (`sanitize.test.ts`, `buildWorkbook.test.ts`); and backup
round-trips — a full export/wipe/restore cycle with real populated
itinerary days/items, expenses, bookings, and reminders (not just empty
stores), confirming the change log these writes produced survives the
round-trip too (`backupPhase5.test.ts`).

**Production build result:** real, pasted by the owner, across three
rounds (see verification log below) — final result, `tsc -b && vite
build`:

```
vite v5.4.21 building for production...
✓ 92 modules transformed.
dist/index.html                       0.40 kB │ gzip:   0.27 kB
dist/assets/index-DHIIAmnU.css       12.93 kB │ gzip:   3.09 kB
dist/assets/index-CfKURd7l.js       269.19 kB │ gzip:  73.46 kB
dist/assets/exportTrip-CJse9LKm.js  952.54 kB │ gzip: 275.26 kB
✓ built in 4.44s
```

`exceljs` is isolated into its own `exportTrip-*.js` chunk, fetched only
when a person actually clicks "Export to Excel" — the main bundle
(`index-*.js`) is 269 kB, essentially unchanged from Phase 4's 218 kB
despite four new screens. Vite's chunk-size warning still fires on the
export chunk itself (952 kB raw, 275 kB gzipped, since ExcelJS plus its
own dependencies is a genuinely large library) — this is informational
only (the build still exits 0) and does not affect any page load other
than the export action itself, so it was left as-is rather than
"fixed" further.

`npm install` added `exceljs` and its transitive dependencies (189
packages). It reported 15 vulnerabilities (7 moderate, 6 high, 2
critical) in that dependency tree, per `npm audit` — not yet
investigated in depth; flagged here rather than silently ignored, and
worth a closer look (`npm audit` for specifics, whether any affected
package is actually reachable from this app's usage, whether a non-
breaking `npm audit fix` resolves some of them) either as part of
approving this phase or as an explicit early item in the next one.

**Known issues and limitations:**

- `npm audit`-reported vulnerabilities in `exceljs`'s dependency tree (15
  total, 2 critical) have not been individually triaged — see above.
- The AI can create or edit an itinerary item, but still cannot create a
  day (by design — see Features above), and has no proposal kind yet for
  expenses, bookings, or reminders; those three remain human-entered only
  this phase, the same deliberate scope boundary Phase 4 flagged for its
  own two stores.
- The Research Sources sheet's "General" rows come from the
  `researchSources` store, which (as noted since Phase 1) nothing writes
  to yet outside this export — in practice every row on that sheet today
  comes from accommodation/food/itinerary attributions instead.
- Detailed Itinerary's and Budget's/Bookings' sheet-level totals rows sum
  across all rows regardless of currency when a trip mixes more than one
  (labeled as such in the sheet); the Budget sheet's separate per-currency
  breakdown table is the one place totals are genuinely currency-correct.
- No live XLSX round-trip against a real Excel/LibreOffice install was
  possible from either the cloud sandbox or verification requests to the
  owner this phase — `buildWorkbook.test.ts`'s round-trip test reloads
  the generated buffer with ExcelJS itself (confirming the file parses
  and formulas/values are stored as intended), not with a second,
  independent spreadsheet application.
- Still no Vercel deployment — unchanged from Phases 1–4.

**Backup/checkpoint:** no new backup *surface* — Phase 2's
`exportBackup`/`restoreBackup` already iterate `ALL_STORE_NAMES`
generically, so every Phase 5 store was already covered mechanically.
This phase adds the first test that actually exercises that coverage
with real, populated Phase 5 data (days, items, expenses, bookings,
reminders) rather than just confirming the store keys exist
(`backupPhase5.test.ts`), per the owner's explicit "test... backup
round-trips" requirement.

**Next step requiring approval:** Phase 5 is complete and verified with
real evidence — automated tests (322/322 across 40 files, covering the
owner's full named test matrix) and a clean, now properly code-split
production build, both reported by the owner rather than assumed, plus
two real issues found and fixed along the way (see verification log).
Outstanding items for whenever the owner wants to pick them up: triaging
the `exceljs` dependency-tree vulnerabilities, deciding whether the AI
should eventually get its own proposal kind for expenses/bookings/
reminders, and the still-pending Vercel deployment. Whatever's next does
not start until explicitly approved, per the master prompt's
incremental-phase rule.

---

### Phase 5 — verification log

- `npm install`: **succeeded** — added `exceljs` and 188 transitive
  packages (189 total). Reported 15 vulnerabilities (7 moderate, 6 high,
  2 critical) via `npm audit`; not yet triaged (see Known issues above).
- `npm run test`: **passed on the first try, 40 test files, 322/322**,
  for real (owner ran it, pasted actual vitest output). Every new Phase 5
  test passed alongside every pre-existing Phase 1–4 test, unchanged.
- `npm run build`, attempt 1: the owner's first pasted build output
  looked stale — 67 modules and a 218 kB bundle, too small to include
  `exceljs` or any of the four new screens. Rather than trust it, a fresh
  build was asked for.
- `npm run build`, attempt 2 (after a confirmed fresh `npm install` +
  `npm run test` run): **failed, 1 real TypeScript error** — in this
  phase's own `backupPhase5.test.ts`, not production code:
  `backup.data.changeLog.length` directly accessed `.length` on a
  `ChangeLogEntry[] | undefined` (backup data is typed
  `Partial<Record<StoreName, unknown[]>>`, so every store's entry is
  optional). `tsc -b` — the real compilation step, same as Phase 4's
  finding — caught what a non-narrowing read wouldn't have. Fixed with
  `backup.data.changeLog?.length ?? 0`.
- `npm run build`, attempt 3: **passed**, but the production bundle had
  grown from 218 kB to 1.22 MB (348 kB gzipped) — real, expected proof
  that `exceljs` was now genuinely bundled (it hadn't been in attempt
  1's stale output), but a real problem on its own: every page load,
  including someone who never exports anything, was now shipping a large
  spreadsheet library. Fixed by changing the "Export to Excel" button's
  `import("../export/exportTrip")` from a top-level import to a dynamic
  one — Rollup then splits `exceljs` and everything it pulls in into its
  own chunk, fetched only when that button is actually clicked.
- `npm run build`, attempt 4: **passed**, main bundle back to 269 kB (73
  kB gzipped, essentially flat vs. Phase 4's 218 kB despite four new
  screens), `exceljs` isolated into a separate `exportTrip-*.js` chunk
  (952 kB raw / 275 kB gzipped) loaded only on demand. Owner ran this,
  pasted real output (reproduced in full above).

Same pattern as Phases 1, 3, and 4: real `tsc` and a real production
build found two things neither manual review nor the test suite itself
surfaced — a strict-null-check gap in test code, and a bundle-size
regression that only a real `vite build`'s own size reporting (and its
own chunk-size warning) could have caught. Both were fixed at the root
cause — real optional-chaining instead of a cast, and genuine code-
splitting instead of raising the warning threshold to silence it.

**Phase 5 is closed.** Next phase requires explicit approval per the
master prompt before starting.

---

## Phase 6 — Full QA audit, disaster recovery, Vercel preview prep

**Status:** ✅ AUDIT, FIXES, AND NEW AUTOMATED TESTS VERIFIED — real
`npm run test`/`npm run build` output is in hand and clean (see "Tests
actually executed" / "Production build result" below). Disaster
recovery and the Vercel preview itself remain **prepared, not yet
executed** — both need the real browser/Vercel dashboard this sandbox
doesn't have, and are the one thing still standing between this phase
and being fully closed. Same repo as Phases 1–5; this phase also, for
the first time, recommends (but does not require) a second branch — see
`docs/VERCEL_DEPLOYMENT.md` §0.

**Context:** scope was set verbatim by the owner: audit the integrated
app and fix verified defects without weakening safeguards; run unit,
integration, and end-to-end tests for database failures, persistence,
migrations, backup/restore, stale AI proposals, trip isolation, workbook
exports, responsive layouts, and offline saved data; perform disaster
recovery (export a backup, initialize a clean browser, restore it,
compare records); prepare a Vercel preview, document environment
variables, verify server/client secret separation, route refreshes,
build output, and deployment logs; do not deploy to production or modify
production settings without explicit approval; deliver a QA report,
remaining defects, recovery evidence, deployment instructions, and a
release checklist; stop. No master-prompt file exists as a literal
document in this repo (confirmed by listing the whole project tree) —
"master prompt" throughout this log refers to the cumulative scope and
rules the owner has set phase by phase, which is what every previous
entry already cites by section number.

This phase is different in kind from Phases 1–5: it's not building a new
module, it's auditing five phases' worth of integration for real,
demonstrable defects. Two general-purpose research agents were used to
widen the search (one over the itinerary/AI/export layer, one over
responsive layout and offline behavior) — both explicitly instructed to
read-only, report file:line findings with a concrete triggering scenario,
and separate "confirmed" from "worth checking." Every finding below was
then independently re-read and re-verified against the actual source
before anything was changed — the agents' reports are a research aid, not
the standard of evidence; "confirmed" below means I read the exact lines
myself and traced the exact failure path.

**Confirmed defects found and fixed:**

1. **Trip-isolation gap in AI itinerary-item proposals**
   (`src/modules/ai/previewProposal.ts`, `applyProposal.ts`). `getItem(id)`
   and `getDay(id)` are keyed only by id, with no per-trip scoping —
   unlike `createItem`, which already checks `day.tripId !== tripId`
   before writing. Both `previewProposal` and `applyProposal`'s
   itinerary-item branches fetched the target by id and compared only
   `expectedRevision`, never `current.tripId`/`day.tripId` against
   `proposal.tripId`. A proposal naming the wrong trip for a real
   item/day id that actually belongs to a *different* trip would have
   been shown and applied as an ordinary, non-stale change to the trip
   the person thinks they're looking at — silently writing to the wrong
   trip. Fixed by adding the same tripId-ownership check `createItem`
   already uses, in both files, for both the create-day and update-item
   branches; mismatches are now treated identically to "doesn't exist."
   New test: `src/modules/ai/__tests__/tripIsolationPhase6.test.ts` (sets
   up two real trips, sends a proposal with a deliberately mismatched
   tripId/itemId pair, confirms `not-found` and confirms the other
   trip's real record is untouched afterward; also confirms the ordinary,
   correctly-scoped case still applies normally).
2. **Dropped AI-proposal change fields were never surfaced**
   (`api/_lib/schemas.ts`). `pickTypedChanges()` already computes
   `droppedKeys` — the fields it silently dropped because the model sent
   an unrecognized name or the right name with the wrong runtime type
   (e.g. `travelerCount: "3"`, a string, instead of a number) — and its
   own doc comment says "the drop itself is reported by the caller, not
   here." All three call sites in `parseProposal` destructured only
   `{ changes }`, discarding `droppedKeys` entirely, so a proposal that
   dropped one field still came back as an ordinary, fully-approvable
   proposal with no warning that part of what the model asked to change
   was never actually included. Fixed by threading `droppedKeys` through
   `parseProposal`'s return value and having `parseProviderOutput` push a
   warning naming the dropped field(s) whenever a proposal with any
   survives. New test: `api/_lib/__tests__/schemasPhase6.test.ts` (one
   wrong-typed field, one unrecognized field name, one wrong-typed
   boolean, and a clean-proposal control case confirming no false-
   positive warning).
3. **Editing an itinerary item via the human UI silently wiped
   `durationMinutes`** (`src/modules/itinerary/ItineraryPlanner.tsx`).
   `ItemForm`'s submitted object always included the key
   `durationMinutes: undefined` — and `itineraryItemsRepo.ts`'s
   `updateItem` merge logic treats any key *present* in the patch, even
   undefined-valued, as "clear this field" (`"durationMinutes" in
   patch`). The form has no control for this field at all (it's normally
   derived from start/end times, or set directly by an AI proposal for a
   timeless item), so saving any unrelated edit through this form — fix a
   typo in the title, nothing else — silently reverted `durationMinutes`
   to `undefined` every time. Fixed by preserving `existing?.durationMinutes`
   instead of hardcoding `undefined`. Not independently covered by a new
   automated test — this project has no component-testing dependency
   (`vitest.config.ts`'s `environment: "node"` comment says so
   explicitly, by design, since Phase 1), and adding one just for this
   fix felt like exactly the kind of scope creep this phase should avoid;
   flagged here as a verified, code-read-confirmed fix instead.
4. **Backup restore validation didn't check record shape, only array
   shape** (`src/db/backup.ts`). `validateBackupPayload` checked that
   each store's entry in a backup file was an array, but never that the
   records *inside* it looked like real records. A shape-valid-but-
   content-invalid backup (hand-edited, or truncated by a text editor)
   used to sail past validation and only fail once `restoreBackup()`
   reached `store.put()` on a record missing its own keyPath ("id") — a
   raw IndexedDB `DataError` thrown mid-transaction, not the clean
   `InvalidBackupError` this module exists to give *before* anything is
   touched. (IndexedDB's own transaction atomicity means no partial
   corruption could actually have resulted — a failed `put()` aborts the
   whole transaction — but the failure mode was a confusing low-level
   browser error instead of this app's own clear one.) Fixed by checking
   each record has a string `id` before the restore transaction ever
   opens. New test: `src/db/__tests__/backupPhase6.test.ts` (missing id,
   wrong-typed id, and a non-object "record," each confirmed rejected
   with existing data left untouched; plus a control case confirming
   ordinary well-formed backups still restore normally).
5. **Two responsive-layout overflow risks** (`BookingsTracker.tsx`,
   `BudgetTracker.tsx`). Both modules' list rows used
   `flex items-center justify-between` with no `min-w-0`/`flex-1` on the
   text block and no `flex-wrap` on the row — unlike
   `RemindersChecklist.tsx`'s equivalent row, which already does this
   correctly. A booking/expense whose combined label text is long enough
   (a real provider name plus confirmation number plus cost plus date, or
   a label plus kind/category plus two currency amounts) forces the row
   wider than a narrow phone viewport instead of wrapping or truncating.
   Fixed both to match `RemindersChecklist.tsx`'s already-correct
   pattern (`min-w-0 flex-1` + `truncate` on the text block, `flex-wrap`
   on the row, `shrink-0` on the action button(s)). Not independently
   covered by an automated test (no component-testing dependency, same
   reasoning as finding 3) — covered by the real-browser disaster-
   recovery walkthrough (`docs/DISASTER_RECOVERY.md`) touching both
   screens, and worth a specific look during that manual pass.

**Defense-in-depth hardening (not bugs — nothing was broken, these close
a gap before it could ever matter):**

- `src/App.tsx`: added `key={view.tripId}` to every trip-scoped screen
  (`TripForm`, `TripDetails`, `TripOverrideForm`, `AiChatPanel`,
  `AccommodationComparison`, `FoodHunter`, `ItineraryPlanner`,
  `BudgetTracker`, `BookingsTracker`, `RemindersChecklist`). Today's
  navigation always unmounts between trips (confirmed by reading every
  view transition), so this wasn't exploitable as written — but without
  it, any future change that let `view` move from one trip straight to
  another without an intervening unmount would have React reuse the
  component instance and its in-memory state (chat history, pending
  proposal cards, form drafts) across trips instead of resetting it.
  Same trip-isolation posture as finding 1, applied preemptively.

**New feature required to actually perform this phase's own disaster-
recovery instruction:**

- **Backup & Restore screen** (`src/modules/backup/BackupRestore.tsx`,
  reachable via a new "Backup" link in the header on every screen; new
  `{ name: "backup" }` view in `src/navigation/types.ts`).
  `exportBackup()`/`restoreBackup()` have existed and been tested since
  Phase 2, but every phase's "Known issues" section since has noted
  there was never a screen that let a person actually reach them — which
  made this phase's own explicit instruction ("export a backup,
  initialize a clean browser, restore it, compare records") literally
  impossible to perform by hand, not just untested. This isn't a feature
  added for its own sake; it's a blocking prerequisite for the disaster-
  recovery step the master prompt itself asks for this phase. Download
  triggers a browser-native file download of the live `exportBackup()`
  payload; restore reads a chosen `.json` file, parses it, calls
  `restoreBackup()`, re-exports afterward to report a real post-restore
  record count (not the uploaded file's own claimed count — same
  "verify against live data, not the snapshot" discipline
  `previewProposal.ts` already uses), and offers the pre-restore safety
  backup (already returned by `restoreBackup()` since Phase 2, also
  previously unreachable) for download.

**Automated test coverage added this phase** (all new, none replacing or
weakening an existing test):

- `src/db/__tests__/dbFailuresPhase6.test.ts` — "test database
  failures," for real: mocks `idb`'s `openDB` to reject (each test file
  gets its own module registry, so this never touches any other test
  file's real fake-indexeddb usage — same isolation
  `reloadPersistence.test.ts` already relies on). Confirms a failed open
  surfaces as `status: "error"` with the real message, `getReadyDb()`
  and `withWriteTransaction` both keep refusing access afterward (never
  silently fall back to treating it as an empty, writable database), and
  a transient failure is recoverable — a later `initDb()` call succeeds
  once the underlying problem clears.
- `src/db/__tests__/migrationsPhase6.test.ts` — "test migrations," for
  real: directly unit-tests `runMigrations`' own "no migration registered
  for schema version N" guard, which every other test has only ever
  exercised indirectly (every real db open in this test suite runs the
  complete, gap-free 1→2 migration chain, so the guard's `if (!migrate)`
  branch had never actually been hit by a real test run before this).
  Also opens a real fake-indexeddb database through the full 0→2
  migration chain as a positive control.
- `src/db/__tests__/backupPhase6.test.ts` — finding 4 above.
- `src/db/__tests__/offlineCorePhase6.test.ts` — "test offline saved
  data": a static-analysis scan (same role `noClientLeak.test.ts` plays
  for the credential-leak guarantee) over every source file outside
  `src/modules/ai/`, failing if any of them reference `fetch(`,
  `XMLHttpRequest`, `new WebSocket(`, or `axios`. Confirms, as an
  automated, future-proof guarantee rather than a one-time audit claim,
  that the only network dependency anywhere in the client bundle is the
  AI chat feature itself — every other screen's data lives entirely in
  IndexedDB.
- `src/modules/ai/__tests__/tripIsolationPhase6.test.ts` — finding 1
  above.
- `api/_lib/__tests__/schemasPhase6.test.ts` — finding 2 above.

**Audited and confirmed NOT defects (checked, not assumed):**

- Export workbook formulas (COUNTIF/SUMIF column references, totals
  rows, `lastDataRow` clamping for empty data, per-currency breakdown)
  were re-checked cell-by-cell against `buildWorkbook.test.ts`'s
  large/empty/unicode/formula-injection cases — internally consistent,
  no off-by-one or misalignment found.
- A `travelerCount: 0` would divide-by-zero in the Budget sheet's
  per-person export formulas, but `travelerCount` is validated `>= 1` on
  every write path (`modules/trips/validation.ts`) — unreachable in
  practice, not worth a defensive formula change.
- `detectScheduleConflicts` never flagging a start-time-only item against
  a full-window item it clearly falls inside is intentional (documented,
  tested, "never invent a duration" principle) — a design choice, not a
  bug, though worth the owner's own gut-check during manual QA since it
  wasn't re-confirmed as *desired* this phase, only confirmed as
  *intentional*.
- The explicit `crossesMidnight`/`newCalendarDay` flag model is a real
  data-entry footgun if a human or the AI forgets to set one correctly,
  but it's the documented, deliberate alternative to inferring from
  clock values (which has its own false-positive/false-negative failure
  mode) — not something to "fix" without reopening a design decision
  made and tested back in Phase 5.

**Known gap, flagged rather than fixed this phase:** `duplicateTrip()`
(`src/db/repositories/tripsRepo.ts`, unchanged since Phase 2) copies only
the trip record and its override — not itinerary days/items, expenses,
bookings, reminders, or research results, all of which didn't exist yet
when `duplicateTrip` was written. A person duplicating a trip they've
since built out a full itinerary for would reasonably expect more than
the bare trip to come along. This is a real product gap, not a
correctness bug (nothing is lost or corrupted; duplication just does less
than it probably should), and expanding what gets duplicated is new
functionality, not a defect fix — left for the owner to decide whether
it's worth a future phase rather than expanded under this one's audit
scope.

**Files created/changed:**

- New: `src/modules/backup/BackupRestore.tsx`,
  `src/db/__tests__/{dbFailuresPhase6,migrationsPhase6,backupPhase6,
  offlineCorePhase6}.test.ts`,
  `src/modules/ai/__tests__/tripIsolationPhase6.test.ts`,
  `api/_lib/__tests__/schemasPhase6.test.ts`,
  `docs/VERCEL_DEPLOYMENT.md`, `docs/DISASTER_RECOVERY.md`.
- Changed: `src/modules/ai/{previewProposal,applyProposal}.ts` (finding
  1), `api/_lib/schemas.ts` (finding 2),
  `src/modules/itinerary/ItineraryPlanner.tsx` (finding 3),
  `src/db/backup.ts` (finding 4),
  `src/modules/{bookings/BookingsTracker,budget/BudgetTracker}.tsx`
  (finding 5), `src/App.tsx` (defense-in-depth `key` props, new Backup
  nav link and view branch), `src/navigation/types.ts` (new `"backup"`
  view).

**Database/schema changes:** none. Still schema version 2 — this phase
is audit, bug fixes, and a UI surface for an already-existing
backup/restore mechanism, not new data.

**Tests actually executed:** real, pasted by the owner — `npm run test`,
**46 test files, 341 tests, all passing, on the first try**:

```
 Test Files  46 passed (46)
      Tests  341 passed (341)
   Start at  14:33:55
   Duration  3.35s (transform 2.28s, setup 3.49s, collect 6.30s, tests 2.03s, environment 13ms, prepare 8.48s)
```

(Full per-file listing omitted here for length; every Phase 1–5 test
file still passed unchanged alongside the 7 new Phase 6 files —
`dbFailuresPhase6` (4), `migrationsPhase6` (2), `backupPhase6` (2),
`offlineCorePhase6` (3), `tripIsolationPhase6` (4), `schemasPhase6` (4).)
This is the **first phase where the real test run came back green with
zero failures and zero fixes needed** — every prior phase's real
`npm run test`/`npm run build` found at least one thing manual review
missed (a timing flake in Phase 3, a TS18048 strict-null gap in Phase 5,
etc.). Worth noting plainly rather than silently, since it's a genuine
change in pattern, not because it makes this phase's own fixes any less
real — those were still found by deliberate audit, not by a failing
test. The four stderr lines in the output above (`[ai-gateway]
malformed provider output...`, `[ai-gateway] provider error...`) are
expected, deliberate console output from `gateway.test.ts`'s own
error-path tests (confirming a real provider failure logs detail
server-side while returning a generic client-facing message) — not new
failures, and not something this phase touched.

`npm install`: up to date, no new packages (expected — this phase added
no dependencies). The 15 `npm audit` findings and the `esbuild`
install-scripts notice are carried over unchanged from Phase 5, already
flagged as an untriaged known issue there and again above.

**Production build result:** real, pasted by the owner — `tsc -b &&
vite build`:

```
vite v5.4.21 building for production...
✓ 93 modules transformed.
dist/index.html                       0.40 kB │ gzip:   0.27 kB
dist/assets/index-BRb6qIjn.css       13.02 kB │ gzip:   3.13 kB
dist/assets/index-CzvzWkcy.js       274.94 kB │ gzip:  75.12 kB
dist/assets/exportTrip-BgCT2tcB.js  952.54 kB │ gzip: 275.26 kB
✓ built in 4.46s
```

Clean on the first attempt — `tsc -b` found zero errors across every
file this phase touched or added, despite the trip-isolation and
dropped-keys fixes reaching into `api/_lib/schemas.ts`'s generic
`pickTypedChanges`-return-type plumbing. Main bundle grew only slightly
(269.19 kB → 274.94 kB, Phase 5's figure to this phase's — the new
Backup & Restore screen plus the `key` prop hardening account for the
difference) and `exceljs` stays correctly isolated in its own
on-demand `exportTrip-*.js` chunk (952.54 kB, unchanged from Phase 5,
as expected — this phase didn't touch the export module). Vite's
chunk-size warning on that same export chunk is the same pre-existing,
already-explained informational notice from Phase 5, not a new issue.

**Disaster recovery:** **prepared, not yet executed.** See "New feature
required..." above (the Backup & Restore screen this phase had to build
first) and `docs/DISASTER_RECOVERY.md` for the exact steps — export a
real backup, open a private/incognito window as a genuinely separate
IndexedDB origin, restore into it, and compare records field by field.
This sandbox has no real browser to run this in; the automated backup
round-trip tests (`backup.test.ts`, `backupPhase5.test.ts`,
`backupPhase6.test.ts`) prove the underlying `exportBackup`/
`restoreBackup` logic is correct against `fake-indexeddb`, but — as
`DISASTER_RECOVERY.md` explains — that's a different kind of proof than
an actually-separate browser storage origin, which is specifically what
the master prompt asked this phase to demonstrate.

**Vercel preview:** **prepared, not yet executed.** See
`docs/VERCEL_DEPLOYMENT.md` for the full step-by-step — environment
variables table (only `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` exist
anywhere in this project, confirmed by grepping the whole repo for
`process.env`; neither is prefixed `VITE_`, so neither can leak into the
client bundle), a real, cited Vercel platform behavior that matters for
"don't deploy to production without approval" (the very first deployment
of a brand-new Vercel project is unavoidably labeled "Production"
internally regardless of branch — confirmed via Vercel's own community
forum, not assumed, with both options for handling it laid out), and a
numbered checklist of what to verify once the preview exists: it loads,
a hard refresh on the root URL behaves correctly (this app has no
client-side router, so there are no deep sub-routes that could 404 on
refresh — the only meaningful check is the root URL itself, repeatedly),
a real end-to-end AI chat message (the first opportunity since Phase 3 —
no Vercel deployment has existed until now, and `npm run dev` doesn't
serve Edge Functions), a credential-leak grep against the *real* Vercel
build output rather than only a local one, Function/Build logs, and
environment-variable scoping. A separate release checklist (not for this
phase) covers what promoting to Production for real would additionally
need.

**Remaining defects (not yet fixed, not blocking this report):** none
found beyond the `duplicateTrip` scope gap already flagged above as a
deliberate non-fix. Everything confirmed as an actual defect during this
audit was fixed in this same phase.

**Known issues and limitations:**

- Every item in "Tests actually executed," "Disaster recovery," and
  "Vercel preview" above that says "prepared, not yet executed" is this
  phase's single biggest caveat — the audit and fixes are done and
  self-consistent, but none of the owner-side verification this phase
  explicitly calls for has happened yet.
- Findings 3 and 5 (the `durationMinutes` wipe fix and the two responsive
  layout fixes) have no dedicated automated regression test — this
  project has never added a component-testing dependency (deliberate
  since Phase 1, `vitest.config.ts`'s own comment), and introducing one
  just for two fixes felt like more scope than this phase's audit/QA
  framing called for. Both are code-read-confirmed, and the disaster-
  recovery walkthrough's real-browser pass touches both screens.
- `duplicateTrip`'s scope gap (flagged above) is unresolved by design —
  a product decision for the owner, not a defect this phase's audit
  mandate covers fixing.
- Still no Vercel deployment actually performed, and no live end-to-end
  AI conversation has happened yet — both now fully prepared
  (`docs/VERCEL_DEPLOYMENT.md`) and blocked only on the owner running
  through it.
- The 15 `npm audit` findings (7 moderate, 6 high, 2 critical) in
  `exceljs`'s dependency tree, flagged in Phase 5 and not yet triaged,
  remain untriaged — out of this phase's audit scope (it targeted
  application-code defects, not third-party dependency CVEs), carried
  forward as a known open item.

**Backup/checkpoint:** this phase's entire disaster-recovery section
*is* the backup/checkpoint story — see above. No schema change, so no
new backup/restore coverage was needed beyond finding 4's validation
hardening.

**Next step requiring approval:** the audit, the five confirmed-and-fixed
defects, the new automated tests, and the real `npm run test`/
`npm run build` evidence are all now in hand and clean (46/46 test files,
341/341 tests, first try; a clean build with the bundle split still
intact) — the same evidence-based standard every phase before this one
was held to. What's still outstanding is the disaster-recovery
walkthrough's real results and the Vercel preview's own verification
checklist (both written out in full in `docs/DISASTER_RECOVERY.md` and
`docs/VERCEL_DEPLOYMENT.md`) — neither needs more code, both need the
owner's real browser and Vercel dashboard. No Phase 7 work starts until
those are reported back and the owner explicitly approves.
