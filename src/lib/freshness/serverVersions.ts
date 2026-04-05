import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type FeedPath = '/' | '/c/release' | '/c/stories' | '/c/magazine'

function createFreshnessServerClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !key) return null

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  })
}

export function pickLatestVersion(...versions: Array<string | null | undefined>) {
  let latest: string | null = null

  for (const version of versions) {
    if (!version) continue
    if (!latest || version > latest) latest = version
  }

  return latest
}

function channelSlugForPath(path: FeedPath) {
  if (path === '/c/release') return 'release'
  if (path === '/c/stories') return 'stories'
  if (path === '/c/magazine') return 'magazine'
  return null
}

export async function getFeedVersionForPath(path: FeedPath) {
  const supabase = createFreshnessServerClient()
  if (!supabase) return null

  const channelSlug = channelSlugForPath(path)
  let channelId: number | null = null

  if (channelSlug) {
    const { data: channel } = await supabase
      .from('channels')
      .select('id')
      .eq('slug', channelSlug)
      .maybeSingle<{ id: number }>()

    channelId = channel?.id ?? null
  }

  let query = supabase
    .from('posts')
    .select('updated_at, published_at, created_at')
    .is('deleted_at', null)
    .eq('status', 'published')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (channelId != null) {
    query = query.eq('channel_id', channelId)
  }

  const [{ data: post }, { data: profile }] = await Promise.all([
    query.maybeSingle<{
      updated_at: string | null
      published_at: string | null
      created_at: string
    }>(),
    supabase
      .from('profiles')
      .select('updated_at')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ updated_at: string | null }>(),
  ])

  return pickLatestVersion(
    post?.updated_at ?? null,
    post?.published_at ?? null,
    post?.created_at ?? null,
    profile?.updated_at ?? null,
  )
}
