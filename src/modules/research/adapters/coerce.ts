import type { MandatoryFee } from "../../../db/schema";
import type { FieldErrors } from "../validation";

/**
 * Shared raw-input coercion for the manual adapters. Deliberately
 * distinguishes "field omitted" (fine, becomes undefined — the real
 * "unavailable field" case the master prompt asks to label) from "field
 * provided but not parseable" (a field error, not a silent drop — a
 * typo in a price shouldn't quietly vanish into "not available").
 */

export function coerceOptionalString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return String(value);
}

export function coerceOptionalNumber(
  raw: Record<string, unknown>,
  key: string,
  errors: FieldErrors,
  errorKey: string = key,
): number | undefined {
  const value = raw[key];
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    errors[errorKey] = `"${errorKey}" must be a number.`;
    return undefined;
  }
  return n;
}

export function coerceStringArray(raw: Record<string, unknown>, key: string, errors: FieldErrors): string[] {
  const value = raw[key];
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) {
    if (!value.every((v) => typeof v === "string")) {
      errors[key] = `"${key}" must be a list of strings.`;
      return [];
    }
    return value.map((v) => v.trim()).filter((v) => v !== "");
  }
  if (typeof value === "string") {
    // Convenience for a plain-text form field: a comma-separated list.
    return value
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v !== "");
  }
  errors[key] = `"${key}" must be a list, or a comma-separated string.`;
  return [];
}

export function coerceMandatoryFees(raw: Record<string, unknown>, key: string, errors: FieldErrors): MandatoryFee[] {
  const value = raw[key];
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) {
    errors[key] = `"${key}" must be a list of fees.`;
    return [];
  }

  const fees: MandatoryFee[] = [];
  value.forEach((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      errors[`${key}[${i}]`] = "Each mandatory fee must be an object with at least a label.";
      return;
    }
    const e = entry as Record<string, unknown>;
    const label = coerceOptionalString(e, "label");
    if (!label) {
      errors[`${key}[${i}].label`] = "Each mandatory fee needs a label.";
      return;
    }
    const amount = coerceOptionalNumber(e, "amount", errors, `${key}[${i}].amount`);
    const currency = coerceOptionalString(e, "currency");
    const notes = coerceOptionalString(e, "notes");
    fees.push({ label, amount, currency, notes });
  });
  return fees;
}
