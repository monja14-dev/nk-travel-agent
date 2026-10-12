/**
 * Typed errors so the UI can distinguish "you typed something invalid"
 * from "this was edited elsewhere since you loaded it" from "this
 * disappeared" — three very different situations that need three
 * different messages, not one generic catch block.
 */

export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super(`Validation failed: ${Object.values(fieldErrors).join("; ")}`);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Thrown when a write's `expectedRevision` doesn't match the stored
 * record's current revision — i.e. the record changed since the caller
 * last read it. This is the guard against silently overwriting newer
 * data (required by the master prompt's data-integrity rules), whether
 * the stale write came from a second tab, a second device, or later an
 * AI proposal built from an outdated snapshot.
 */
export class StaleRevisionError extends Error {
  constructor(entityType: string, id: string) {
    super(
      `${entityType} "${id}" was changed since it was loaded. Reload it and try again ` +
        `rather than overwrite the newer version.`,
    );
    this.name = "StaleRevisionError";
  }
}

export class NotFoundError extends Error {
  constructor(entityType: string, id: string) {
    super(`${entityType} "${id}" was not found.`);
    this.name = "NotFoundError";
  }
}

/** Thrown by restoreBackup() validation — before anything is touched. */
export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBackupError";
  }
}

/** Phase 4: thrown when a new accommodation/food result's name matches
 * (after normalization — see dedup.ts) one already saved for the same
 * trip. Carries the existing record's id so the caller can point at it
 * rather than just saying "no". */
export class DuplicateResultError extends Error {
  readonly existingId: string;

  constructor(entityType: string, name: string, existingId: string) {
    super(`"${name}" looks like a duplicate of a ${entityType} already saved for this trip.`);
    this.name = "DuplicateResultError";
    this.existingId = existingId;
  }
}
