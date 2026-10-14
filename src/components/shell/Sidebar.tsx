import { useEffect, useRef } from "react";
import type { View } from "../../navigation/types";
import { GLOBAL_NAV, SETTINGS_NAV, tripScopedNav, type NavItem } from "./navItems";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CompassIcon } from "./icons";
import { TipBubble, useTooltip } from "../dock/Tooltip";
import { useMagnify } from "../dock/useMagnify";

/** Sidebar icons swell less than the dock's: a row is ~36px tall and sits
 * next to its label, so a restrained 1.28× with a ~90px falloff. */
const SIDEBAR_MAX_SCALE = 1.28;
const SIDEBAR_RANGE_PX = 90;

/**
 * Phase 7 (UI): collapsible left sidebar (desktop) that becomes a
 * slide-in drawer (mobile), per spec §3. Trip-scoped links only appear
 * once a trip is active (derived in AppShell from the current view),
 * so there's nothing to click into before a trip exists.
 */

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeTripName: string | null;
  activeTripId: string | null;
}

export function Sidebar(props: SidebarProps) {
  const { mobileOpen, onCloseMobile } = props;

  // Escape closes the mobile drawer (keyboard users and external keyboards).
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={[
          "hidden md:flex md:flex-col shrink-0 border-r border-navy-border bg-navy-surface transition-[width] duration-200",
          props.collapsed ? "md:w-[72px]" : "md:w-64",
        ].join(" ")}
      >
        <SidebarInner {...props} onNavigate={(v) => props.onNavigate(v)} />
      </aside>

      {/* Mobile drawer */}
      {props.mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={props.onCloseMobile}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-navy-surface border-r border-navy-border flex flex-col"
          >
            <div className="flex items-center justify-between p-3 border-b border-navy-border">
              <Brand collapsed={false} />
              <button
                type="button"
                onClick={props.onCloseMobile}
                className="p-1.5 rounded-md text-ink-muted hover:bg-navy-elevated hover:text-ink"
                aria-label="Close menu"
                autoFocus
              >
                <CloseIcon />
              </button>
            </div>
            <SidebarInner {...props} collapsed={false} showBrand={false} onNavigate={(v) => {
              props.onNavigate(v);
              props.onCloseMobile();
            }} />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarInner({
  view,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  activeTripName,
  activeTripId,
  showBrand = true,
}: SidebarProps & { showBrand?: boolean }) {
  const tripItems = activeTripId ? tripScopedNav(activeTripId) : [];
  const { containerProps } = useMagnify({ axis: "y", maxScale: SIDEBAR_MAX_SCALE, range: SIDEBAR_RANGE_PX });

  return (
    <div className="flex h-full flex-col">
      {showBrand && (
        <div className="flex items-center justify-between p-3 border-b border-navy-border">
          <Brand collapsed={collapsed} />
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden md:inline-flex p-1.5 rounded-md text-ink-muted hover:bg-navy-elevated hover:text-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRightIcon width={16} height={16} /> : <ChevronLeftIcon width={16} height={16} />}
          </button>
        </div>
      )}

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3 space-y-5" {...containerProps}>
        <NavGroup items={GLOBAL_NAV} view={view} onNavigate={onNavigate} collapsed={collapsed} />

        <div>
          {!collapsed && (
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {activeTripName ?? "No active trip"}
            </p>
          )}
          {tripItems.length > 0 ? (
            <NavGroup items={tripItems} view={view} onNavigate={onNavigate} collapsed={collapsed} />
          ) : (
            !collapsed && (
              <p className="px-2 text-xs text-ink-faint">Open a trip from the Dashboard to see its tools here.</p>
            )
          )}
        </div>

        <NavGroup
          items={SETTINGS_NAV}
          view={view}
          onNavigate={onNavigate}
          collapsed={collapsed}
          label={collapsed ? undefined : "Settings"}
        />
      </nav>
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 min-w-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <CompassIcon width={18} height={18} />
      </span>
      {!collapsed && (
        <span className="truncate text-sm font-semibold text-ink">NK Travel Agent</span>
      )}
    </div>
  );
}

function NavGroup({
  items,
  view,
  onNavigate,
  collapsed,
  label,
}: {
  items: NavItem[];
  view: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  label?: string;
}) {
  return (
    <div>
      {label && (
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <NavButton
            key={item.label}
            item={item}
            active={isActive(view, item.view)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: (view: View) => void;
}) {
  const Icon = item.icon;
  const ref = useRef<HTMLButtonElement>(null);
  const { id, open, handlers } = useTooltip();
  // The label only needs a tooltip when the rail is collapsed. It is placed
  // with position: fixed from the button's rect because the nav scrolls
  // (overflow) and would otherwise clip a tooltip drawn beside the rail.
  const rect = collapsed && open ? ref.current?.getBoundingClientRect() : undefined;

  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={() => onNavigate(item.view)}
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        aria-describedby={collapsed && open ? id : undefined}
        className={[
          "relative w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors text-left",
          collapsed && "justify-center",
          active
            ? // Active route: gold tint, gold text, plus a slim gold bar on the left edge.
              "bg-accent/15 text-accent before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
            : "text-ink-muted hover:bg-navy-elevated hover:text-ink",
        ]
          .filter(Boolean)
          .join(" ")}
        {...(collapsed ? handlers : {})}
      >
        <span data-magnify className="inline-flex shrink-0 will-change-transform">
          <Icon width={18} height={18} />
        </span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
      {rect && (
        <TipBubble
          id={id}
          open
          className=""
          style={{ position: "fixed", left: rect.right + 10, top: rect.top + rect.height / 2, transform: "translateY(-50%)" }}
        >
          {item.label}
        </TipBubble>
      )}
    </li>
  );
}

function isActive(current: View, target: View): boolean {
  if (current.name !== target.name) return false;
  if ("tripId" in current && "tripId" in target) return current.tripId === target.tripId;
  return true;
}
