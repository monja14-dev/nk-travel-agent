# Taiwan_041026.xlsx — Actual Schema (Inspected, Not Assumed)

Per the master prompt's rule to inspect the real file before implementing
the export schema. Inspected directly from the uploaded workbook (kept
outside the project tree; this document is the only artifact derived from
it).

## Sheet: `Itinerary_Immigration` (A1:D7)

One row per day. Columns: `Date`, `Day`, `Main Activities / Destinations`,
`Remarks`. `Main Activities / Destinations` is free text with embedded
newlines listing multiple activities per day — not a normalized list.

## Sheet: `Detailed Itinerary v4_Group` (A1:G72)

Columns: `Date`, `Start`, `End`, `Duration (Hrs & Mins)`, `Remarks`,
`Comments`, `How to get there`.

Real quirks found (these drove the new `ItineraryItem`/`ItineraryDay`
schema — see `/src/db/schema.ts`):

- **`Date` is only populated on the first row of each new day.** Every
  later row for that day leaves `Date` blank, meaning "same day as the row
  above." The app must carry the day forward explicitly instead of trusting
  a per-row date.
- **Day boundaries are marked by a lone text cell**, e.g. `"Day 2 - DIY
  Tour 2 (Qingtiangang, Tiaoshi Bus Station, Beitou)"` in the `Start`
  column with every other column empty — not a separate header row type.
  This is what became the `ItineraryDay.dayLabel` field.
- **Times cross midnight** (e.g. `23:31 → 06:00`) with `Duration`
  hand-computed in the source file. The new schema stores
  `crossesMidnight: boolean` explicitly rather than inferring it from
  `start > end`, since that comparison is ambiguous without the flag.
- **`Remarks` is really the activity title/description**, and holds
  multi-line lists (e.g. "Beitou Library (till 5pm only)\nBeitou Thermal
  Valley..."), not a short label. `Comments` is a true secondary note field
  (tips, booking reminders, warnings).
- **No structured address field.** Locations are named in free text only
  ("Taipei Main Station 1F, East Gate 3 - Family Mart").
- **No cost or budget data anywhere in the workbook.** The planned
  `Budget` export sheet is net-new, not migrated.
- **No booking-status field.** Booking state is implied by free text in
  `Remarks`/`Comments` (e.g. "Book via Klook", "Klook booking confirmed").
  The new schema makes this an explicit `BookingStatus` enum.
- **No source URL or verification timestamp** — nothing in the workbook
  distinguishes a verified price/schedule from an assumption.

## Sheet: `Reminders` (A1:B22)

Two columns (`<section label>`, `Remarks`), with informal section breaks
inserted as single-cell rows: "Important things to bring and pay prior
departure", "To buy/book thru klook", "MUST BRING". Not a real schema —
just grouped free text. Mapped to the new `Reminder.section` field.

## What this means for the planned XLSX export (master prompt §7)

The master prompt's 8-sheet export (Trip Overview, High-Level Itinerary,
Detailed Itinerary, Reminders, Budget, Bookings, Change Log, Research
Sources) is a **superset** of this file, not a reformat of it. High-Level
Itinerary and Detailed Itinerary can preserve this file's useful shape
(including the human-friendly "same day as above" blank-date convention
for readability, even though the underlying data model always has a real
date on every `ItineraryItem`). Budget, Bookings, Change Log, and Research
Sources have no equivalent in this file at all — they're new.
