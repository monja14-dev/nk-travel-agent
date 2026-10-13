/**
 * Phase 7 (UI): thin labelled progress bar. `value` is a 0..1 fraction
 * (clamped; NaN/Infinity render as empty rather than breaking layout).
 * The caller computes the fraction from real counts — this component
 * never invents progress.
 */
type Tone = "accent" | "success" | "warning";

const fillClasses: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
};

export function ProgressBar({
  value,
  label,
  tone = "accent",
}: {
  value: number;
  /** Accessible name, e.g. "Itinerary days planned". */
  label: string;
  tone?: Tone;
}) {
  const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-navy-elevated"
    >
      <div
        className={["h-full rounded-full transition-[width] duration-300", fillClasses[tone]].join(" ")}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
