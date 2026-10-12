// This project's tsconfig doesn't set esModuleInterop, and exceljs's
// types use a CJS-style `export =` — a namespace import is the form
// that works regardless of that flag (a default import would not).
import * as ExcelJS from "exceljs";
import { s } from "./sanitize";
import { computeDurationMinutes, formatDurationMinutes } from "../itinerary/dateMath";
import { computeBudgetTotals } from "../budget/budgetMath";
import type { TripExportData } from "./types";
import type { ItineraryDay, ItineraryItem } from "../../db/schema";

/**
 * Pure, synchronous workbook construction — no IndexedDB, no browser
 * APIs. Takes exactly the shape collectExportData.ts produces, so this is
 * the function Phase 5's XLSX tests exercise directly with hand-built
 * fixtures (empty trip, a large synthetic itinerary, special characters,
 * formula-injection attempts) without needing fake-indexeddb at all.
 *
 * Every sheet gets a frozen header row; every genuinely tabular sheet
 * (everything except Trip Overview, which is a key/value summary) gets
 * an autofilter over its header. Dates that participate in a cross-sheet
 * or same-sheet formula (Trip Overview's Start/End Date, and the Date
 * column shared by High-Level and Detailed Itinerary) are written as real
 * Excel date values so arithmetic/SUMIF/COUNTIF work natively; every other
 * date/time/datetime field is free-form enough (a day can cross midnight,
 * a timestamp carries real time-of-day) that it's written as plain text
 * instead, matching dateMath.ts's "never invent, never silently coerce"
 * discipline.
 */
export function buildTripWorkbook(data: TripExportData): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NK Travel Agent";
  workbook.created = new Date(data.generatedAt);

  const travelerCountCell = buildTripOverviewSheet(workbook, data);
  buildHighLevelItinerarySheet(workbook, data);
  buildDetailedItinerarySheet(workbook, data);
  buildRemindersSheet(workbook, data);
  buildBudgetSheet(workbook, data, travelerCountCell);
  buildBookingsSheet(workbook, data);
  buildChangeLogSheet(workbook, data);
  buildResearchSourcesSheet(workbook, data);

  return workbook;
}

function freezeHeader(ws: ExcelJS.Worksheet) {
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
}

function lastDataRow(count: number): number {
  // Always at least row 2, so SUM/COUNTIF ranges referencing it stay
  // well-formed (start <= end) even for an empty itinerary/list.
  return Math.max(2, 1 + count);
}

function dateCell(isoDate: string | undefined): Date | undefined {
  if (!isoDate) return undefined;
  return new Date(`${isoDate}T00:00:00Z`);
}

// ---------------------------------------------------------------------
// 1. Trip Overview

function buildTripOverviewSheet(workbook: ExcelJS.Workbook, data: TripExportData): string {
  const ws = workbook.addWorksheet("Trip Overview");
  ws.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 50 },
  ];
  freezeHeader(ws);

  const { trip, override, profile } = data;
  const rows: Array<[string, unknown]> = [
    ["Trip Name", s(trip.name)],
    ["Destination", s(trip.destination)],
    ["Country", s(trip.country)],
    ["Start Date", dateCell(trip.startDate)],
    ["End Date", dateCell(trip.endDate)],
    ["Trip Length (days)", { formula: "=B6-B5+1" }],
    ["Traveler Count", trip.travelerCount],
    ["Room Count", trip.roomCount ?? ""],
    ["Status", trip.status],
    ["Notes", s(trip.notes) ?? ""],
    ["", ""],
    ["Trip Preferences (override)", ""],
    ["Currency", s(override?.currency) ?? ""],
    ["Budget Target Min", override?.budgetTargetMin ?? ""],
    ["Budget Target Max", override?.budgetTargetMax ?? ""],
    ["Must-Have Amenities", s(override?.mustHaveAmenities.join(", ")) ?? ""],
    ["Hotel vs Airbnb Open", override?.hotelVsAirbnbOpen ?? ""],
    ["Override Notes", s(override?.rawOverrideText) ?? ""],
    ["", ""],
    ["Couple Travel Profile", ""],
    ["Pace", profile?.pace ?? ""],
    ["Priority Order", s(profile?.priorityOrder.join(", ")) ?? ""],
    ["Accommodation Preferences", s(profile?.accommodationPreferences) ?? ""],
    ["Food Preferences", s(profile?.foodPreferences) ?? ""],
    ["", ""],
    ["Export Info", ""],
    ["Generated At", data.generatedAt],
  ];

  for (const [field, value] of rows) {
    const row = ws.addRow({ field, value });
    if (field === "Trip Preferences (override)" || field === "Couple Travel Profile" || field === "Export Info") {
      row.getCell(1).font = { bold: true };
    }
  }

  // Row 5 = Start Date, Row 6 = End Date, Row 7 = Trip Length — fixed by
  // the literal row order above (header is row 1).
  ws.getCell("B5").numFmt = "yyyy-mm-dd";
  ws.getCell("B6").numFmt = "yyyy-mm-dd";

  // Traveler Count lands on row 8 (see the row order above) — Budget
  // sheet's per-person formulas reference this exact cell.
  return "'Trip Overview'!$B$8";
}

// ---------------------------------------------------------------------
// 2. High-Level Itinerary

function buildHighLevelItinerarySheet(workbook: ExcelJS.Workbook, data: TripExportData) {
  const ws = workbook.addWorksheet("High-Level Itinerary");
  ws.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Day Label", key: "dayLabel", width: 28 },
    { header: "Summary", key: "summary", width: 30 },
    { header: "Remarks", key: "remarks", width: 30 },
    { header: "Item Count", key: "itemCount", width: 10 },
    { header: "First Start", key: "firstStart", width: 10 },
    { header: "Last End", key: "lastEnd", width: 10 },
    { header: "Total Fare Planned (per day; mixes currencies if >1 used)", key: "totalFare", width: 22, style: { numFmt: "#,##0.00" } },
    { header: "Total Activity Cost Planned (per day; mixes currencies if >1 used)", key: "totalActivity", width: 26, style: { numFmt: "#,##0.00" } },
  ];
  freezeHeader(ws);

  const sortedDays = [...data.days].sort((a, b) => a.date.localeCompare(b.date));
  const itemsByDay = groupItemsByDay(data.items);
  const detailedLastRow = lastDataRow(data.items.length);

  sortedDays.forEach((day, index) => {
    const rowNumber = index + 2;
    const dayItems = (itemsByDay.get(day.id) ?? []).slice().sort((a, b) => a.order - b.order);
    const firstWithStart = dayItems.find((i) => i.startTime);
    const lastWithEnd = [...dayItems].reverse().find((i) => i.endTime);

    ws.addRow({
      date: dateCell(day.date),
      dayLabel: s(day.dayLabel),
      summary: s(day.summary) ?? "",
      remarks: s(day.remarks) ?? "",
      itemCount: { formula: `=COUNTIF('Detailed Itinerary'!A2:A${detailedLastRow},A${rowNumber})` },
      firstStart: firstWithStart?.startTime ?? "",
      lastEnd: lastWithEnd?.endTime ?? "",
      totalFare: { formula: `=SUMIF('Detailed Itinerary'!A2:A${detailedLastRow},A${rowNumber},'Detailed Itinerary'!P2:P${detailedLastRow})` },
      totalActivity: { formula: `=SUMIF('Detailed Itinerary'!A2:A${detailedLastRow},A${rowNumber},'Detailed Itinerary'!R2:R${detailedLastRow})` },
    });
    ws.getCell(`A${rowNumber}`).numFmt = "yyyy-mm-dd";
  });

  const end = lastDataRow(sortedDays.length);
  ws.autoFilter = { from: "A1", to: `I${end}` };
}

function groupItemsByDay(items: ItineraryItem[]): Map<string, ItineraryItem[]> {
  const map = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    const bucket = map.get(item.dayId) ?? [];
    bucket.push(item);
    map.set(item.dayId, bucket);
  }
  return map;
}

// ---------------------------------------------------------------------
// 3. Detailed Itinerary

function buildDetailedItinerarySheet(workbook: ExcelJS.Workbook, data: TripExportData) {
  const ws = workbook.addWorksheet("Detailed Itinerary");
  ws.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Day Label", key: "dayLabel", width: 24 },
    { header: "Order", key: "order", width: 7 },
    { header: "Start", key: "startTime", width: 8 },
    { header: "End", key: "endTime", width: 8 },
    { header: "Duration", key: "duration", width: 10 },
    { header: "Crosses Midnight", key: "crossesMidnight", width: 14 },
    { header: "New Calendar Day", key: "newCalendarDay", width: 14 },
    { header: "Category", key: "category", width: 12 },
    { header: "Title", key: "title", width: 28 },
    { header: "Description", key: "description", width: 28 },
    { header: "Address", key: "address", width: 28 },
    { header: "Transport (how to get there)", key: "transportNotes", width: 24 },
    { header: "Opening Hours", key: "openingHours", width: 18 },
    { header: "Booking Status", key: "bookingStatus", width: 14 },
    { header: "Fare Planned", key: "farePlanned", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Fare Actual", key: "fareActual", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Activity Cost Planned", key: "activityCostPlanned", width: 16, style: { numFmt: "#,##0.00" } },
    { header: "Activity Cost Actual", key: "activityCostActual", width: 16, style: { numFmt: "#,##0.00" } },
    { header: "Currency", key: "currency", width: 9 },
    { header: "Travel Time (min)", key: "travelTimeMinutes", width: 12 },
    { header: "Source Label", key: "sourceLabel", width: 18 },
    { header: "Source URL", key: "sourceUrl", width: 24 },
    { header: "Verification Status", key: "verificationStatus", width: 14 },
    { header: "Retrieved At", key: "retrievedAt", width: 20 },
    { header: "Comments / Notes", key: "comments", width: 28 },
    { header: "Actual Status", key: "actualStatus", width: 12 },
  ];
  freezeHeader(ws);

  const dayById = new Map<string, ItineraryDay>(data.days.map((d) => [d.id, d]));
  const sortedItems = [...data.items].sort((a, b) => {
    const dayA = dayById.get(a.dayId)?.date ?? "";
    const dayB = dayById.get(b.dayId)?.date ?? "";
    if (dayA !== dayB) return dayA.localeCompare(dayB);
    return a.order - b.order;
  });

  sortedItems.forEach((item) => {
    const day = dayById.get(item.dayId);
    const duration = item.durationMinutes ?? computeDurationMinutes(item.startTime, item.endTime, item.crossesMidnight);
    ws.addRow({
      date: dateCell(day?.date),
      dayLabel: s(day?.dayLabel) ?? "",
      order: item.order,
      startTime: item.startTime ?? "",
      endTime: item.endTime ?? "",
      duration: duration !== undefined ? formatDurationMinutes(duration) : "",
      crossesMidnight: item.crossesMidnight,
      newCalendarDay: item.newCalendarDay,
      category: item.category,
      title: s(item.title) ?? "",
      description: s(item.description) ?? "",
      address: s(item.address) ?? "",
      transportNotes: s(item.transportNotes) ?? "",
      openingHours: s(item.openingHours) ?? "",
      bookingStatus: item.bookingStatus,
      farePlanned: item.farePlanned ?? null,
      fareActual: item.fareActual ?? null,
      activityCostPlanned: item.activityCostPlanned ?? null,
      activityCostActual: item.activityCostActual ?? null,
      currency: s(item.currency) ?? "",
      travelTimeMinutes: item.travelTimeMinutes ?? null,
      sourceLabel: s(item.attribution?.sourceLabel) ?? "",
      sourceUrl: s(item.attribution?.sourceUrl) ?? "",
      verificationStatus: item.attribution?.verificationStatus ?? "",
      retrievedAt: item.attribution?.retrievedAt ?? "",
      comments: s(item.comments) ?? "",
      actualStatus: item.actualStatus ?? "",
    });
  });

  sortedItems.forEach((_, index) => {
    ws.getCell(`A${index + 2}`).numFmt = "yyyy-mm-dd";
  });

  const end = lastDataRow(sortedItems.length);
  ws.autoFilter = { from: "A1", to: `AA${end}` };

  const totalsRow = end + 1;
  ws.getCell(`O${totalsRow}`).value = "TOTALS (sums may mix currencies if this trip uses more than one)";
  ws.getCell(`O${totalsRow}`).font = { italic: true };
  for (const col of ["P", "Q", "R", "S"]) {
    const cell = ws.getCell(`${col}${totalsRow}`);
    cell.value = { formula: `=SUM(${col}2:${col}${end})` };
    cell.numFmt = "#,##0.00";
    cell.font = { bold: true };
  }
}

// ---------------------------------------------------------------------
// 4. Reminders

function buildRemindersSheet(workbook: ExcelJS.Workbook, data: TripExportData) {
  const ws = workbook.addWorksheet("Reminders");
  ws.columns = [
    { header: "Section", key: "section", width: 28 },
    { header: "Label", key: "label", width: 36 },
    { header: "Remarks", key: "remarks", width: 30 },
    { header: "Checked", key: "checked", width: 10 },
  ];
  freezeHeader(ws);

  const sorted = [...data.reminders].sort((a, b) => a.section.localeCompare(b.section));
  sorted.forEach((r) => {
    ws.addRow({ section: s(r.section) ?? "", label: s(r.label) ?? "", remarks: s(r.remarks) ?? "", checked: r.checked });
  });

  const end = lastDataRow(sorted.length);
  ws.autoFilter = { from: "A1", to: `D${end}` };

  ws.getCell(`F1`).value = "Checked";
  ws.getCell(`G1`).value = { formula: `=COUNTIF(D2:D${end},TRUE)` };
  ws.getCell(`F2`).value = "Total";
  ws.getCell(`G2`).value = { formula: `=COUNTA(B2:B${end})` };
  ws.getCell("F1").font = { bold: true };
  ws.getCell("F2").font = { bold: true };
}

// ---------------------------------------------------------------------
// 5. Budget

function buildBudgetSheet(workbook: ExcelJS.Workbook, data: TripExportData, travelerCountCell: string) {
  const ws = workbook.addWorksheet("Budget");
  ws.columns = [
    { header: "Kind", key: "kind", width: 10 },
    { header: "Category", key: "category", width: 16 },
    { header: "Label", key: "label", width: 26 },
    { header: "Planned Amount", key: "plannedAmount", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Actual Amount", key: "actualAmount", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Linked Itinerary Item", key: "linkedItineraryItemId", width: 20 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  freezeHeader(ws);

  data.expenses.forEach((e) => {
    ws.addRow({
      kind: e.kind,
      category: s(e.category) ?? "",
      label: s(e.label) ?? "",
      plannedAmount: e.plannedAmount,
      actualAmount: e.actualAmount ?? null,
      currency: s(e.currency) ?? "",
      linkedItineraryItemId: s(e.linkedItineraryItemId) ?? "",
      notes: s(e.notes) ?? "",
    });
  });

  const end = lastDataRow(data.expenses.length);
  ws.autoFilter = { from: "A1", to: `H${end}` };

  const totalsRow = end + 1;
  ws.getCell(`C${totalsRow}`).value = "TOTALS (all currencies combined — see per-currency breakdown below)";
  ws.getCell(`C${totalsRow}`).font = { italic: true };
  ws.getCell(`D${totalsRow}`).value = { formula: `=SUM(D2:D${end})` };
  ws.getCell(`E${totalsRow}`).value = { formula: `=SUM(E2:E${end})` };
  ws.getCell(`D${totalsRow}`).numFmt = "#,##0.00";
  ws.getCell(`E${totalsRow}`).numFmt = "#,##0.00";

  // Per-currency breakdown — a second, separate table a few rows below,
  // kept out of the autofilter range above. The currency list/order comes
  // from computeBudgetTotals (the same function the in-app Budget screen
  // uses), but the four numeric columns here are live formulas against
  // the expense list above rather than pre-computed numbers, so editing a
  // row directly in Excel updates these totals too.
  const breakdownHeaderRow = totalsRow + 2;
  const headerCells = ["Currency", "Total Planned", "Total Actual (logged)", "# Missing Actual", "Per-Person Planned", "Per-Person Actual"];
  headerCells.forEach((text, i) => {
    const cell = ws.getRow(breakdownHeaderRow).getCell(i + 1);
    cell.value = text;
    cell.font = { bold: true };
  });

  const currencies = computeBudgetTotals(data.expenses, data.trip.travelerCount);
  currencies.forEach((c, index) => {
    const row = breakdownHeaderRow + 1 + index;
    ws.getCell(`A${row}`).value = c.currency;
    ws.getCell(`B${row}`).value = { formula: `=SUMIF(F2:F${end},A${row},D2:D${end})` };
    ws.getCell(`C${row}`).value = { formula: `=SUMIF(F2:F${end},A${row},E2:E${end})` };
    ws.getCell(`D${row}`).value = { formula: `=COUNTIFS(F2:F${end},A${row},E2:E${end},"")` };
    ws.getCell(`E${row}`).value = { formula: `=B${row}/${travelerCountCell}` };
    ws.getCell(`F${row}`).value = { formula: `=C${row}/${travelerCountCell}` };
    ["B", "C", "E", "F"].forEach((col) => {
      ws.getCell(`${col}${row}`).numFmt = "#,##0.00";
    });
  });
}

// ---------------------------------------------------------------------
// 6. Bookings

function buildBookingsSheet(workbook: ExcelJS.Workbook, data: TripExportData) {
  const ws = workbook.addWorksheet("Bookings");
  ws.columns = [
    { header: "Type", key: "type", width: 14 },
    { header: "Provider", key: "provider", width: 24 },
    { header: "Confirmation #", key: "confirmationNumber", width: 18 },
    { header: "Cost", key: "cost", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Booking Date", key: "bookingDate", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  freezeHeader(ws);

  data.bookings.forEach((b) => {
    ws.addRow({
      type: b.type,
      provider: s(b.provider) ?? "",
      confirmationNumber: s(b.confirmationNumber) ?? "",
      cost: b.cost ?? null,
      currency: s(b.currency) ?? "",
      bookingDate: b.bookingDate ?? "",
      status: b.status,
      notes: s(b.notes) ?? "",
    });
  });

  const end = lastDataRow(data.bookings.length);
  ws.autoFilter = { from: "A1", to: `H${end}` };

  const totalsRow = end + 1;
  ws.getCell(`B${totalsRow}`).value = "TOTAL (mixes currencies if this trip uses more than one)";
  ws.getCell(`B${totalsRow}`).font = { italic: true };
  ws.getCell(`D${totalsRow}`).value = { formula: `=SUM(D2:D${end})` };
  ws.getCell(`D${totalsRow}`).numFmt = "#,##0.00";
}

// ---------------------------------------------------------------------
// 7. Change Log

const MAX_JSON_CELL_LENGTH = 2000;

function safeJsonCell(value: unknown): string {
  if (value === undefined) return "";
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return "(could not serialize)";
  }
  if (text.length > MAX_JSON_CELL_LENGTH) {
    text = `${text.slice(0, MAX_JSON_CELL_LENGTH)}…(truncated)`;
  }
  return sanitizeJsonText(text);
}

function sanitizeJsonText(text: string): string {
  return s(text) ?? "";
}

function buildChangeLogSheet(workbook: ExcelJS.Workbook, data: TripExportData) {
  const ws = workbook.addWorksheet("Change Log");
  ws.columns = [
    { header: "Timestamp", key: "timestamp", width: 22 },
    { header: "Entity Type", key: "entityType", width: 16 },
    { header: "Entity ID", key: "entityId", width: 20 },
    { header: "Action", key: "action", width: 10 },
    { header: "Source", key: "source", width: 12 },
    { header: "Before (JSON)", key: "before", width: 40 },
    { header: "After (JSON)", key: "after", width: 40 },
  ];
  freezeHeader(ws);

  // listChangeLogForTrip already sorts newest-first.
  data.changeLog.forEach((entry) => {
    ws.addRow({
      timestamp: entry.timestamp,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      source: entry.source,
      before: safeJsonCell(entry.before),
      after: safeJsonCell(entry.after),
    });
  });

  const end = lastDataRow(data.changeLog.length);
  ws.autoFilter = { from: "A1", to: `G${end}` };
}

// ---------------------------------------------------------------------
// 8. Research Sources

function buildResearchSourcesSheet(workbook: ExcelJS.Workbook, data: TripExportData) {
  const ws = workbook.addWorksheet("Research Sources");
  ws.columns = [
    { header: "Source Type", key: "sourceType", width: 16 },
    { header: "Related To", key: "relatedTo", width: 28 },
    { header: "Source Label", key: "sourceLabel", width: 20 },
    { header: "URL", key: "url", width: 36 },
    { header: "Retrieved At", key: "retrievedAt", width: 20 },
    { header: "Verification Status", key: "verificationStatus", width: 16 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  freezeHeader(ws);

  data.researchSources.forEach((r) => {
    ws.addRow({
      sourceType: "General",
      relatedTo: s(r.topic) ?? "",
      sourceLabel: "",
      url: s(r.url) ?? "",
      retrievedAt: r.retrievedAt ?? "",
      verificationStatus: r.verificationStatus,
      notes: s(r.notes) ?? "",
    });
  });

  data.accommodationResults.forEach((a) => {
    ws.addRow({
      sourceType: "Accommodation",
      relatedTo: s(a.name) ?? "",
      sourceLabel: s(a.attribution.sourceLabel) ?? "",
      url: s(a.attribution.sourceUrl) ?? "",
      retrievedAt: a.attribution.retrievedAt,
      verificationStatus: a.attribution.verificationStatus,
      notes: s(a.notes) ?? "",
    });
  });

  data.foodResults.forEach((f) => {
    ws.addRow({
      sourceType: "Food",
      relatedTo: s(f.name) ?? "",
      sourceLabel: s(f.attribution.sourceLabel) ?? "",
      url: s(f.attribution.sourceUrl) ?? "",
      retrievedAt: f.attribution.retrievedAt,
      verificationStatus: f.attribution.verificationStatus,
      notes: s(f.notes) ?? "",
    });
  });

  data.items
    .filter((i) => i.attribution)
    .forEach((item) => {
      ws.addRow({
        sourceType: "Itinerary Item",
        relatedTo: s(item.title) ?? "",
        sourceLabel: s(item.attribution?.sourceLabel) ?? "",
        url: s(item.attribution?.sourceUrl) ?? "",
        retrievedAt: item.attribution?.retrievedAt ?? "",
        verificationStatus: item.attribution?.verificationStatus ?? "",
        notes: "",
      });
    });

  const totalRows = data.researchSources.length + data.accommodationResults.length + data.foodResults.length + data.items.filter((i) => i.attribution).length;
  const end = lastDataRow(totalRows);
  ws.autoFilter = { from: "A1", to: `G${end}` };
}
