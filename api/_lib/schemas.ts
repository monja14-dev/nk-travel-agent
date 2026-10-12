/**
 * The AI gateway's request/response contract. Hand-rolled validation
 * (no new dependency) matching the style already established in
 * src/modules/trips/validation.ts — this file is server-only (imported
 * by api/ai-chat.ts and this directory's own tests), never by src/, so
 * it's safe for it to describe exactly what the model is allowed to
 * send back.
 */

export class RequestValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super(`Invalid AI chat request: ${Object.values(fieldErrors).join("; ")}`);
    this.name = "RequestValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** Thrown when the AI provider's response text can't be parsed into a
 * safe, well-formed { reply, proposals } shape at all (not just one bad
 * proposal within it — see parseProviderOutput for that, softer, case). */
export class MalformedProviderOutputError extends Error {
  constructor(reason: string) {
    super(`The AI's response could not be parsed safely: ${reason}`);
    this.name = "MalformedProviderOutputError";
  }
}

// ---------------------------------------------------------------------
// Request

export interface TripContextSnapshot {
  id: string;
  revision: number;
  name: string;
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  roomCount?: number;
  status: string;
  notes?: string;
}

export interface ProfileContextSnapshot {
  revision: number;
  priorityOrder: string[];
  accommodationPreferences: string;
  foodPreferences: string;
  pace: string;
}

export interface OverrideContextSnapshot {
  revision: number;
  currency: string;
  budgetTargetMin?: number;
  budgetTargetMax?: number;
  mustHaveAmenities: string[];
  hotelVsAirbnbOpen: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Phase 5 — kept in sync by hand with
 * src/modules/ai/buildContext.ts's identical interfaces (see that file's
 * header comment for why this project duplicates these small, stable
 * shapes rather than sharing a type across the src//api boundary). */
export interface ItineraryItemContextSnapshot {
  itemId: string;
  revision: number;
  order: number;
  startTime?: string;
  endTime?: string;
  category: string;
  title: string;
  bookingStatus: string;
}

export interface ItineraryDayContextSnapshot {
  dayId: string;
  date: string;
  dayLabel: string;
  items: ItineraryItemContextSnapshot[];
}

export interface AiChatRequestBody {
  tripId: string;
  message: string;
  context: {
    trip: TripContextSnapshot;
    profile: ProfileContextSnapshot;
    override: OverrideContextSnapshot | null;
    /** Optional (defaults to `[]`) so older/simpler callers that don't
     * send itinerary context still work — only the itinerary screen and
     * the chat panel need to populate this. */
    itinerary: ItineraryDayContextSnapshot[];
  };
  history: ChatTurn[];
}

// Limits — the "appropriate limits" the master prompt asks for. Kept as
// named constants so the gateway, the client, and tests all agree on
// the same numbers rather than each hardcoding their own copy.
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_HISTORY_TURNS = 20;
export const MAX_HISTORY_TURN_LENGTH = 4000;
export const MAX_PROPOSALS_PER_RESPONSE = 5;
export const MAX_REQUEST_BODY_BYTES = 100_000; // 100KB — a chat turn plus trimmed history, generously

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateTripContext(value: unknown, errors: Record<string, string>): void {
  if (typeof value !== "object" || value === null) {
    errors["context.trip"] = "Trip context is required.";
    return;
  }
  const t = value as Record<string, unknown>;
  if (!isNonEmptyString(t.id)) errors["context.trip.id"] = "Trip id is required.";
  if (!isFiniteNumber(t.revision)) errors["context.trip.revision"] = "Trip revision is required.";
  if (!isNonEmptyString(t.name)) errors["context.trip.name"] = "Trip name is required.";
  if (!isNonEmptyString(t.destination)) errors["context.trip.destination"] = "Trip destination is required.";
  if (!isNonEmptyString(t.country)) errors["context.trip.country"] = "Trip country is required.";
  if (!isNonEmptyString(t.startDate)) errors["context.trip.startDate"] = "Trip startDate is required.";
  if (!isNonEmptyString(t.endDate)) errors["context.trip.endDate"] = "Trip endDate is required.";
  if (!isFiniteNumber(t.travelerCount)) errors["context.trip.travelerCount"] = "Trip travelerCount is required.";
  if (!isNonEmptyString(t.status)) errors["context.trip.status"] = "Trip status is required.";
}

function validateProfileContext(value: unknown, errors: Record<string, string>): void {
  if (typeof value !== "object" || value === null) {
    errors["context.profile"] = "Profile context is required.";
    return;
  }
  const p = value as Record<string, unknown>;
  if (!isFiniteNumber(p.revision)) errors["context.profile.revision"] = "Profile revision is required.";
  if (!Array.isArray(p.priorityOrder) || !p.priorityOrder.every((x) => typeof x === "string")) {
    errors["context.profile.priorityOrder"] = "Profile priorityOrder must be an array of strings.";
  }
  if (!isNonEmptyString(p.accommodationPreferences)) {
    errors["context.profile.accommodationPreferences"] = "Profile accommodationPreferences is required.";
  }
  if (!isNonEmptyString(p.foodPreferences)) {
    errors["context.profile.foodPreferences"] = "Profile foodPreferences is required.";
  }
  if (!isNonEmptyString(p.pace)) errors["context.profile.pace"] = "Profile pace is required.";
}

function validateOverrideContext(value: unknown, errors: Record<string, string>): void {
  if (value === null || value === undefined) return; // no override is valid
  if (typeof value !== "object") {
    errors["context.override"] = "Override context, if present, must be an object or null.";
    return;
  }
  const o = value as Record<string, unknown>;
  if (!isFiniteNumber(o.revision)) errors["context.override.revision"] = "Override revision is required.";
  if (!isNonEmptyString(o.currency)) errors["context.override.currency"] = "Override currency is required.";
  if (!Array.isArray(o.mustHaveAmenities) || !o.mustHaveAmenities.every((x) => typeof x === "string")) {
    errors["context.override.mustHaveAmenities"] = "Override mustHaveAmenities must be an array of strings.";
  }
  if (typeof o.hotelVsAirbnbOpen !== "boolean") {
    errors["context.override.hotelVsAirbnbOpen"] = "Override hotelVsAirbnbOpen must be a boolean.";
  }
}

function validateItineraryContext(value: unknown, errors: Record<string, string>): ItineraryDayContextSnapshot[] {
  if (value === undefined) return []; // optional — see AiChatRequestBody's comment
  if (!Array.isArray(value)) {
    errors["context.itinerary"] = "Itinerary context must be an array when provided.";
    return [];
  }
  const days: ItineraryDayContextSnapshot[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== "object" || entry === null) {
      errors[`context.itinerary[${i}]`] = "Each itinerary day entry must be an object.";
      continue;
    }
    const d = entry as Record<string, unknown>;
    if (!isNonEmptyString(d.dayId) || !isNonEmptyString(d.date) || !isNonEmptyString(d.dayLabel)) {
      errors[`context.itinerary[${i}]`] = "Each itinerary day entry needs dayId, date, and dayLabel.";
      continue;
    }
    if (!Array.isArray(d.items)) {
      errors[`context.itinerary[${i}].items`] = "Each itinerary day entry's items must be an array.";
      continue;
    }
    const items: ItineraryItemContextSnapshot[] = [];
    let itemsOk = true;
    for (let j = 0; j < d.items.length; j++) {
      const rawItem = d.items[j];
      if (typeof rawItem !== "object" || rawItem === null) {
        errors[`context.itinerary[${i}].items[${j}]`] = "Each item entry must be an object.";
        itemsOk = false;
        continue;
      }
      const it = rawItem as Record<string, unknown>;
      if (
        !isNonEmptyString(it.itemId) ||
        !isFiniteNumber(it.revision) ||
        !isFiniteNumber(it.order) ||
        !isNonEmptyString(it.category) ||
        !isNonEmptyString(it.title) ||
        !isNonEmptyString(it.bookingStatus)
      ) {
        errors[`context.itinerary[${i}].items[${j}]`] =
          "Each item entry needs itemId, revision, order, category, title, and bookingStatus.";
        itemsOk = false;
        continue;
      }
      items.push({
        itemId: it.itemId,
        revision: it.revision,
        order: it.order,
        startTime: typeof it.startTime === "string" ? it.startTime : undefined,
        endTime: typeof it.endTime === "string" ? it.endTime : undefined,
        category: it.category,
        title: it.title,
        bookingStatus: it.bookingStatus,
      });
    }
    if (!itemsOk) continue;
    days.push({ dayId: d.dayId, date: d.date, dayLabel: d.dayLabel, items });
  }
  return days;
}

function validateHistory(value: unknown, errors: Record<string, string>): ChatTurn[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors["history"] = "History must be an array when provided.";
    return [];
  }
  const turns: ChatTurn[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== "object" || entry === null) {
      errors[`history[${i}]`] = "Each history entry must be an object.";
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (e.role !== "user" && e.role !== "assistant") {
      errors[`history[${i}].role`] = 'History role must be "user" or "assistant".';
      continue;
    }
    if (typeof e.content !== "string") {
      errors[`history[${i}].content`] = "History content must be a string.";
      continue;
    }
    turns.push({ role: e.role, content: e.content.slice(0, MAX_HISTORY_TURN_LENGTH) });
  }
  // Keep only the most recent MAX_HISTORY_TURNS — oldest truncated, not
  // newest, since recent context matters more for a chat turn.
  return turns.slice(-MAX_HISTORY_TURNS);
}

export function validateAiChatRequestBody(data: unknown): AiChatRequestBody {
  const errors: Record<string, string> = {};

  if (typeof data !== "object" || data === null) {
    throw new RequestValidationError({ body: "Request body must be a JSON object." });
  }
  const body = data as Record<string, unknown>;

  if (!isNonEmptyString(body.tripId)) errors.tripId = "tripId is required.";
  if (!isNonEmptyString(body.message)) {
    errors.message = "message is required.";
  } else if (body.message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
  }

  const context = body.context as Record<string, unknown> | undefined;
  let itinerary: ItineraryDayContextSnapshot[] = [];
  if (typeof context !== "object" || context === null) {
    errors.context = "context is required.";
  } else {
    validateTripContext(context.trip, errors);
    validateProfileContext(context.profile, errors);
    validateOverrideContext(context.override, errors);
    itinerary = validateItineraryContext(context.itinerary, errors);
  }

  const history = validateHistory(body.history, errors);

  if (Object.keys(errors).length > 0) {
    throw new RequestValidationError(errors);
  }

  const c = context as Record<string, unknown>;
  return {
    tripId: body.tripId as string,
    message: (body.message as string).slice(0, MAX_MESSAGE_LENGTH),
    context: {
      trip: c.trip as TripContextSnapshot,
      profile: c.profile as ProfileContextSnapshot,
      override: (c.override ?? null) as OverrideContextSnapshot | null,
      itinerary,
    },
    history,
  };
}

// ---------------------------------------------------------------------
// Response / proposals

const TRIP_UPDATE_FIELDS = [
  "name",
  "destination",
  "country",
  "startDate",
  "endDate",
  "travelerCount",
  "roomCount",
  "notes",
] as const;

const TRIP_OVERRIDE_FIELDS = [
  "currency",
  "budgetTargetMin",
  "budgetTargetMax",
  "mustHaveAmenities",
  "hotelVsAirbnbOpen",
  "rawOverrideText",
] as const;

const ITINERARY_ITEM_FIELDS = [
  "order",
  "startTime",
  "endTime",
  "crossesMidnight",
  "newCalendarDay",
  "durationMinutes",
  "travelTimeMinutes",
  "category",
  "title",
  "description",
  "address",
  "transportNotes",
  "openingHours",
  "bookingStatus",
  "farePlanned",
  "fareActual",
  "activityCostPlanned",
  "activityCostActual",
  "currency",
  "comments",
  "actualStatus",
] as const;

export interface TripUpdateProposal {
  kind: "trip-update";
  tripId: string;
  expectedRevision: number;
  changes: Partial<{
    name: string;
    destination: string;
    country: string;
    startDate: string;
    endDate: string;
    travelerCount: number;
    roomCount: number;
    notes: string;
  }>;
  rationale: string;
}

export interface TripOverrideProposal {
  kind: "trip-override-upsert";
  tripId: string;
  expectedRevision: number | null;
  changes: Partial<{
    currency: string;
    budgetTargetMin: number;
    budgetTargetMax: number;
    mustHaveAmenities: string[];
    hotelVsAirbnbOpen: boolean;
    rawOverrideText: string;
  }>;
  rationale: string;
}

/** Phase 5 — see src/modules/ai/types.ts's ItineraryItemProposal for the
 * full reasoning (kept in sync by hand, same duplication-with-a-sync-
 * mechanism pattern as the rest of this file — see noClientLeak.test.ts
 * and this file's own header comment). */
export interface ItineraryItemProposal {
  kind: "itinerary-item-upsert";
  tripId: string;
  dayId: string;
  itemId: string | null;
  expectedRevision: number | null;
  changes: Partial<{
    order: number;
    startTime: string;
    endTime: string;
    crossesMidnight: boolean;
    newCalendarDay: boolean;
    durationMinutes: number;
    travelTimeMinutes: number;
    category: string;
    title: string;
    description: string;
    address: string;
    transportNotes: string;
    openingHours: string;
    bookingStatus: string;
    farePlanned: number;
    fareActual: number;
    activityCostPlanned: number;
    activityCostActual: number;
    currency: string;
    comments: string;
    actualStatus: string;
  }>;
  rationale: string;
}

export type AiProposal = TripUpdateProposal | TripOverrideProposal | ItineraryItemProposal;

export interface AiChatResponseBody {
  reply: string;
  proposals: AiProposal[];
  warnings: string[];
}

/** One field's worth of permissive-but-safe type checking for a
 * `changes` object: copies over only known keys whose value is of the
 * right primitive type, silently dropping anything else onto the floor
 * (the drop itself is reported by the caller, not here). */
function pickTypedChanges<K extends string>(
  raw: Record<string, unknown>,
  allowedKeys: readonly K[],
  typeOf: (key: K) => "string" | "number" | "boolean" | "string[]",
): { changes: Partial<Record<K, unknown>>; droppedKeys: string[] } {
  const changes: Partial<Record<K, unknown>> = {};
  const droppedKeys: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const typedKey = allowedKeys.find((k) => k === key);
    if (!typedKey) {
      droppedKeys.push(key);
      continue;
    }
    const expected = typeOf(typedKey);
    const matches =
      (expected === "string" && typeof value === "string") ||
      (expected === "number" && isFiniteNumber(value)) ||
      (expected === "boolean" && typeof value === "boolean") ||
      (expected === "string[]" && Array.isArray(value) && value.every((v) => typeof v === "string"));
    if (matches) {
      changes[typedKey] = value;
    } else {
      droppedKeys.push(key);
    }
  }
  return { changes, droppedKeys };
}

// Explicit return type annotations matter here: without one, TS infers
// the widened `string` return type rather than a literal union, which
// wouldn't satisfy pickTypedChanges's `typeOf` parameter signature below.
function tripUpdateFieldType(key: (typeof TRIP_UPDATE_FIELDS)[number]): "string" | "number" {
  return key === "travelerCount" || key === "roomCount" ? "number" : "string";
}

function tripOverrideFieldType(
  key: (typeof TRIP_OVERRIDE_FIELDS)[number],
): "string" | "number" | "boolean" | "string[]" {
  if (key === "budgetTargetMin" || key === "budgetTargetMax") return "number";
  if (key === "hotelVsAirbnbOpen") return "boolean";
  if (key === "mustHaveAmenities") return "string[]";
  return "string";
}

const ITINERARY_ITEM_NUMBER_FIELDS = new Set<(typeof ITINERARY_ITEM_FIELDS)[number]>([
  "order",
  "durationMinutes",
  "travelTimeMinutes",
  "farePlanned",
  "fareActual",
  "activityCostPlanned",
  "activityCostActual",
]);
const ITINERARY_ITEM_BOOLEAN_FIELDS = new Set<(typeof ITINERARY_ITEM_FIELDS)[number]>([
  "crossesMidnight",
  "newCalendarDay",
]);

function itineraryItemFieldType(
  key: (typeof ITINERARY_ITEM_FIELDS)[number],
): "string" | "number" | "boolean" | "string[]" {
  if (ITINERARY_ITEM_NUMBER_FIELDS.has(key)) return "number";
  if (ITINERARY_ITEM_BOOLEAN_FIELDS.has(key)) return "boolean";
  return "string"; // category/bookingStatus/actualStatus are runtime strings here — the repo layer enforces the exact enum
}

/** Validates one proposal object from the model's output. Returns the
 * typed proposal, or `null` with a reason if it doesn't match the
 * contract closely enough to trust — the caller drops it and keeps
 * going rather than failing the whole response over one bad proposal. */
function parseProposal(raw: unknown): { proposal: AiProposal | null; reason?: string; droppedKeys?: string[] } {
  if (typeof raw !== "object" || raw === null) {
    return { proposal: null, reason: "not an object" };
  }
  const p = raw as Record<string, unknown>;

  if (!isNonEmptyString(p.tripId)) return { proposal: null, reason: "missing tripId" };
  if (!isNonEmptyString(p.rationale)) return { proposal: null, reason: "missing rationale" };
  if (typeof p.changes !== "object" || p.changes === null) {
    return { proposal: null, reason: "missing changes object" };
  }

  if (p.kind === "trip-update") {
    if (!isFiniteNumber(p.expectedRevision)) {
      return { proposal: null, reason: "trip-update missing numeric expectedRevision" };
    }
    const { changes, droppedKeys } = pickTypedChanges(
      p.changes as Record<string, unknown>,
      TRIP_UPDATE_FIELDS,
      tripUpdateFieldType,
    );
    if (Object.keys(changes).length === 0) {
      return { proposal: null, reason: "trip-update has no recognized change fields" };
    }
    return {
      proposal: {
        kind: "trip-update",
        tripId: p.tripId,
        expectedRevision: p.expectedRevision,
        // pickTypedChanges already checked each value's runtime type
        // against tripUpdateFieldType above — this assertion just tells
        // TS what that check already guarantees, since its own return
        // type is necessarily generic (Partial<Record<K, unknown>>).
        changes: changes as TripUpdateProposal["changes"],
        rationale: p.rationale,
      },
      droppedKeys,
    };
  }

  if (p.kind === "trip-override-upsert") {
    // Bound to a local const (rather than narrowing `p.expectedRevision`
    // in place) so the `number | null` narrowing below is unambiguous —
    // narrowing a `Record<string, unknown>` property through a negated
    // `&&` condition is the kind of case not worth relying on.
    const expectedRevision = p.expectedRevision;
    if (expectedRevision !== null && !isFiniteNumber(expectedRevision)) {
      return { proposal: null, reason: "trip-override-upsert expectedRevision must be a number or null" };
    }
    const { changes, droppedKeys } = pickTypedChanges(
      p.changes as Record<string, unknown>,
      TRIP_OVERRIDE_FIELDS,
      tripOverrideFieldType,
    );
    if (Object.keys(changes).length === 0) {
      return { proposal: null, reason: "trip-override-upsert has no recognized change fields" };
    }
    return {
      proposal: {
        kind: "trip-override-upsert",
        tripId: p.tripId,
        expectedRevision,
        // Same reasoning as the trip-update case above.
        changes: changes as TripOverrideProposal["changes"],
        rationale: p.rationale,
      },
      droppedKeys,
    };
  }

  if (p.kind === "itinerary-item-upsert") {
    if (!isNonEmptyString(p.dayId)) return { proposal: null, reason: "itinerary-item-upsert missing dayId" };

    const itemId = p.itemId;
    if (itemId !== null && !isNonEmptyString(itemId)) {
      return { proposal: null, reason: "itinerary-item-upsert itemId must be a string or null" };
    }
    const expectedRevision = p.expectedRevision;
    if (expectedRevision !== null && !isFiniteNumber(expectedRevision)) {
      return { proposal: null, reason: "itinerary-item-upsert expectedRevision must be a number or null" };
    }
    // A new item (itemId: null) has nothing to be stale against yet; an
    // update to an existing item must carry the revision it was read at.
    if (itemId === null && expectedRevision !== null) {
      return { proposal: null, reason: "itinerary-item-upsert: a new item (itemId: null) must have expectedRevision: null" };
    }
    if (itemId !== null && expectedRevision === null) {
      return { proposal: null, reason: "itinerary-item-upsert: updating an existing item requires a numeric expectedRevision" };
    }

    const { changes, droppedKeys } = pickTypedChanges(
      p.changes as Record<string, unknown>,
      ITINERARY_ITEM_FIELDS,
      itineraryItemFieldType,
    );
    if (Object.keys(changes).length === 0) {
      return { proposal: null, reason: "itinerary-item-upsert has no recognized change fields" };
    }
    return {
      proposal: {
        kind: "itinerary-item-upsert",
        tripId: p.tripId,
        dayId: p.dayId,
        itemId,
        expectedRevision,
        changes: changes as ItineraryItemProposal["changes"],
        rationale: p.rationale,
      },
      droppedKeys,
    };
  }

  return { proposal: null, reason: `unrecognized proposal kind "${String(p.kind)}"` };
}

/**
 * Parses and validates the AI provider's raw text output. Strict about
 * the top-level shape (a response with no usable `reply` can't be shown
 * to anyone, so that throws), permissive-but-honest about individual
 * proposals (a malformed one is dropped and reported via `warnings`,
 * not allowed to silently corrupt the whole turn or silently vanish).
 */
export function parseProviderOutput(raw: string): AiChatResponseBody {
  const jsonText = extractJsonText(raw);

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new MalformedProviderOutputError("response text is not valid JSON");
  }

  if (typeof data !== "object" || data === null) {
    throw new MalformedProviderOutputError("response JSON is not an object");
  }
  const body = data as Record<string, unknown>;

  if (!isNonEmptyString(body.reply)) {
    throw new MalformedProviderOutputError('response is missing a usable "reply" string');
  }

  const warnings: string[] = [];
  const proposals: AiProposal[] = [];

  if (body.proposals !== undefined) {
    if (!Array.isArray(body.proposals)) {
      warnings.push('"proposals" was present but not an array — ignored.');
    } else {
      for (const rawProposal of body.proposals) {
        if (proposals.length >= MAX_PROPOSALS_PER_RESPONSE) {
          warnings.push(`More than ${MAX_PROPOSALS_PER_RESPONSE} proposals were returned — extras were dropped.`);
          break;
        }
        const { proposal, reason, droppedKeys } = parseProposal(rawProposal);
        if (proposal) {
          proposals.push(proposal);
          // Phase 6 fix: pickTypedChanges already computes which of a
          // proposal's change fields it silently dropped (unrecognized
          // name, or right name but wrong runtime type — e.g. the model
          // sending travelerCount as a string). That drop was previously
          // discarded here instead of reaching anyone — the proposal
          // still looked complete and fully approvable even though part
          // of what the model asked to change was quietly never applied.
          if (droppedKeys && droppedKeys.length > 0) {
            warnings.push(
              `A "${proposal.kind}" proposal's field(s) ${droppedKeys.join(", ")} were ignored ` +
                `(unrecognized or the wrong type) — only its other fields are reflected in the proposal shown.`,
            );
          }
        } else {
          warnings.push(`A proposal from the AI was dropped (${reason ?? "unrecognized shape"}).`);
        }
      }
    }
  }

  return { reply: body.reply, proposals, warnings };
}

/** The model is instructed not to wrap its JSON in a code fence, but
 * strips one defensively if present rather than failing outright over a
 * formatting slip that doesn't actually make the content unsafe. */
function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}
