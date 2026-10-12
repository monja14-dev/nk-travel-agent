# Phase Log

Running record of phase completion reports, per master prompt §12. Each
entry is written at the time the phase is attempted — including when it's
blocked — not rewritten afterward to look cleaner.

---

## Phase 1 — Pure scaffold

**Status:** Written, **NOT YET VERIFIED**. Do not treat this as "done"
until the manual QA steps below have actually been run and the real output
reported back.

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
- `npm run build`, attempt 2: pending owner's re-run.

This is the expected shape of Phase 1 — written code has real compile
errors, they get fixed, re-verified. Nothing here was guessed; every fix
above traces to an exact compiler error in the owner's pasted output.
