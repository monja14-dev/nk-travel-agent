/**
 * Only plain web links become clickable. Source URLs are stored as free
 * text (typed in manually or supplied by a research adapter), so a stored
 * "javascript:" or "data:" string must never be rendered as an href.
 * Returns the trimmed URL, or null if it is not http(s).
 */
export function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
