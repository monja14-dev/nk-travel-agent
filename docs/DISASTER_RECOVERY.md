# Disaster recovery procedure — Phase 6

What this proves: that a real backup, taken from this app, can restore
everything into a completely empty database and come back identical —
not just that `exportBackup()`/`restoreBackup()` pass automated tests
(they do — `src/db/__tests__/backup.test.ts`,
`backupPhase5.test.ts`, `backupPhase6.test.ts` — but those run against
`fake-indexeddb` in Node, not a real browser, and a mocked "clean
database" is a `clear()` call, not an actually-separate browser profile).

Until this phase, there was no screen to even do this by hand — see
`src/modules/backup/BackupRestore.tsx` (new this phase, reachable via the
"Backup" link in the header on every screen). The steps below are written
for the owner to run and report back verbatim, the same standard every
other manual QA step in this project has used since Phase 1.

## Steps

1. **Start from real data.** In your normal browser profile, run
   `npm run dev` and open the app. Make sure at least one trip exists
   with some real content across the modules this project has built: a
   couple of detailed-itinerary items (including at least one with
   `crossesMidnight` or `newCalendarDay` set, to prove those two flags
   round-trip correctly), an expense, a booking, and a reminder. If you
   already have trips from earlier phases' manual QA, those are fine to
   use as-is — note down (or screenshot) exactly what's there before
   continuing, so step 6 has something concrete to compare against.

2. **Record the baseline count.** Open "Backup" (header nav) → "Download
   backup." Note the record count the browser's download shows, and keep
   the downloaded `.json` file.

3. **Initialize a clean browser.** Open a new **private/incognito
   window** pointed at the same `localhost` dev URL. A private window
   gets its own isolated IndexedDB origin, separate from your normal
   profile's — this is a real "clean browser," not a simulation, without
   needing to actually delete your real data to get one. Confirm the
   Dashboard shows "No active trips yet." — a genuinely empty database,
   not a loading state (if you want to go further than a private window,
   a *different* browser entirely, e.g. Edge if you've been using Chrome,
   proves the same thing even more convincingly — try that too if it's
   easy).

4. **Restore.** In that clean window, open "Backup" → "Restore from a
   backup file" → choose the file downloaded in step 2. Confirm the
   screen reports "Restored successfully" with a record count — write
   down whether that count matches step 2's exactly.

5. **Compare records.** In the clean window, open the restored trip(s)
   and compare, field by field, against what you recorded in step 1:
   trip name/destination/dates/traveler count; every detailed-itinerary
   item's date, times, the `crossesMidnight`/`newCalendarDay` flags
   specifically, category, and cost fields; every expense's planned vs.
   actual amounts; every booking's status; every reminder's checked
   state. They should be byte-for-byte identical — not just "looks
   right," actually re-check the specific values.

6. **Export the Excel workbook from the restored (clean-window) trip**
   and confirm it opens and looks the same as a workbook exported from
   the original trip before this test — this is the one piece of real
   data (the detailed itinerary, budget, bookings, reminders) that both
   round-trips through IndexedDB *and* gets transformed into a different
   file format, so it's worth confirming the restore didn't subtly change
   anything that only shows up once it's exported.

7. **Report back, verbatim:** the record count from step 2, the record
   count from step 4, whether they matched, and the result of the
   field-by-field comparison in step 5 — specifically call out anything
   that *didn't* match, not just confirm "it worked."

## What this does and doesn't cover

- This proves backup/restore survives a genuinely separate browser
  storage origin, which automated tests against `fake-indexeddb` cannot
  do by themselves — `fake-indexeddb` always runs in the same Node
  process, so "clear all stores" (what `resetTestDb()` does between
  tests) and "a different browser's IndexedDB" are not the same kind of
  proof, even though the restore *logic* being exercised is identical
  either way.
- It does not yet cover restoring across different *devices* (e.g.
  exporting on a phone, restoring on a laptop) — functionally identical
  (it's still just a JSON file), but worth a mental note if that's ever
  actually how the backup file would be moved around day to day.
- The safety-backup button shown after a successful restore
  (`BackupRestore.tsx`) is the recovery path if a restore ever turns out
  to have been the wrong file — confirm it downloads something
  reasonable too while you're in there, even though this specific drill
  doesn't require actually using it.
