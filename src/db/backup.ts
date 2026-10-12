import { getReadyDb, withWriteTransaction, ALL_STORE_NAMES, type StoreName } from "./client";
import { SCHEMA_VERSION } from "./schema";
import { InvalidBackupError } from "../lib/errors";

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  data: Partial<Record<StoreName, unknown[]>>;
}

/** Master prompt §6: "Export complete, versioned JSON backup." Iterates
 * every known store generically so a future module's new store is backed
 * up automatically — nothing here needs editing when one is added, only
 * ALL_STORE_NAMES in client.ts does. */
export async function exportBackup(): Promise<BackupPayload> {
  const db = getReadyDb();
  const data: Partial<Record<StoreName, unknown[]>> = {};
  for (const storeName of ALL_STORE_NAMES) {
    data[storeName] = await db.getAll(storeName);
  }
  return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Throws InvalidBackupError (and touches nothing) if the shape is wrong,
 * rather than letting a malformed file reach the destructive restore
 * step — master prompt §6: "Reject invalid backups without modifying
 * existing data." */
function validateBackupPayload(payload: unknown): asserts payload is BackupPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new InvalidBackupError("Backup file is not a valid JSON object.");
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.schemaVersion !== "number") {
    throw new InvalidBackupError("Backup is missing a valid schemaVersion.");
  }
  if (p.schemaVersion > SCHEMA_VERSION) {
    throw new InvalidBackupError(
      `Backup was made with schema version ${p.schemaVersion}, newer than this app's ` +
        `${SCHEMA_VERSION}. Update the app before restoring it.`,
    );
  }
  if (typeof p.exportedAt !== "string") {
    throw new InvalidBackupError("Backup is missing a valid exportedAt timestamp.");
  }
  if (typeof p.data !== "object" || p.data === null) {
    throw new InvalidBackupError("Backup is missing its data payload.");
  }

  const data = p.data as Record<string, unknown>;
  for (const storeName of ALL_STORE_NAMES) {
    if (storeName in data && !Array.isArray(data[storeName])) {
      throw new InvalidBackupError(`Backup's "${storeName}" entry is not an array.`);
    }
  }
}

export interface RestoreResult {
  /** A fresh export of what was in the database immediately before this
   * restore overwrote it — the caller should offer this for download, so
   * a bad restore is itself recoverable. */
  safetyBackup: BackupPayload;
}

/**
 * Validates, takes a safety backup of the CURRENT data, then replaces
 * every store's contents with the backup's data — all inside one
 * transaction, so a failure partway through leaves the original data
 * untouched rather than half-restored (master prompt §5/§6: transactional
 * restore, safety backup before a destructive operation).
 */
export async function restoreBackup(payload: unknown): Promise<RestoreResult> {
  validateBackupPayload(payload); // throws before anything is touched if invalid

  const safetyBackup = await exportBackup();

  await withWriteTransaction(ALL_STORE_NAMES, async (tx) => {
    for (const storeName of ALL_STORE_NAMES) {
      const store = tx.objectStore(storeName);
      await store.clear();
      const records = payload.data[storeName] ?? [];
      for (const record of records) {
        // `as any`: each store's value type differs, and this loop is
        // intentionally generic across all of them. The real safety net
        // isn't the type system here — it's validateBackupPayload above
        // (shape-checked before this runs) plus every record having
        // round-tripped through exportBackup() in the first place, so
        // its shape already matches what this store expects.
        await store.put(record as any);
      }
    }
  });

  return { safetyBackup };
}
