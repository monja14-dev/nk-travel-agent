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
import type { AiProposal, AiChatResponseBody, AiChatErrorBody, ChatTurn, SearchSourceInfo } from "./types";
import { safeHttpUrl } from "../../lib/url";
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
  /** Pages the web search returned for this reply (search turns only). */
  sources?: SearchSourceInfo[];
  searchCount?: number;
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
  // On by default: finding hotels and food is what the Concierge is for.
  // The cap per message is fixed on the server; this only switches it on/off.
  const [searchWeb, setSearchWeb] = useState(true);

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
          webSearch: searchWeb,
        }),
      });

      if (requestId !== requestIdRef.current) return; // a newer send (or a cancel) has since superseded this one

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({ error: "The AI didn't respond successfully." }))) as AiChatErrorBody;
        setSendError(errorBody.error);
        return;
      }

      const parsed = (await response.json()) as AiChatResponseBody | AiChatErrorBody;
      if (requestId !== requestIdRef.current) return;

      // The web-search path streams, so its HTTP status is always 200 and a
      // failure arrives inside the body instead (see api/_lib/streaming.ts).
      if ("error" in parsed) {
        setSendError(parsed.error);
        return;
      }
      const body = parsed;

      const entries: ProposalEntry[] = body.proposals.map((proposal) => ({
        localId: `proposal_${nextLocalId++}`,
        proposal,
        status: "checking",
      }));
      const previewed = await refreshProposalPreviews(entries);
      if (requestId !== requestIdRef.current) return;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: body.reply, proposals: previewed, sources: body.sources, searchCount: body.searchCount },
      ]);
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
    return <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8 text-ink-muted text-sm">Loading…</div>;
  }
  if (loadState === "not-found") {
    return (
      <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-ink mb-3">That trip no longer exists.</p>
        <button
          type="button"
          onClick={() => onNavigate({ name: "dashboard" })}
          className="text-sm font-medium text-accent underline"
        >
          Back to dashboard
        </button>
      </div>
    );
  }
  if (loadState === "error" || !trip) {
    return (
      <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-danger-text text-sm">Couldn't load this trip: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <button
        type="button"
        onClick={() => onNavigate({ name: "trip-details", tripId })}
        className="text-sm text-ink-muted underline mb-4"
      >
        ← Back to {trip.name}
      </button>

      <h1 className="text-xl font-semibold text-ink mb-1">NK Concierge</h1>
      <p className="text-sm text-ink-muted mb-6">
        About <span className="font-medium">{trip.name}</span>. The AI can search the web for hotels, food and more,
        and suggest changes to this trip or its preferences — it never saves anything on its own. Every
        suggestion shows up below for you to review and approve or reject.
      </p>

      <div className="space-y-4 mb-6">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-faint italic">No messages yet — ask about this trip below.</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[85%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap text-left ${
                m.role === "user" ? "bg-accent text-navy-bg" : "bg-navy-elevated text-ink"
              }`}
            >
              {m.content}
            </div>
            {m.role === "assistant" && m.sources && m.sources.length > 0 ? (
              <SourcesList sources={m.sources} searchCount={m.searchCount} />
            ) : null}
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
        <div className="mb-4 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      ) : null}

      {sendError ? <p className="text-danger-text text-sm mb-4">{sendError}</p> : null}

      {sending && searchWeb ? (
        <p className="text-xs text-ink-muted mb-2" role="status">
          Searching the web… this can take up to a minute or two.
        </p>
      ) : null}

      <label className="mb-2 flex items-start gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={searchWeb}
          onChange={(e) => setSearchWeb(e.target.checked)}
          disabled={sending}
        />
        <span>
          <span className="font-medium text-ink">Search the web</span> — lets the AI look up hotels, food and prices
          (up to 5 searches per message, each one billed to your Anthropic account). Prices from search are
          estimates, not live availability. Turn off for a cheaper, faster chat.
        </span>
      </label>

      <form onSubmit={handleSend} className="flex items-end gap-2">
        <textarea
          className="flex-1 rounded-lg border bg-navy-bg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 border-navy-border px-3 py-2 text-sm"
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
            className="px-4 py-2 rounded-md border border-navy-border text-sm font-medium text-ink hover:bg-navy-elevated"
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim()}
            className="px-4 py-2 rounded-md bg-accent text-navy-bg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}

function SourcesList({ sources, searchCount }: { sources: SearchSourceInfo[]; searchCount?: number }) {
  // Re-checked here even though the server only sends http(s) pages: a
  // link is only ever rendered for a URL that passes safeHttpUrl.
  const links = sources
    .map((s) => ({ title: s.title, href: safeHttpUrl(s.url) }))
    .filter((s): s is { title: string; href: string } => s.href !== null);
  if (links.length === 0) return null;

  return (
    <details className="mt-2 rounded-lg border border-navy-border bg-navy-surface px-3 py-2 text-xs text-ink-muted">
      <summary className="cursor-pointer text-ink">
        Sources ({links.length} pages{searchCount !== undefined ? `, ${searchCount} search${searchCount === 1 ? "" : "es"}` : ""})
      </summary>
      <ul className="mt-2 space-y-1">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-accent underline break-words">
              {l.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
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
    <div className="rounded-lg border border-navy-border bg-navy-surface px-4 py-3 text-sm">
      <p className="font-medium text-ink mb-1">{proposalKindLabel(proposal.kind)}</p>
      <p className="text-ink-muted mb-2">{proposal.rationale}</p>

      {preview && preview.changes.length > 0 ? (
        <ul className="mb-2 space-y-0.5 text-xs text-ink">
          {preview.changes.map((c) => (
            <li key={c.field}>
              <span className="font-medium">{c.field}:</span> {formatValue(c.from)} → {formatValue(c.to)}
            </li>
          ))}
        </ul>
      ) : null}

      {status === "checking" ? <p className="text-xs text-ink-faint">Checking against the latest data…</p> : null}
      {status === "stale" ? (
        <p className="text-xs text-warning-text mb-2">
          This has changed since the AI looked at it — ask again to get an up-to-date suggestion.
        </p>
      ) : null}
      {status === "not-found" ? (
        <p className="text-xs text-warning-text mb-2">This trip no longer exists.</p>
      ) : null}
      {status === "applied" ? <p className="text-xs text-success-text">Applied.</p> : null}
      {status === "rejected" ? <p className="text-xs text-ink-faint">Rejected.</p> : null}
      {status === "error" ? <p className="text-xs text-danger-text mb-2">{errorMessage ?? "Couldn't apply this."}</p> : null}

      {status === "ready" || status === "applying" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={status === "applying"}
            className="px-3 py-1 rounded-md bg-accent text-navy-bg text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {status === "applying" ? "Applying…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={status === "applying"}
            className="px-3 py-1 rounded-md border border-navy-border text-xs font-medium text-ink hover:bg-navy-elevated"
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
