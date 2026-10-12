import { useState } from "react";
import { exportBackup, restoreBackup, type BackupPayload } from "../../db/backup";
import { ALL_STORE_NAMES } from "../../db/client";
import { InvalidBackupError } from "../../lib/errors";
import type { View } from "../../navigation/types";

/**
 * Phase 6: exportBackup()/restoreBackup() have existed and been tested
 * since Phase 2, but — per every phase's "Known issues" section since —
 * there was never a screen that actually let a person reach them. That
 * made the master prompt's disaster-recovery test ("export a backup,
 * initialize a clean browser, restore it, compare records") impossible
 * to actually perform by hand, not just untested — this screen is what
 * makes it possible, not a feature added for its own sake.
 */

interface BackupRestoreProps {
  onNavigate: (view: View) => void;
}

type ExportState = "idle" | "working" | "error";
type RestoreState = "idle" | "working" | "done" | "error";

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Deferred, not immediate: revoking the URL synchronously can race the
  // click-triggered download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupFilename(prefix: string): string {
  // Colons aren't valid in a Windows filename — toISOString()'s ":" and
  // "." both need stripping, not just the latter.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.json`;
}

function countRecords(data: BackupPayload["data"]): number {
  return ALL_STORE_NAMES.reduce((sum, name) => sum + (data[name]?.length ?? 0), 0);
}

export default function BackupRestore({ onNavigate }: BackupRestoreProps) {
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportError, setExportError] = useState<string | null>(null);

  const [restoreState, setRestoreState] = useState<RestoreState>("idle");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoredCount, setRestoredCount] = useState<number | null>(null);
  const [safetyBackup, setSafetyBackup] = useState<BackupPayload | null>(null);

  async function handleExport() {
    setExportState("working");
    setExportError(null);
    try {
      const backup = await exportBackup();
      downloadJson(backupFilename("nk-travel-agent-backup"), backup);
      setExportState("idle");
    } catch (err) {
      setExportState("error");
      setExportError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRestoreFile(file: File) {
    setRestoreState("working");
    setRestoreError(null);
    setRestoredCount(null);
    setSafetyBackup(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new InvalidBackupError("That file isn't valid JSON.");
      }
      const { safetyBackup: pre } = await restoreBackup(parsed);
      // Re-export rather than trust the restored-from payload's own
      // counts, so what's displayed reflects what's actually in the
      // database right now, after restore — the same "verify against
      // live data, not the snapshot" discipline used everywhere else in
      // this app (previewProposal.ts, the itinerary conflict checker).
      const after = await exportBackup();
      setRestoredCount(countRecords(after.data));
      setSafetyBackup(pre);
      setRestoreState("done");
    } catch (err) {
      setRestoreState("error");
      setRestoreError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="max-w-2xl w-full mx-auto px-6 py-8">
      <button
        type="button"
        onClick={() => onNavigate({ name: "dashboard" })}
        className="text-sm text-slate-500 underline mb-4"
      >
        ← Back to your trips
      </button>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Backup &amp; Restore</h1>
      <p className="text-sm text-slate-500 mb-6">
        Everything in this app — every trip, itinerary, budget line, booking, and reminder — lives only in this
        browser's local storage. A backup is the only way to move it to another browser or device, or recover it
        if this browser's data is ever cleared.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Download a backup</h2>
        <p className="text-xs text-slate-500 mb-3">
          Saves everything in this app right now to a single .json file on your device.
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exportState === "working"}
          className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          {exportState === "working" ? "Preparing…" : "Download backup"}
        </button>
        {exportState === "error" ? <p className="text-red-700 text-sm mt-2">Couldn't export: {exportError}</p> : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Restore from a backup file</h2>
        <p className="text-xs text-slate-500 mb-3">
          <strong>This replaces everything currently in this app</strong> with what's in the chosen file. An
          invalid file is rejected and changes nothing. A fresh backup of what's about to be replaced is offered
          for download below first, so a restore is itself recoverable if it turns out to be the wrong file.
        </p>
        <input
          type="file"
          accept="application/json"
          disabled={restoreState === "working"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow picking the same file again after an error
            if (file) void handleRestoreFile(file);
          }}
          className="text-sm"
        />
        {restoreState === "working" ? <p className="text-slate-500 text-sm mt-2">Restoring…</p> : null}
        {restoreState === "error" ? (
          <p className="text-red-700 text-sm mt-2">
            Couldn't restore — nothing was changed: {restoreError}
          </p>
        ) : null}
        {restoreState === "done" ? (
          <div className="text-sm mt-2">
            <p className="text-emerald-700">
              Restored successfully — {restoredCount} record{restoredCount === 1 ? "" : "s"} across every store.
            </p>
            {safetyBackup ? (
              <button
                type="button"
                onClick={() => downloadJson(backupFilename("nk-travel-agent-pre-restore-safety-backup"), safetyBackup)}
                className="text-xs font-medium text-slate-900 underline mt-1"
              >
                Download what was here just before this restore
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
