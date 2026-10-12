import { collectTripExportData } from "./collectExportData";
import { buildTripWorkbook } from "./buildWorkbook";

/** "Boracay Honeymoon" -> "Boracay_Honeymoon" — kept ASCII-plain so the
 * filename is safe across Windows/macOS/Linux without needing full
 * RFC 5987 filename encoding. */
function slugifyForFilename(value: string): string {
  const slug = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "trip";
}

/**
 * Builds the full export (collect data -> build workbook -> serialize)
 * and returns a browser Blob plus a suggested filename. Split out from
 * `downloadTripXlsx` below so a future "export" button elsewhere, or a
 * test, can get the Blob without triggering a browser download.
 */
export async function exportTripToXlsxBlob(tripId: string): Promise<{ blob: Blob; filename: string }> {
  const data = await collectTripExportData(tripId);
  const workbook = buildTripWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const datePart = data.generatedAt.slice(0, 10);
  const filename = `${slugifyForFilename(data.trip.name)}_${datePart}.xlsx`;
  return { blob, filename };
}

/** Triggers a real browser download of the trip's XLSX export. Only
 * callable from the browser (uses `document`/`URL.createObjectURL`) —
 * the UI button in TripDetails.tsx is the only caller. */
export async function downloadTripXlsx(tripId: string): Promise<void> {
  const { blob, filename } = await exportTripToXlsxBlob(tripId);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
