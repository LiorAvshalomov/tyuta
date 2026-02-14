/** Shared validation constants for username / display name across the app */
export const USERNAME_MAX = 20
export const DISPLAY_NAME_MAX = 23

/** Truncate text to `max` chars, appending "…" if longer */
export function truncateText(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max))}…`
}
