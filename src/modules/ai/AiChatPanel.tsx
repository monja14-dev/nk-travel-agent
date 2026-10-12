import { useEffect, useRef, useState, type FormEvent } from "react";
import { getTrip } from "../../db/repositories/tripsRepo";
import { getOrCreateDefaultProfile } from "../../db/repositories/travelerProfilesRepo";
import { getOverrideForTrip } from "../../db/repositories/tripOverridesRepo";
import { ensureDaysForTripRange } from "../../db/repositories/itineraryDaysRepo";
import { listItemsForTrip } from "../../db/repositories/itineraryItemsRepo";
import {
  buildTripContextSnapshot,
  buildProfileContextSnapshot,
  buildOverrideContextSnapshot,
  buildItineraryContextSnapshot,
} from "./buildContext";
import { previewProposal, type ProposalPreview } from "./previewProposal";
import { applyProposal } from "./applyProposal";
import type { AiProposal, AiChatResponseBody, AiChatErrorBody, ChatTurn } from "./types";
import type { Trip } from "../../db/schema";
import type { View } from "../../navigation/types";

interface AiChatPanelProps {
  tripId: string;
  onNavigate: (view: View) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  proposals?: ProposalEntry[];
}

type ProposalStatus = "checking" | "ready" | "stale" | "not-found" | "applying" | "applied" | "rejected" | "error";

interface ProposalEntry {
  localId: string;
  proposal: AiProposal;
  status: ProposalStatus;
  preview?: ProposalPreview;
  errorMessage?: string;
}

type LoadState = "loading" | "ready" | "not-found" | "error";

let nextLocalId = 0;

export default function AiChatPanel({ tripId, onNavigate }: AiChatPanelProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrip(tripId), getOrCreateDefaultProfile(), getOverrideForTrip(tripId)])
      .then(([loadedTrip]) => {
        if (cancelled) return;
        if (!loadedTrip) {
          setLoadState("not-found");
          return;
        }
        setTrip(loadedTrip);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  // Abort any in-flight request if the person navigates away mid-send.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  async function refreshProposalPreviews(entries: ProposalEntry[]): Promise<ProposalEntry[]> {
    return Promise.all(
      entries.map(async (entry) => {
        try {
          const preview = await previewProposal(entry.proposal);
          const status: ProposalStatus = preview.notFound ? "not-found" : preview.isStale ? "stale" : "ready";
          return { ...entry, preview, status };
        } catch (err) {
          return { ...entry, status: "error" as const, errorMessage: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || sending || !trip) return;

    setSendError(null);
    setWarnings([]);
    setDraft("");
    const userMessage: ChatMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setSending(true);

    try {
      // Re-read everything fresh right before sending, rather than
      // reusing the `trip` state captured on page load — if the person
      // approved an earlier proposal in this same conversation, the
      // trip's revision has already moved on, and sending a stale
      // revision here would make the AI's very next proposal look
      // "stale" against data that's actually current.
      const [freshTrip, profile, override] = await Promise.all([
        getTrip(tripId),
        getOrCreateDefaultProfile(),
        getOverrideForTrip(tripId),
      ]);
      if (!freshTrip) {
        setSendError("This trip no longer exists.");
        return;
      }
      // Bootstraps any missing day records for this trip's date range
      // (a no-op once they already exist — see ensureDaysForTripRange)
      // so the AI always has a real dayId to target, then reads every
      // item fresh, same "don't trust anything cached" discipline as
      // the trip/profile/override reads above.
      const days = await ensureDaysForTripRange(tripId, freshTrip.startDate, freshTrip.endDate);
      const items = await listItemsForTrip(tripId);

      const history: ChatTurn[] = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          tripId,
          message,
          context: {
            trip: buildTripContextSnapshot(freshTrip),
            profile: buildProfileContextSnapshot(profile),
            override: buildOverrideContextSnapshot(override),
            itinerary: buildItineraryContextSnapshot(days, items),
          },
          history,
        }),
      });

      if (requestId !== requestIdRef.current) return; // a newer send (or a cancel) has since superseded this one

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({ error: "The AI didn't respond successfully." }))) as AiChatErrorBody;
        setSendError(errorBody.error);
        return;
      }

      const body = (await response.json()) as AiChatResponseBody;
      if (requestId !== requestIdRef.current) return;

      const entries: ProposalEntry[] = body.proposals.map((proposal) => ({
        localId: `proposal_${nextLocalId++}`,
        proposal,
        status: "checking",
      }));
      const previewed = await refreshProposalPreviews(entries);
      if (requestId !== requestIdRef.current) return;

      setMessages((prev) => [...prev, { role: "assistant", content: body.reply, proposals: previewed }]);
      setWarnings(body.warnings);
    } catch (err) {
      if (requestId !== requestIdRef.current) return; // cancelled — don't surface an error for a turn we abandoned
      if (err instanceof DOMException && err.name === "AbortError") {
        // Cancelled by the person — intentionally silent, not an error.
        return;
      }
      setSendError(err instanceof Error ? err.message : "Something went wrong talking to the AI.");
    } finally {
      if (requestId === requestIdRef.current) setSending(false);
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
    requestIdRef.current++; // invalidate any in-flight response so it can't be applied late
    setSending(false);
  }

  function updateProposalEntry(messageIndex: number, localId: string, patch: Partial<ProposalEntry>) {
    setMessages((prev) =>
      prev.map((m, i) => {
        if (i !== messageIndex || !m.proposals) return m;
        return {
          ...m,
          proposals: m.proposals.map((p) => (p.localId === localId ? { ...p, ...patch } : p)),
        };
      }),
    );
  }

  async function handleApprove(messageIndex: number, entry: ProposalEntry) {
    updateProposalEntry(messageIndex, entry.localId, { status: "applying" });
    const result = await applyProposal(entry.proposal);
    if (result.status === "applied") {
      updateProposalEntry(messageIndex, entry.localId, { status: "applied" });
      // The header above (and any later proposal's staleness check) reads
      // `trip` from state, which was only set on initial load — refresh it
      // so an applied trip-update shows up immediately rather than only
      // after leaving and re-entering this screen.
      if (entry.proposal.kind === "trip-update") {
        const updated = await getTrip(tripId);
        if (updated) setTrip(updated);
      }
    } else if (result.status === "stale") {
      updateProposalEntry(messageIndex, entry.localId, { status: "stale" });
    } else if (result.status === "not-found") {
      updateProposalEntry(messageIndex, entry.localId, { status: "not-found" });
    } else {
      updateProposalEntry(messageIndex, entry.localId, { status: "error", errorMessage: result.message });
    }
  }

  function handleReject(messageIndex: number, entry: ProposalEntry) {
    updateProposalEntry(messageIndex, entry.localId, { status: "rejected" });
  }

  if (loadState === "loading") {
    return <div className="max-w-2xl w-full mx-auto px-6 py-8 text-slate-500 text-sm">Loading…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="max-w-2xl w-full mx-auto px-6 py-8">
        <p className="text-slate-700 mb-3">That trip no longer exists.</p>
        <button
          type="button"
          onClick={() => onNavigate({ name: "dashboard" })}
          className="text-sm font-medium text-slate-900 underline"
        >
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error" || !trip) {
    return (
      <div className="max-w-2xl w-full mx-auto px-6 py-8">
        <p className="text-red-700 text-sm">Couldn't load this trip: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl w-full mx-auto px-6 py-8">
      <button
        type="button"
        onClick={() => onNavigate({ name: "trip-details", tripId })}
        className="text-sm text-slate-500 underline mb-4"
      >
        ← Back to {trip.name}
      </button>

      <h1 className="text-xl font-semibold text-slate-900 mb-1">Ask NK AI</h1>
      <p className="text-sm text-slate-500 mb-6">
        About <span className="font-medium">{trip.name}</span>. The AI can suggest changes to this trip or its
        preferences — it never saves anything on its own. Every suggestion shows up below for you to review and
        approve or reject.
      </p>

      <div className="space-y-4 mb-6">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No messages yet — ask about this trip below.</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[85%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap text-left ${
                m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {m.content}
            </div>
            {m.proposals && m.proposals.length > 0 ? (
              <div className="mt-2 space-y-2">
                {m.proposals.map((entry) => (
                  <ProposalCard
                    key={entry.localId}
                    entry={entry}
                    onApprove={() => handleApprove(i, entry)}
                    onReject={() => handleReject(i, entry)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {warnings.length > 0 ? (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      ) : null}

      {sendError ? <p className="text-red-700 text-sm mb-4">{sendError}</p> : null}

      <form onSubmit={handleSend} className="flex items-end gap-2">
        <textarea
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          rows={2}
          placeholder="Ask about this trip…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
        />
        {sending ? (
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim()}
            className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}

function ProposalCard({
  entry,
  onApprove,
  onReject,
}: {
  entry: ProposalEntry;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { proposal, status, preview, errorMessage } = entry;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
      <p className="font-medium text-slate-900 mb-1">{proposalKindLabel(proposal.kind)}</p>
      <p className="text-slate-600 mb-2">{proposal.rationale}</p>

      {preview && preview.changes.length > 0 ? (
        <ul className="mb-2 space-y-0.5 text-xs text-slate-700">
          {preview.changes.map((c) => (
            <li key={c.field}>
              <span className="font-medium">{c.field}:</span> {formatValue(c.from)} → {formatValue(c.to)}
            </li>
          ))}
        </ul>
      ) : null}

      {status === "checking" ? <p className="text-xs text-slate-400">Checking against the latest data…</p> : null}
      {status === "stale" ? (
        <p className="text-xs text-amber-700 mb-2">
          This has changed since the AI looked at it — ask again to get an up-to-date suggestion.
        </p>
      ) : null}
      {status === "not-found" ? (
        <p className="text-xs text-amber-700 mb-2">This trip no longer exists.</p>
      ) : null}
      {status === "applied" ? <p className="text-xs text-emerald-700">Applied.</p> : null}
      {status === "rejected" ? <p className="text-xs text-slate-400">Rejected.</p> : null}
      {status === "error" ? <p className="text-xs text-red-700 mb-2">{errorMessage ?? "Couldn't apply this."}</p> : null}

      {status === "ready" || status === "applying" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={status === "applying"}
            className="px-3 py-1 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {status === "applying" ? "Applying…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={status === "applying"}
            className="px-3 py-1 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Reject
          </button>
        </div>
      ) : null}
    </div>
  );
}

function proposalKindLabel(kind: AiProposal["kind"]): string {
  switch (kind) {
    case "trip-update":
      return "Proposed trip update";
    case "trip-override-upsert":
      return "Proposed trip preference change";
    case "itinerary-item-upsert":
      return "Proposed itinerary item";
    default:
      return "Proposed change";
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(not set)";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "(none)";
  return String(value);
}
