// Pure theme helpers — no React, no side effects at import time.
// Works in server context (guards on typeof window/localStorage).
// Storage key: 'tyuta:theme'   Values: 'light' | 'dark' | 'system'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'tyuta:theme'

/** Read persisted preference. Returns 'system' when absent or on error. */
export function getStoredTheme(): ThemePreference {
  try {
    if (typeof localStorage === 'undefined') return 'system'
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // SSR or private-browsing restriction — silently fall through
  }
  return 'system'
}

/** Persist preference to localStorage. No-op on error. */
export function setStoredTheme(pref: ThemePreference): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, pref)
    }
  } catch {
    // ignore
  }
}

/**
 * Resolve a preference to a boolean.
 * Returns true  → dark theme should be active.
 * Returns false → light theme should be active.
 */
export function resolveTheme(pref: ThemePreference): boolean {
  if (pref === 'dark') return true
  if (pref === 'light') return false
  // 'system' — delegate to OS preference
  try {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    )
  } catch {
    return false
  }
}

/**
 * Apply resolved dark/light state to <html>.
 * Must be called on the client only.
 */
export function applyTheme(dark: boolean): void {
  try {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
  } catch {
    // ignore
  }
}
