import type { View } from "../../navigation/types";

/**
 * What the bottom quick-navigation dock contains and which item is active,
 * as plain data. Every item points at an EXISTING view
 * (navigation/types.ts) — the dock adds no routes and no screens.
 *
 * "My Trips": the app has no separate trip-list screen (the Dashboard is
 * the list). "My Trips" therefore opens the current trip's overview (the
 * trip workspace), and falls back to the Dashboard when no trip has been
 * opened yet, so it is never a dead button.
 */

export type DockItemId = "dashboard" | "my-trips" | "itinerary" | "stay" | "concierge";
export type DockIconKey = "home" | "suitcase" | "calendar" | "bed" | "sparkle";

export interface DockItem {
  id: DockItemId;
  label: string;
  icon: DockIconKey;
  /** Where a click goes; null only when the item is disabled. */
  view: View | null;
  /** Why the item can't be used right now (shown in its tooltip). */
  disabledReason: string | null;
}

const NEEDS_TRIP = "Open a trip first";

/**
 * `tripId` is the trip the dock acts on: the active trip, or the last one
 * opened this session (so the dock still works after a visit to the
 * Dashboard). With no trip at all, the three trip tools are disabled — not
 * hidden, so the dock never changes shape under the pointer.
 */
export function buildDockItems(tripId: string | null): DockItem[] {
  const reason = tripId ? null : NEEDS_TRIP;
  return [
    { id: "dashboard", label: "Dashboard", icon: "home", view: { name: "dashboard" }, disabledReason: null },
    {
      id: "my-trips",
      label: "My Trips",
      icon: "suitcase",
      view: tripId ? { name: "trip-details", tripId } : { name: "dashboard" },
      disabledReason: null,
    },
    {
      id: "itinerary",
      label: "Itinerary Studio",
      icon: "calendar",
      view: tripId ? { name: "trip-itinerary", tripId } : null,
      disabledReason: reason,
    },
    {
      id: "stay",
      label: "Stay Hunter",
      icon: "bed",
      view: tripId ? { name: "trip-accommodation", tripId } : null,
      disabledReason: reason,
    },
    {
      id: "concierge",
      label: "NK Concierge",
      icon: "sparkle",
      view: tripId ? { name: "trip-ai", tripId } : null,
      disabledReason: reason,
    },
  ];
}

/** Which dock item (if any) the current screen belongs to. Screens with no
 * dock item (Food Hunter, Budget, Profile…) highlight nothing in the dock;
 * the sidebar still shows them as active. */
export function activeDockItemId(view: View): DockItemId | null {
  switch (view.name) {
    case "dashboard":
      return "dashboard";
    case "trip-details":
    case "trip-edit":
    case "trip-override":
      return "my-trips";
    case "trip-itinerary":
      return "itinerary";
    case "trip-accommodation":
      return "stay";
    case "trip-ai":
      return "concierge";
    default:
      return null;
  }
}

/** The tooltip text for an item: its name, plus why it's unavailable. */
export function dockTooltipText(item: DockItem): string {
  return item.disabledReason ? `${item.label} — ${item.disabledReason.toLowerCase()}` : item.label;
}

/** Minimal shape of a focused element, so this can be tested without a DOM. */
export interface FocusedElementLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "range",
  "file",
  "color",
  "image",
]);

/** True when the focused element is something the person types into. On
 * phones the on-screen keyboard then takes the bottom of the screen, so
 * the dock steps out of the way instead of sitting on the field. */
export function isEditableElement(el: FocusedElementLike | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUT_TYPES.has((el.type ?? "text").toLowerCase());
  return false;
}
