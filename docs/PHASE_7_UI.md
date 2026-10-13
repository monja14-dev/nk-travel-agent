# Phase 7 — Smart Travel Command Center UI upgrade

Status: **implemented, awaiting owner QA + approval.** Nothing in this
phase has been deployed. No production deploy, domain, or production
environment-variable change has been made.

## What this phase is (and is not)

A presentation-layer upgrade of the existing app. The repository stayed the
source of truth; no screen was re-implemented from scratch against mock data.

**Not changed:** the IndexedDB schema and migrations, every repository
function, validation, AI gateway/proposal/approval flow, backup/restore, the
Excel export, and `api/`. No dependency was added.

## Data-safety statement (spec §9)

| Rule | Status |
|---|---|
| Reset or seed real application data | Not done. No seed/reset code was added. |
| Replace IndexedDB with temporary state | Not done. All screens still read/write through the existing repositories. |
| Remove backup & restore | Not done. Reachable from the sidebar and from each trip's "Export & backup" section. |
| Change database schemas | Not done. `SCHEMA_VERSION` and `src/db/schema.ts` untouched. |
| Expose API keys client-side | Not done. `grep` for `sk-ant`, `ANTHROPIC_*`, `process.env`, `import.meta.env` in `src/` and `index.html` finds nothing; `noClientLeak.test.ts` still passes. |
| Replace real functionality with mocks | Not done. Every figure on the Dashboard / trip page / studio is derived from saved records; empty data shows "none yet"/"—". |
| Modify production env vars or domains | Not done. |
| Deploy to production without authorization | Not done. |

## Design decisions to review

1. **Destination "photos" are generated gradients, not photos.** Trips have no
   image field. Real photos need a schema change (e.g. an uploaded image per
   trip), which this phase deliberately did not make. Needs your approval +
   a backed-up, tested-both-ways migration if you want it.
2. **No separate Transportation or Travel Logs & Exports screens.** Neither
   exists in the app. Transport lives on each itinerary item (how to get there,
   travel time, fare) and in the Itinerary Studio spreadsheet; export lives in
   the trip's "Export & backup" section. No dead nav links were created.
3. **Per-trip JSON backup does not exist.** Backup/restore is whole-database.
   The trip page says so rather than implying otherwise.
4. **Maps:** there was no map. Addresses now carry an "Open in Maps" link (a
   Google Maps *search* URL, opened only on click, no API key). It is an
   integration point, not an embedded map.
5. **Concierge** stays a normal screen (`trip-ai`) reached from the floating
   button, trip page and Dashboard. It never writes directly: the existing
   preview → approve → validate → apply flow is unchanged.

## Stages delivered

| Stage | What | Owner-run result |
|---|---|---|
| 1 | Tokens + shared components (`src/components/ui/*`) | build clean; 341 tests |
| 2 | App shell: collapsible sidebar, top bar, floating concierge | build clean; 341 tests |
| 3 | Dashboard "Travel Command Center" | build clean (111 modules); 364 tests |
| 4 | Trip workspace (`TripDetails`) | build clean (113); 373 tests |
| 5 | Itinerary Studio: timeline + spreadsheet views | build clean (114); 384 tests |
| 6 | Remaining screens on the navy theme + safe source links | build clean (115); 386 tests |
| 7 | Mobile + accessibility pass | **not yet run by owner** |

Test counts above are copied from the owner's terminal output, not estimated.

## New / changed files (high level)

- Design system: `tailwind.config.js`, `index.html`, `src/index.css`,
  `src/components/ui/{Button,Card,Badge,StatTile,PageHeader,EmptyState,ProgressBar,DestinationBanner,MetricRow,statusTones,index}`
- Shell: `src/components/shell/{AppShell,Sidebar,TopBar,ConciergeButton,navItems,icons}`
- Dashboard / trip: `src/modules/trips/{Dashboard,TripDetails,tripSummary,tripDisplay}`
- Itinerary Studio: `src/modules/itinerary/{ItineraryPlanner,studioRows}`
- Utilities: `src/lib/{format,url}`
- Restyled only (colors/spacing, no logic): Stay Hunter, Food Hunter, Budget,
  Bookings, Reminders, Profile, Backup & Restore, Trip form, Trip preferences,
  NK Concierge screen.
- New tests: `tripSummary`, `tripDisplay`, `studioRows` (spec table behaviour),
  `format`, `url`.

## Behaviour changes worth knowing (all small, all intentional)

- Itinerary item **Delete** now asks "Delete? Yes / No" first.
- Itinerary reloads after an edit no longer replace the page with "Loading…"
  (scroll position is kept; a failed refresh shows an inline error).
- Stay Hunter / Food Hunter source links now render as links **only for
  http(s) URLs** (previously any stored string became an `href`).
- Itinerary items on a day that fell outside the trip's dates (after a date
  edit) are kept and listed at the end of the spreadsheet with a warning;
  nothing is dropped.
- Mobile: forms stack to one column on narrow screens; the main area keeps
  clearance under the floating concierge button.
- Accessibility (Stage 7): "Skip to content" link; `nav` landmark label;
  `aria-current="page"` on the active nav item; drawer is a labelled modal
  dialog that closes on Escape; global visible keyboard focus ring; reduced-
  motion respected; error banners use `role="alert"`; tertiary text colour
  raised to meet WCAG AA 4.5:1 on all three surface colours (checked by
  calculation: 6.5 / 5.5 / 4.9).

## Known limitations / remaining defects

- **Visual verification is the owner's.** The author could not run a browser
  or compiler in the authoring environment; every stage was compiled and
  tested on the owner's machine from pasted output. Screens restyled in
  Stage 6 were converted by a class-mapping script and may have rough edges
  (low-contrast label, odd button) that only a screenshot reveals.
- No automated component/DOM tests exist (project decision since Phase 1), so
  the accessibility behaviours above are code-read, not asserted by tests.
- Focus is not returned to the menu button when the mobile drawer closes.
- The Excel export chunk (~950 kB, loaded only on click) is unchanged.
- `exceljs` dependency audit findings from Phase 5 remain untriaged.
- The legacy "light screen" bridge in `AppShell` is now unused (every view is
  migrated) and can be deleted in a follow-up.

## Manual QA checklist (owner)

Desktop (≥1024 px) then phone width (≈390 px, browser devtools):

1. **Dashboard** loads; stat tiles and featured trip match what you know
   about your data; an empty trip shows "None yet", not a percentage.
2. Open a trip → **trip page**: banner, progress bars, workspace cards each
   navigate to the right screen; preferences show override/default tags.
3. **Itinerary Studio** → Timeline: add an item, edit it, reorder with ▲▼,
   delete it (confirm step appears). Create two overlapping items → red
   "Overlaps" highlight + count.
4. Switch to **Spreadsheet**: columns present, horizontal scroll works, Edit
   opens the form above the table, a source link opens in a new tab.
5. **Reload the page** (F5) on each of the above: data is still there.
6. **Export to Excel** from the trip page: file downloads and opens.
7. **Backup & Restore**: download a backup; (optionally) restore it in a
   throwaway profile — never first on your only copy.
8. **Concierge**: send a message; a proposal still needs Apply/Reject and
   nothing changes before you approve.
9. **Stay Hunter / Food Hunter / Budget / Bookings / Reminders / Profile /
   Trip form**: each is readable (no dark-on-dark text) and saves.
10. Keyboard: Tab from page top reveals "Skip to content"; focus ring visible
    on every control; on phone width the drawer closes with Esc.
11. DevTools → Network/Sources on the *deployed preview*: search the JS
    bundles for `sk-ant` — expect no matches.

## Vercel preview

Use a **Preview** deployment only (see `docs/VERCEL_DEPLOYMENT.md`). Do not
promote to Production, attach a domain, or change production environment
variables as part of this phase.

## Stop point

Per the spec: work stops here until the owner reports QA results and
explicitly approves any further architectural change (photos/schema,
per-trip backup, a real map provider, etc.).
