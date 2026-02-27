/**
 * Shared cache for user profile preview cards.
 * Used by AuthorHover (prefetch before open) and HoverProfileCard (render).
 *
 * Cache key = `${viewerId ?? 'anon'}:${username}` so different viewers get
 * independent entries (is_following depends on who is viewing).
 *
 * TTL: 60 seconds — stale entries are re-fetched transparently.
 */
import { supabase } from '@/lib/supabaseClient'

export type UserPreview = {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
  followers_count: number
  is_following: boolean
  /** The viewer's own user ID at fetch time (null = anonymous) */
  viewer_id: string | null
  /** True when viewer is authenticated and is not the profile owner */
  can_message: boolean
}

const TTL_MS = 60_000

const cache = new Map<string, UserPreview>()
const cacheTimestamps = new Map<string, number>()
const inflight = new Map<string, Promise<UserPreview | null>>()

export async function fetchUserPreview(username: string): Promise<UserPreview | null> {
  // Auth is a fast local session check — no network round-trip
  const { data: { user } } = await supabase.auth.getUser()
  const viewerId = user?.id ?? null
  const cacheKey = `${viewerId ?? 'anon'}:${username}`

  // Return cache hit if still fresh
  const age = Date.now() - (cacheTimestamps.get(cacheKey) ?? 0)
  if (cache.has(cacheKey) && age < TTL_MS) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[preview]', username, 'cache')
    }
    return cache.get(cacheKey)!
  }

  // Coalesce concurrent requests for the same key
  if (inflight.has(cacheKey)) return inflight.get(cacheKey)!

  if (process.env.NODE_ENV === 'development') {
    console.debug('[preview]', username, 'network')
  }

  const p = (async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url, bio')
      .eq('username', username)
      .single()

    if (!profile) return null
    const pid = (profile as { id: string }).id

    // Run followers_count + is_following in parallel
    const [{ count }, followResult] = await Promise.all([
      supabase
        .from('user_follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('following_id', pid),
      viewerId && viewerId !== pid
        ? supabase
            .from('user_follows')
            .select('follower_id')
            .eq('follower_id', viewerId)
            .eq('following_id', pid)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const preview: UserPreview = {
      id: pid,
      display_name: (profile as { display_name: string | null }).display_name,
      username: (profile as { username: string | null }).username,
      avatar_url: (profile as { avatar_url: string | null }).avatar_url,
      bio: (profile as { bio: string | null }).bio,
      followers_count: count ?? 0,
      is_following: !!followResult.data,
      viewer_id: viewerId,
      can_message: !!viewerId && viewerId !== pid,
    }
    cache.set(cacheKey, preview)
    cacheTimestamps.set(cacheKey, Date.now())
    return preview
  })()

  inflight.set(cacheKey, p)
  p.finally(() => inflight.delete(cacheKey))
  return p
}

/**
 * Patch the cached entry after follow/unfollow.
 * viewerId must be passed by the caller (already known from component state).
 */
export function patchPreviewCache(
  viewerId: string | null,
  username: string,
  followersDelta: number,
  nowFollowing: boolean,
) {
  const cacheKey = `${viewerId ?? 'anon'}:${username}`
  if (cache.has(cacheKey)) {
    const c = cache.get(cacheKey)!
    cache.set(cacheKey, {
      ...c,
      followers_count: Math.max(0, c.followers_count + followersDelta),
      is_following: nowFollowing,
    })
    // Reset TTL so next open sees updated data immediately
    cacheTimestamps.set(cacheKey, Date.now())
  }
}
