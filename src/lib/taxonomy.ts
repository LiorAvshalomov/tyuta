/**
 * Single source of truth for channel taxonomy.
 * Covers: channel slug → Hebrew name, tag-type lists, subcategory order, helpers.
 *
 * Used by:
 *   - src/app/write/page.tsx  (tag picker + subcategory dropdown)
 *   - src/app/c/magazine/page.tsx  (subcategory list is inlined there; this drives the SQL seed)
 *   - db/migrations/01_add_taxonomy_2026_02_23.sql  (authoritative tag lists)
 */

// ─── Channel slug → Hebrew name mapping ─────────────────────────────────────

export const CHANNEL_SLUG_TO_NAME_HE: Record<string, string> = {
  prika: 'פריקה',
  release: 'פריקה', // canonical DB slug
  stories: 'סיפורים',
  magazine: 'מגזין',
}

// ─── Non-genre tag types shown in the tag picker per channel ─────────────────

export const TAG_TYPES_BY_CHANNEL: Record<string, Array<'emotion' | 'theme' | 'topic'>> = {
  'פריקה': ['emotion', 'theme'],
  'סיפורים': ['emotion', 'theme'],
  'מגזין': ['topic', 'theme'],
}

// ─── Subcategory (genre) display order per channel ───────────────────────────
// Order here drives both the write-page dropdown and the channel-page sections.

export const SUBCATEGORY_NAMES_BY_CHANNEL: Record<string, string[]> = {
  'פריקה': ['וידויים', 'מחשבות', 'שירים'],
  'סיפורים': ['סיפורים אמיתיים', 'סיפורים קצרים', 'סיפור בהמשכים'],
  'מגזין': ['חדשות', 'ספורט', 'תרבות ובידור', 'דעות', 'טכנולוגיה', 'עולם הכתיבה'],
}

// ─── Canonical tag lists (sorted alef-bet; used by SQL seed for reference) ───

export const TAGS_BY_CHANNEL: Record<string, readonly string[]> = {
  'פריקה': [
    'אשמה',
    'ביקורת עצמית',
    'בושה',
    'בלבול',
    'הקלה',
    'הרהורים',
    'התחלה חדשה',
    'התמודדות',
    'חרדה',
    'חרטה',
    'טראומה',
    'ייאוש',
    'מועקה',
    'מונולוג',
    'משבר',
    'סודות',
    'פואטיקה',
    'פרידה',
    'קנאה',
    'שלווה',
    'תובנה',
  ],
  'סיפורים': [
    'אימה',
    'אכזבה',
    'בדידות',
    'דרמה',
    'היסטוריה',
    'התבגרות',
    'הרפתקאות',
    'קומדיה',
    'מדע בדיוני',
    'מסע אישי',
    'מסתורין',
    'משפחה',
    'מתח',
    'מתח פסיכולוגי',
    'נקמה',
    'פנטזיה',
    'פעולה',
    'רומנטיקה',
    'סאטירה',
    'סודות',
    'תקווה',
  ],
  'מגזין': [
    'אומנות',
    'איכות הסביבה',
    'אפליקציות',
    'אקטואליה',
    'בריאות',
    'גאדג\'טים',
    'גיימינג',
    'השראה',
    'טיפים לכותבים',
    'טלוויזיה',
    'טניס',
    'כושר',
    'מדריכי כתיבה',
    'מחסום כתיבה',
    'פיתוח דמויות',
    'רשתות חברתיות',
    'ספורט אקסטרים',
    'ספרות',
    'תהליך יצירה',
    'תזונה אקטיבית',
    'תיאטרון',
  ],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a stable NFC-normalised sort key for Hebrew strings. */
export function normalizeHebrewSort(name: string): string {
  return name.normalize('NFC').trim()
}

/**
 * Stable Hebrew alef-bet sort.
 * Returns a new sorted array; does not mutate the input.
 */
export function sortHebrew<T extends { name_he: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) =>
    a.name_he.localeCompare(b.name_he, 'he-IL', { sensitivity: 'base' })
  )
}

/**
 * Removes items whose normalised Hebrew name has already been seen.
 * Preserves first occurrence.
 */
export function dedupeByNormalizedName<T extends { name_he: string }>(list: T[]): T[] {
  const seen = new Set<string>()
  return list.filter(item => {
    const key = normalizeHebrewSort(item.name_he)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
