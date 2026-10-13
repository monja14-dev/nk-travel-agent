import type { HTMLAttributes, ReactNode } from "react";

/**
 * Phase 7 (UI): the base surface for every panel, list row, and section
 * across the redesign — a card on the "surface" token with a hairline
 * border, matching the Smart Travel Command Center spec (§2: "refined
 * cards and subtle borders"). `interactive` adds hover/focus affordance
 * for cards that are themselves a click target (e.g. a trip card).
 */
export function Card({
  interactive = false,
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; children: ReactNode }) {
  return (
    <div
      className={[
        "bg-navy-surface border border-navy-border rounded-card shadow-card",
        interactive &&
          "transition-colors hover:border-accent/40 hover:bg-navy-elevated/60 cursor-pointer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardBody({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["p-4 sm:p-5", className].join(" ")} {...rest}>
      {children}
    </div>
  );
}
