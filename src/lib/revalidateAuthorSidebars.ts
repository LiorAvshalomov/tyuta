import { revalidatePath } from 'next/cache'
import { createPublicServerClient } from '@/lib/supabase/createPublicServerClient'

/**
 * Revalidate the ISR cache for the N most-recent published posts by an author.
 * Called whenever a post is published, edited, deleted, or restored so that
 * the "More from author" sidebar on those pages reflects the change immediately.
 *
 * @param authorId  - UUID of the author whose sidebar posts should be revalidated
 * @param excludeSlug - slug of the post that triggered the action (already being revalidated separately)
 */
export async function revalidateAuthorSidebars(authorId: string, excludeSlug?: string): Promise<void> {
  const supabase = createPublicServerClient()
  if (!supabase) return

  let query = supabase
    .from('posts')
    .select('slug')
    .eq('author_id', authorId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(5)

  if (excludeSlug) {
    query = query.neq('slug', excludeSlug)
  }

  const { data } = await query
  for (const post of (data ?? []) as Array<{ slug: string | null }>) {
    if (post.slug) revalidatePath(`/post/${post.slug}`)
  }
}
