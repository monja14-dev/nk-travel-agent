import { useEffect, useMemo, useState, type ComponentType, type KeyboardEvent, type SVGProps } from "react";
import type { View } from "../../navigation/types";
import { BedIcon, CalendarIcon, HomeIcon, SparkleIcon, SuitcaseIcon } from "../shell/icons";
import {
  activeDockItemId,
  buildDockItems,
  dockTooltipText,
  isEditableElement,
  type DockIconKey,
  type DockItem,
} from "./dockModel";
import { TipBubble, useTooltip } from "./Tooltip";
import { useMagnify } from "./useMagnify";

/**
 * Compact floating quick-navigation dock (bottom center of the content
 * area). A shortcut strip for the five places used most; the left sidebar
 * stays the primary navigation and still lists everything.
 *
 * Behaviour
 * - Mouse/pen: icons swell near the pointer with a soft wave on neighbours
 *   (spring animated). Touch: no magnification, plain 44px tap targets.
 * - Keyboard: every item is reachable with Tab; ←/→/Home/End move between
 *   items; keyboard focus shows the tooltip and a gentler swell.
 * - Reduced motion: no magnification (see useMagnify), tooltips still work.
 * - Never in the way: it slides out of view while the mobile menu is open
 *   and, on phones, while a text field has focus (the on-screen keyboard
 *   needs that space). The content area keeps bottom padding equal to the
 *   dock's height, so the last row of any form or table can scroll clear.
 */

const ICONS: Record<DockIconKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  home: HomeIcon,
  suitcase: SuitcaseIcon,
  calendar: CalendarIcon,
  bed: BedIcon,
  sparkle: SparkleIcon,
};

/** Dock icons grow up to 1.5×, fading over ~110px: about two neighbours
 * either side swell noticeably less than the one under the pointer. */
const DOCK_MAX_SCALE = 1.5;
const DOCK_RANGE_PX = 110;

export function QuickDock({
  view,
  onNavigate,
  tripId,
  hidden,
}: {
  view: View;
  onNavigate: (view: View) => void;
  /** The trip the dock acts on: active trip, else the last one opened. */
  tripId: string | null;
  /** True while something else owns the screen (e.g. the mobile menu). */
  hidden: boolean;
}) {
  const items = useMemo(() => buildDockItems(tripId), [tripId]);
  const activeId = activeDockItemId(view);
  const { containerProps } = useMagnify({ axis: "x", maxScale: DOCK_MAX_SCALE, range: DOCK_RANGE_PX });
  const editing = useEditingOnSmallScreen();
  const away = hidden || editing;

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-dock-item]"));
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    e.preventDefault();
    const last = buttons.length - 1;
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? last : e.key === "ArrowRight" ? Math.min(index + 1, last) : Math.max(index - 1, 0);
    buttons[next]?.focus();
  }

  return (
    <div
      className={[
        "pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 print:hidden",
        "transition-[transform,opacity,visibility] duration-200",
        away ? "invisible translate-y-4 opacity-0" : "visible translate-y-0 opacity-100",
      ].join(" ")}
    >
      <nav
        aria-label="Quick navigation"
        className="pointer-events-auto rounded-2xl border border-navy-border bg-navy-surface px-2 pb-3 pt-2 shadow-float"
        onKeyDown={onKeyDown}
        {...containerProps}
      >
        <ul className="flex items-end gap-1.5">
          {items.map((item) => (
            <DockButton key={item.id} item={item} active={item.id === activeId} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function DockButton({
  item,
  active,
  onNavigate,
}: {
  item: DockItem;
  active: boolean;
  onNavigate: (view: View) => void;
}) {
  const Icon = ICONS[item.icon];
  const { id, open, handlers } = useTooltip();
  const disabled = item.view === null;
  const tip = dockTooltipText(item);

  return (
    <li className="relative flex flex-col items-center">
      <button
        type="button"
        data-dock-item
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        aria-disabled={disabled || undefined}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          if (item.view) onNavigate(item.view);
        }}
        className={["group rounded-xl", disabled ? "cursor-not-allowed" : ""].join(" ")}
        {...handlers}
      >
        {/* The visible tile is the part that magnifies. It grows upward
            from its bottom edge so the dock's baseline never moves. */}
        <span
          data-magnify
          className={[
            "flex h-11 w-11 origin-bottom items-center justify-center rounded-xl border transition-colors will-change-transform",
            active
              ? "border-accent/50 bg-accent/15 text-accent"
              : disabled
                ? "border-transparent bg-navy-elevated/60 text-ink-faint opacity-60"
                : "border-transparent bg-navy-elevated text-ink-muted group-hover:text-ink",
          ].join(" ")}
        >
          <Icon width={20} height={20} />
        </span>
      </button>

      {/* Active-route indicator: a small gold dot under the tile (plus the
          gold tile above, so it doesn't rely on one cue alone). */}
      {active && <span aria-hidden="true" className="absolute -bottom-2 h-1 w-1 rounded-full bg-accent" />}

      <TipBubble id={id} open={open} className="absolute bottom-full left-1/2 mb-7 -translate-x-1/2">
        {tip}
      </TipBubble>
    </li>
  );
}

/** On phones and touch screens, true while a text field has focus. */
function useEditingOnSmallScreen(): boolean {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const small = window.matchMedia("(pointer: coarse), (max-width: 767px)");

    const update = () => setEditing(small.matches && isEditableElement(document.activeElement as HTMLElement | null));
    // focusout fires before the next element is focused; check after the
    // browser has settled so moving between fields doesn't flicker the dock.
    const onFocusOut = () => window.setTimeout(update, 0);

    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onFocusOut);
    small.addEventListener("change", update);
    update();
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onFocusOut);
      small.removeEventListener("change", update);
    };
  }, []);

  return editing;
}
