import type { ReactNode } from "react";
import { Card, CardBody } from "./Card";

/**
 * Phase 7 (UI): consistent "nothing here yet" placeholder — replaces
 * the bare <p> text used for empty lists before this phase.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </CardBody>
    </Card>
  );
}
