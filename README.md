# NK Travel Agent

Personal couple travel-planning app — Stay Hunter, Food Hunter, itinerary
planner, and budget planner for trips with Krizia. See the master project
prompt for full scope; this README only tracks what actually exists.

**Status:** Phase 1 (pure scaffold) — written, not yet verified. See
`/docs/PHASE_LOG.md` for the real status and required manual QA steps
before trusting anything below.

## Stack

React + TypeScript + Vite, Tailwind CSS, IndexedDB (via `idb`) as the
primary data store, Vercel for hosting (not wired up yet).

## Getting started

```bash
npm install
npm run dev      # local dev server
npm run test     # vitest, against a fake IndexedDB
npm run build    # production build (tsc + vite build)
```

## Project layout

```
src/
  db/            # IndexedDB schema, migrations, client — see schema.ts
  modules/       # feature modules (not built yet — see modules/README.md)
  App.tsx        # Phase 1 shell: loading/ready/read-only/error states only
docs/
  EXISTING_AGENT_CAPABILITIES.md   # chat-agent behavior, documented before migrating
  TAIWAN_WORKBOOK_SCHEMA.md        # reference workbook's real columns, inspected not assumed
  PHASE_LOG.md                      # phase-by-phase completion reports
```

## Data integrity rules this project follows

See the master prompt for the full list. The two that shape the code most:

- Writes are gated until the database reports `status: "ready"` —
  `withWriteTransaction` throws otherwise rather than risk writing against
  an uninitialized or mid-upgrade store.
- Every record carries `revision`/`createdAt`/`updatedAt` so a stale write
  (e.g. an AI-proposed change built from an old revision) can be detected
  instead of silently overwriting newer data.
