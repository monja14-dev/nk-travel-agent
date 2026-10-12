/**
 * Formula-injection protection for spreadsheet export.
 *
 * Every user-authored free-text value (a title, an address, a note
 * someone typed in) is written into a workbook cell as a plain string via
 * ExcelJS's normal string-cell path, which ExcelJS/Excel do not treat as a
 * formula just because the text happens to start with "=" — formulas are
 * only created in this codebase by explicitly setting `{ formula: ... }`,
 * never from user data. Even so, this app defensively mirrors OWASP's
 * CSV/XLSX-injection mitigation (prefix a leading apostrophe) for anything
 * whose first character is one that a spreadsheet application, a CSV
 * re-export, or a clipboard paste could interpret as the start of a
 * formula or command: `= + - @` plus a literal tab or carriage return,
 * which Excel also treats as leading whitespace it skips before looking
 * for one of those characters. This is applied uniformly, regardless of
 * the ongoing debate over whether native XLSX cell-type metadata already
 * fully protects against it — belt-and-suspenders, cheap to do, never
 * wrong for a value that didn't need it in the first place.
 */

const DANGEROUS_LEADING_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Returns the value unchanged if it's safe, or prefixed with a leading
 * apostrophe if its first character could be interpreted as the start of
 * a formula/command by a spreadsheet application. Non-string values pass
 * straight through untouched (only text cells can carry this risk). */
export function sanitizeForSpreadsheet(value: string): string {
  if (value.length === 0) return value;
  if (DANGEROUS_LEADING_CHARS.has(value[0])) return `'${value}`;
  return value;
}

/** Same rule, but passes through `undefined`/non-strings untouched —
 * convenience for the many optional string fields threaded into the
 * workbook builder below. */
export function s(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  return sanitizeForSpreadsheet(value);
}
