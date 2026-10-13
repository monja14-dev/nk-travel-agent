import type { ComponentType, SVGProps } from "react";
import type { View } from "../../navigation/types";
import {
  HomeIcon,
  ClipboardIcon,
  CalendarIcon,
  BedIcon,
  UtensilsIcon,
  WalletIcon,
  TicketIcon,
  BellIcon,
  UserIcon,
  ShieldIcon,
} from "./icons";

/**
 * Phase 7 (UI): the sidebar's nav structure. Deliberately maps onto
 * EXISTING views only (navigation/types.ts) — no new screens invented
 * here. Two items the spec names, "Transportation" and "Travel Logs and
 * Exports", have no dedicated screen in this app yet (transportation
 * details live as fields on itinerary items; export is an action button
 * on the trip workspace) — rather than add dead links to pages that
 * don't exist, they're left out of the sidebar and will get a proper
 * home when the Itinerary Studio and trip workspace are redesigned
 * (tasks already tracked for those stages).
 */

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  label: string;
  view: View;
  icon: Icon;
  /** True if this item only makes sense with an active trip (needs tripId). */
  tripScoped: boolean;
}

export const GLOBAL_NAV: NavItem[] = [
  { label: "Dashboard", view: { name: "dashboard" }, icon: HomeIcon, tripScoped: false },
];

export function tripScopedNav(tripId: string): NavItem[] {
  return [
    { label: "Trip Overview", view: { name: "trip-details", tripId }, icon: ClipboardIcon, tripScoped: true },
    { label: "Itinerary Studio", view: { name: "trip-itinerary", tripId }, icon: CalendarIcon, tripScoped: true },
    { label: "Stay Hunter", view: { name: "trip-accommodation", tripId }, icon: BedIcon, tripScoped: true },
    { label: "Food Hunter", view: { name: "trip-food", tripId }, icon: UtensilsIcon, tripScoped: true },
    { label: "Budget & Expenses", view: { name: "trip-budget", tripId }, icon: WalletIcon, tripScoped: true },
    { label: "Bookings", view: { name: "trip-bookings", tripId }, icon: TicketIcon, tripScoped: true },
    { label: "Reminders", view: { name: "trip-reminders", tripId }, icon: BellIcon, tripScoped: true },
  ];
}

export const SETTINGS_NAV: NavItem[] = [
  { label: "Traveler Profiles", view: { name: "profile" }, icon: UserIcon, tripScoped: false },
  { label: "Backup & Restore", view: { name: "backup" }, icon: ShieldIcon, tripScoped: false },
];

/** Pulls the active tripId out of a view, when that view is trip-scoped. */
export function tripIdFromView(view: View): string | null {
  return "tripId" in view ? view.tripId : null;
}
