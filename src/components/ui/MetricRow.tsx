import { ProgressBar } from "./ProgressBar";

/**
 * Phase 7 (UI): a labelled progress row ("Bookings — 2 of 5 confirmed").
 * The caller passes a fraction computed from real counts.
 */
export function MetricRow({
  label,
  caption,
  fraction,
  tone = "accent",
}: {
  label: string;
  caption: string;
  fraction: number;
  tone?: "accent" | "success" | "warning";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
        <span className="truncate text-xs text-ink-muted">{caption}</span>
      </div>
      <ProgressBar value={fraction} label={`${label}: ${caption}`} tone={tone} />
    </div>
  );
}
