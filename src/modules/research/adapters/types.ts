import type { AccommodationResultInput, FieldErrors, FoodResultInput } from "../validation";

/**
 * The "modular research adapters" the master prompt asks for. Each
 * adapter is responsible for turning whatever raw shape its source
 * actually produces — a hand-filled form today, a provider's JSON
 * response if one is ever integrated — into this app's normalized
 * result schema (AccommodationResultInput / FoodResultInput, both in
 * ../validation.ts). `raw` is deliberately `Record<string, unknown>`,
 * not a typed form shape, so an adapter genuinely has to validate and
 * coerce rather than assume its caller already did — the same
 * discipline Phase 3's gateway applies to the AI's output.
 */

export interface AdapterAvailability {
  available: boolean;
  /** Why not, when `available` is false — e.g. "no API key configured".
   * Always set when unavailable, so the UI (or a log) can say more than
   * just "no". */
  reason?: string;
}

/** A true discriminated union (not `{ok: boolean; candidate?: T}`) so
 * `candidate` narrows to defined — not just optional — the moment `ok`
 * is checked, with no separate `!candidate` fallback check needed at
 * every call site. */
export type NormalizeOutcome<T> =
  | { ok: true; candidate: T; fieldErrors: Record<string, never> }
  | { ok: false; fieldErrors: FieldErrors };

export interface AccommodationAdapter {
  id: string;
  label: string;
  /** Whether this adapter can be used right now — e.g. does it have the
   * credentials it would need. The manual adapter is always available;
   * a hypothetical live-API adapter would check for a configured key
   * here and report `available: false` rather than attempt a call it
   * knows will fail. */
  checkAvailability(): AdapterAvailability;
  normalize(raw: Record<string, unknown>): NormalizeOutcome<AccommodationResultInput>;
}

export interface FoodAdapter {
  id: string;
  label: string;
  checkAvailability(): AdapterAvailability;
  normalize(raw: Record<string, unknown>): NormalizeOutcome<FoodResultInput>;
}
