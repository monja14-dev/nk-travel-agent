import type { ReactNode } from "react";

/**
 * Phase 7 (UI): generic status pill. Deliberately tone-based (not
 * status-string-based) so it stays a dumb display primitive — each
 * module maps its own status strings (TripStatus, BookingStatus, etc.)
 * to a tone via the helpers in `statusTones.ts`, rather than this
 * component knowing about every domain's vocabulary.
 */

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-navy-elevated text-ink-muted border-navy-border",
  accent: "bg-accent/15 text-accent border-accent/30",
  success: "bg-success-bg text-success-text border-success/30",
  warning: "bg-warning-bg text-warning-text border-warning/30",
  danger: "bg-danger-bg text-danger-text border-danger/30",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        toneClasses[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
