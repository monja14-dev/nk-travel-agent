import {
  useCallback,
  useId,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { isMagnifyingPointer } from "./springMath";

/**
 * Small accessible tooltip used by the dock and the collapsed sidebar.
 *
 * - Opens on mouse/pen hover and on KEYBOARD focus only. A tap on a touch
 *   screen never opens it (it would just stick on screen); the button's
 *   aria-label carries the name for screen readers regardless.
 * - Esc dismisses it without moving focus (WCAG 1.4.13).
 * - The bubble itself is `pointer-events-none` so it never blocks a click.
 */

export function useTooltip() {
  const id = useId();
  const [open, setOpen] = useState(false);

  const handlers = {
    onPointerEnter: useCallback((e: PointerEvent<HTMLElement>) => {
      if (isMagnifyingPointer(e.pointerType)) setOpen(true);
    }, []),
    onPointerLeave: useCallback(() => setOpen(false), []),
    onFocus: useCallback((e: FocusEvent<HTMLElement>) => {
      let keyboardFocus = false;
      try {
        keyboardFocus = e.currentTarget.matches(":focus-visible");
      } catch {
        // old browsers: no keyboard tooltip, aria-label still names the control
      }
      if (keyboardFocus) setOpen(true);
    }, []),
    onBlur: useCallback(() => setOpen(false), []),
    onKeyDown: useCallback((e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape") setOpen(false);
    }, []),
  };

  return { id, open, handlers };
}

export function TipBubble({
  id,
  open,
  className,
  style,
  children,
}: {
  id: string;
  open: boolean;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      id={id}
      role="tooltip"
      style={style}
      className={[
        // `invisible` (not just opacity 0) when closed, so a closed tooltip is
        // also gone from the accessibility tree.
        "pointer-events-none z-50 whitespace-nowrap rounded-md border border-navy-border bg-navy-elevated px-2 py-1 text-xs font-medium text-ink shadow-float transition-[opacity,visibility] duration-100",
        open ? "visible opacity-100" : "invisible opacity-0",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
