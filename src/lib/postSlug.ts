import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Convert a post title to a URL-safe slug.
 * - Hebrew characters are preserved as-is (browsers display them natively)
 * - Any non-Hebrew/non-Latin/non-digit character (punctuation, spaces, etc.) → hyphen
 * - Multiple hyphens collapsed to one; leading/trailing hyphens removed
 * - Max 80 characters
 */
export function generatePostSlug(title: string): string {
  const slug = title
    .trim()
    .normalize('NFC')
    .replace(/[^\u05D0-\u05EA\u05F0-\u05F4a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug || 'פוסט'
}

/**
 * Find a unique slug by appending -2, -3, ... if the base slug is already taken.
 * Excludes the current post (excludeId) to allow re-publishing the same post.
 */
export async function resolveUniquePostSlug(
  supabase: SupabaseClient,
  baseSlug: string,
  excludeId: string,
): Promise<string> {
  let slug = baseSlug
  for (let attempt = 2; attempt <= 20; attempt++) {
    const { data } = await supabase
      .from('posts')
      .select('id')
      .eq('slug', slug)
      .neq('id', excludeId)
      .maybeSingle()
    if (!data) return slug
    slug = `${baseSlug}-${attempt}`
  }
  return `${baseSlug}-${Date.now().toString(36)}`
}
