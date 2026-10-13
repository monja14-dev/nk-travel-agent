import { forwardRef, type ButtonHTMLAttributes } from "react";

/**
 * Phase 7 (UI): shared button primitive for the Smart Travel Command
 * Center design system. Every clickable action across the redesigned
 * screens should use this instead of ad-hoc `<button className="...">`,
 * so button styling (color, size, hover/focus/disabled states) stays
 * consistent in one place.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-navy-bg hover:bg-accent-hover focus-visible:ring-accent/50 font-semibold",
  secondary:
    "bg-navy-elevated text-ink border border-navy-border hover:bg-navy-elevated/70 focus-visible:ring-ink/20",
  ghost:
    "bg-transparent text-ink-muted hover:text-ink hover:bg-navy-elevated/60 focus-visible:ring-ink/20",
  danger:
    "bg-danger/15 text-danger-text border border-danger/40 hover:bg-danger/25 focus-visible:ring-danger/40",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5 rounded-md gap-1.5",
  md: "text-sm px-3.5 py-2 rounded-lg gap-2",
  lg: "text-sm px-5 py-2.5 rounded-lg gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex items-center justify-center font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-bg",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      {...rest}
    />
  );
});
