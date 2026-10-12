import { useEffect, useState } from "react";
import { initDb, getDbStatus, type DbStatus } from "./db";

/**
 * Phase 1 shell. Deliberately NOT a feature screen — just proof that the
 * app boots, opens IndexedDB, and shows the four states the data-integrity
 * rules require (loading / ready / read-only / error). Stay Hunter, Food
 * Hunter, itinerary, and budget screens are later phases.
 */
export default function App() {
  const [status, setStatus] = useState<DbStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDb()
      .then(() => setStatus(getDbStatus().status))
      .catch(() => {
        const s = getDbStatus();
        setStatus(s.status);
        setError(s.error);
      });
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
      <div className="max-w-md w-full px-6 py-8 rounded-lg border border-slate-200 bg-white shadow-sm">
        <h1 className="text-xl font-semibold mb-2">NK Travel Agent</h1>
        <p className="text-sm text-slate-500 mb-4">Phase 1 scaffold — no trip features yet.</p>

        {status === "idle" || status === "loading" ? (
          <p className="text-slate-700">Initializing local database…</p>
        ) : null}

        {status === "ready" ? (
          <p className="text-emerald-700">Local database ready.</p>
        ) : null}

        {status === "read-only" ? (
          <p className="text-amber-700">
            Read-only: this app is open in another tab that controls the current upgrade.
          </p>
        ) : null}

        {status === "error" ? (
          <p className="text-red-700">Database error: {error ?? "unknown error"}</p>
        ) : null}
      </div>
    </main>
  );
}
