/**
 * Stable record IDs. Prefixed so a raw ID string is self-describing in
 * logs/debugging (e.g. "trip_..." vs "override_..."), and so two entity
 * types can never collide even if the random part did.
 *
 * Requires a secure context (https, or http://localhost) for
 * crypto.randomUUID() — true for Vite's dev server and for the eventual
 * Vercel deployment, and for Node 19+ in tests.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
