import type { ReactNode } from "react";
import { Card } from "./Card";

/**
 * Phase 7 (UI): a single KPI/metric tile — budget planned-vs-actual,
 * itinerary completion %, booking count, etc. `hint` is for a one-line
 * qualifier ("3 of 12 confirmed") shown under the value.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        {icon && <span className="text-accent/80">{icon}</span>}
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}
