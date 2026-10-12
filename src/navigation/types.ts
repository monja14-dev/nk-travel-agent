/**
 * Deliberately NOT react-router — a plain discriminated union plus
 * React state in App.tsx. The whole app is a handful of screens behind a
 * local-only IndexedDB; adding a routing library is scope/risk the master
 * prompt's "smaller, verified implementation" preference doesn't call for
 * yet. Revisit if a later phase needs real URLs (e.g. deep-linking a
 * specific trip) or browser back/forward support.
 */
export type View =
  | { name: "dashboard" }
  | { name: "trip-new" }
  | { name: "trip-details"; tripId: string }
  | { name: "trip-edit"; tripId: string }
  | { name: "trip-override"; tripId: string }
  | { name: "trip-ai"; tripId: string }
  | { name: "trip-accommodation"; tripId: string }
  | { name: "trip-food"; tripId: string }
  | { name: "trip-itinerary"; tripId: string }
  | { name: "trip-budget"; tripId: string }
  | { name: "trip-bookings"; tripId: string }
  | { name: "trip-reminders"; tripId: string }
  | { name: "profile" }
  | { name: "backup" };
