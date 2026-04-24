import { createPublicServerClient } from '@/lib/supabase/createPublicServerClient'

type ChannelRow = { id: number; slug: string; name_he: string }
type TagRow = { id: number; slug: string; name_he: string; channel_id: number | null; type: string; is_active: boolean }
type ProfileRow = { id: string; username: string; display_name: string | null; avatar_url: string | null }

type PostsWithCountsRow = {
  id: string
  author_id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  status: string
  published_at: string | null
  created_at: string
  updated_at: string
  channel_id: number
  subcategory_tag_id: number | null
  comments_count: number | null
  reactions_count: number | null
}

export type Option = { value: string; label: string }
export type SortKey = 'recent' | 'comments' | 'reactions'

export type SearchQueryState = {
  q: string
  channel: string
  subcat: string
  sort: SortKey
  page: number
}

export type PostCardVM = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  created_at: string
  channel: { slug: string; name_he: string } | null
  author: { username: string; display_name: string | null; avatar_url: string | null } | null
  subcategory: { id: number; slug: string; name_he: string } | null
  comments_count: number
  reactions_count: number
  medals: { gold: number; silver: number; bronze: number } | null
}

export type SearchPageData = {
  query: SearchQueryState
  channels: Option[]
  subcats: Option[]
  subcatLabel: string
  subcatsByChannel: Record<string, Option[]>
  subcatLabelsByChannel: Record<string, string>
  results: PostCardVM[]
  total: number
  error: string | null
}

export const PAGE_SIZE = 10
const MAX_SEARCH_QUERY_LENGTH = 120

function safeText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_SEARCH_QUERY_LENGTH)
}

function escapeIlike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSubcatLabel(channelId: number | null): string {
  if (channelId === 1) return 'תת-קטגוריה (פריקה)'
  if (channelId === 2) return 'תת-קטגוריה (סיפורים)'
  if (channelId === 3) return 'תת-קטגוריה (מגזין)'
  return 'תת-קטגוריה'
}

function normalizeSort(raw: string): SortKey {
  if (raw === 'comments' || raw === 'reactions') return raw
  return 'recent'
}

export function normalizeSearchQuery(
  searchParams?: Record<string, string | string[] | undefined>,
): SearchQueryState {
  const get = (key: string) => {
    const value = searchParams?.[key]
    return Array.isArray(value) ? value[0] ?? '' : value ?? ''
  }

  return {
    q: normalizeSearchText(safeText(get('q'))),
    channel: safeText(get('channel')).trim(),
    subcat: safeText(get('subcat')).trim(),
    sort: normalizeSort(safeText(get('sort')).trim()),
    page: Math.max(1, Number(get('page') || 1) || 1),
  }
}

export async function loadSearchPageData(
  rawSearchParams?: Record<string, string | string[] | undefined>,
): Promise<SearchPageData> {
  const query = normalizeSearchQuery(rawSearchParams)
  const supabase = createPublicServerClient()

  if (!supabase) {
    return {
      query,
      channels: [{ value: '', label: 'הכל' }],
      subcats: [{ value: '', label: 'בחר קטגוריה קודם' }],
      subcatLabel: 'תת-קטגוריה',
      subcatsByChannel: {},
      subcatLabelsByChannel: {},
      results: [],
      total: 0,
      error: 'שגיאת מערכת',
    }
  }

  try {
    const { data: channelsData, error: channelsError } = await supabase
      .from('channels')
      .select('id, slug, name_he')
      .order('sort_order', { ascending: true })

    if (channelsError) throw channelsError

    const channelRows = (channelsData ?? []) as ChannelRow[]
    const channels: Option[] = [{ value: '', label: 'הכל' }, ...channelRows.map((channel) => ({
      value: channel.slug,
      label: channel.name_he,
    }))]

    const allChannelIds = channelRows.map((channel) => channel.id)
    const selectedChannel = query.channel
      ? channelRows.find((channel) => channel.slug === query.channel) ?? null
      : null

    const subcatLabelsByChannel: Record<string, string> = {}
    const subcatsByChannel: Record<string, Option[]> = {}

    for (const channel of channelRows) {
      subcatLabelsByChannel[channel.slug] = getSubcatLabel(channel.id)
      subcatsByChannel[channel.slug] = [{ value: '', label: 'כל תתי-הקטגוריות' }]
    }

    if (allChannelIds.length) {
      const { data: tags } = await supabase
        .from('tags')
        .select('id, slug, name_he, channel_id, type, is_active')
        .in('channel_id', allChannelIds)
        .eq('type', 'genre')
        .eq('is_active', true)
        .limit(500)

      const groupedTags = new Map<number, TagRow[]>()

      for (const tag of (tags ?? []) as TagRow[]) {
        if (typeof tag.channel_id !== 'number') continue
        const current = groupedTags.get(tag.channel_id) ?? []
        current.push(tag)
        groupedTags.set(tag.channel_id, current)
      }

      for (const channel of channelRows) {
        const options = (groupedTags.get(channel.id) ?? [])
          .slice()
          .sort((left, right) => (left.name_he || '').localeCompare(right.name_he || ''))
          .map((tag) => ({ value: String(tag.id), label: tag.name_he }))

        subcatsByChannel[channel.slug] = [{ value: '', label: 'כל תתי-הקטגוריות' }, ...options]
      }
    }

    const subcatLabel = selectedChannel ? subcatLabelsByChannel[selectedChannel.slug] : 'תת-קטגוריה'
    const subcats = selectedChannel
      ? subcatsByChannel[selectedChannel.slug] ?? [{ value: '', label: 'כל תתי-הקטגוריות' }]
      : [{ value: '', label: 'בחר קטגוריה קודם' }]

    const from = (query.page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let postsQuery = supabase
      .from('posts_with_counts')
      .select(
        'id,author_id,title,slug,excerpt,cover_image_url,status,published_at,created_at,updated_at,channel_id,subcategory_tag_id,comments_count,reactions_count',
        { count: 'exact' },
      )
      .eq('status', 'published')

    if (selectedChannel) postsQuery = postsQuery.eq('channel_id', selectedChannel.id)

    const subcatNum = query.subcat ? Number(query.subcat) : null
    if (subcatNum != null && Number.isFinite(subcatNum)) {
      postsQuery = postsQuery.eq('subcategory_tag_id', subcatNum)
    }

    if (query.q) {
      const escaped = escapeIlike(query.q)
      postsQuery = postsQuery.or(`title.ilike.%${escaped}%,excerpt.ilike.%${escaped}%`)
    }

    if (query.sort === 'comments') {
      postsQuery = postsQuery
        .order('comments_count', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false })
    } else if (query.sort === 'reactions') {
      postsQuery = postsQuery
        .order('reactions_count', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false })
    } else {
      postsQuery = postsQuery
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
    }

    const { data, error, count } = await postsQuery.range(from, to)
    if (error) throw error

    const rows = (data ?? []) as PostsWithCountsRow[]
    const authorIds = Array.from(new Set(rows.map((row) => row.author_id).filter(Boolean)))
    const channelIds = Array.from(new Set(rows.map((row) => row.channel_id).filter((value) => typeof value === 'number')))
    const subcatIds = Array.from(new Set(rows.map((row) => row.subcategory_tag_id).filter((value): value is number => typeof value === 'number')))

    const postIds = rows.map((row) => row.id)
    const [{ data: profiles }, { data: rowChannels }, { data: rowTags }, { data: medalsRows }] = await Promise.all([
      authorIds.length
        ? supabase.from('profiles_public').select('id,username,display_name,avatar_url').in('id', authorIds)
        : Promise.resolve({ data: [] as ProfileRow[] }),
      channelIds.length
        ? supabase.from('channels').select('id,slug,name_he').in('id', channelIds)
        : Promise.resolve({ data: [] as ChannelRow[] }),
      subcatIds.length
        ? supabase.from('tags').select('id,slug,name_he').in('id', subcatIds)
        : Promise.resolve({ data: [] as Array<Pick<TagRow, 'id' | 'slug' | 'name_he'>> }),
      postIds.length
        ? supabase.from('post_medals_all_time').select('post_id,gold,silver,bronze').in('post_id', postIds)
        : Promise.resolve({ data: [] as Array<{ post_id: string; gold: number; silver: number; bronze: number }> }),
    ])

    const profilesMap = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))
    const channelsMap = new Map(((rowChannels ?? []) as ChannelRow[]).map((channel) => [channel.id, channel]))
    const tagsMap = new Map(((rowTags ?? []) as Array<{ id: number; slug: string; name_he: string }>).map((tag) => [tag.id, tag]))
    const medalsMap = new Map(((medalsRows ?? []) as Array<{ post_id: string; gold: number; silver: number; bronze: number }>).map((m) => [m.post_id, m]))

    const results: PostCardVM[] = rows.map((row) => {
      const author = profilesMap.get(row.author_id)
      const channel = channelsMap.get(row.channel_id)
      const subcategory = row.subcategory_tag_id != null ? tagsMap.get(row.subcategory_tag_id) : undefined

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        cover_image_url: row.cover_image_url,
        published_at: row.published_at,
        created_at: row.created_at,
        channel: channel ? { slug: channel.slug, name_he: channel.name_he } : null,
        author: author
          ? { username: author.username, display_name: author.display_name, avatar_url: author.avatar_url }
          : null,
        subcategory: subcategory
          ? { id: subcategory.id, slug: subcategory.slug, name_he: subcategory.name_he }
          : null,
        comments_count: typeof row.comments_count === 'number' ? row.comments_count : 0,
        reactions_count: typeof row.reactions_count === 'number' ? row.reactions_count : 0,
        medals: medalsMap.has(row.id) ? {
          gold: medalsMap.get(row.id)!.gold ?? 0,
          silver: medalsMap.get(row.id)!.silver ?? 0,
          bronze: medalsMap.get(row.id)!.bronze ?? 0,
        } : null,
      }
    })

    return {
      query,
      channels,
      subcats,
      subcatLabel,
      subcatsByChannel,
      subcatLabelsByChannel,
      results,
      total: count ?? 0,
      error: null,
    }
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : error instanceof Error
          ? error.message
          : 'שגיאה לא ידועה'

    return {
      query,
      channels: [{ value: '', label: 'הכל' }],
      subcats: [{ value: '', label: 'בחר קטגוריה קודם' }],
      subcatLabel: 'תת-קטגוריה',
      subcatsByChannel: {},
      subcatLabelsByChannel: {},
      results: [],
      total: 0,
      error: message,
    }
  }
}
