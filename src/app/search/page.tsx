'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

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

type Option = { value: string; label: string }
type SortKey = 'recent' | 'comments' | 'reactions'

type PostCardVM = {
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
}

const PAGE_SIZE = 10

function safeText(v: unknown) {
  return typeof v === 'string' ? v : ''
}

function timeAgo(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const sec = Math.max(0, Math.floor(diff / 1000))
  if (sec < 60) return 'הרגע'
  const min = Math.floor(sec / 60)
  if (min < 60) return `לפני ${min} דק׳`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `לפני ${hr} שעות`
  const day = Math.floor(hr / 24)
  return `לפני ${day} ימים`
}

export default function SearchPage() {
  const sp = useSearchParams()
  const router = useRouter()

  // URL -> initial
  const urlQ = safeText(sp.get('q')).trim()
  const urlChannel = safeText(sp.get('channel')).trim() // channel slug
  const urlSubcatId = safeText(sp.get('subcat')).trim() // tag id (string)
  const urlAuthor = safeText(sp.get('author')).trim() // username
  const urlSort = safeText(sp.get('sort')).trim() as SortKey
  const urlPage = Math.max(1, Number(sp.get('page') || 1) || 1)

  // form state
  const [q, setQ] = useState(urlQ)
  const [channel, setChannel] = useState(urlChannel)
  const [subcatId, setSubcatId] = useState(urlSubcatId)
  const [author, setAuthor] = useState(urlAuthor)
  const [sort, setSort] = useState<SortKey>(urlSort === 'comments' || urlSort === 'reactions' || urlSort === 'recent' ? urlSort : 'recent')

  const [channels, setChannels] = useState<Option[]>([])
  const [subcats, setSubcats] = useState<Option[]>([{ value: '', label: 'בחר קטגורייה קודם' }])
  const [subcatLabel, setSubcatLabel] = useState('תת-קטגוריה')

  const [results, setResults] = useState<PostCardVM[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load channel options
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('channels').select('id, slug, name_he').order('sort_order', { ascending: true })
      if (!alive) return
      if (error) return
      const opts = (data as ChannelRow[] | null | undefined)?.map((c) => ({ value: c.slug, label: c.name_he })) ?? []
      setChannels([{ value: '', label: 'הכל' }, ...opts])
    })()
    return () => {
      alive = false
    }
  }, [])

  // Load subcategory options based on chosen channel.
  // Fetches all active genre tags for the selected channel, sorted by known canonical order.
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!channel) {
        setSubcatLabel('תת-קטגוריה')
        setSubcats([{ value: '', label: 'בחר קטגורייה קודם' }])
        setSubcatId('')
        return
      }

      const { data: ch, error: chErr } = await supabase.from('channels').select('id, slug, name_he').eq('slug', channel).maybeSingle()
      if (!alive) return
      if (chErr || !ch?.id) {
        setSubcatLabel('תת-קטגוריה')
        setSubcats([{ value: '', label: 'בחר קטגורייה קודם' }])
        setSubcatId('')
        return
      }

      const channelRow = ch as ChannelRow
      const channelId = Number(channelRow.id)

      // Cosmetic label per channel
      setSubcatLabel(channelId === 1 ? 'תת-קטגוריה (פריקה)' : channelId === 2 ? 'תת-קטגוריה (סיפורים)' : channelId === 3 ? 'תת-קטגוריה (מגזין)' : 'תת-קטגוריה')

      // Canonical subcategory order per channel (matches /write)
      const KNOWN_ORDER: Record<string, string[]> = {
        'פריקה':    ['וידויים', 'מחשבות', 'שירים'],
        'סיפורים':  ['סיפורים אמיתיים', 'סיפורים קצרים', 'סיפור בהמשכים'],
        'מגזין':    ['חדשות', 'תרבות ובידור', 'טכנולוגיה', 'ספורט', 'דעות'],
      }
      const knownOrder = KNOWN_ORDER[channelRow.name_he] ?? []

      // Fetch all active genre tags for this channel directly
      const { data: tags, error: tagsErr } = await supabase
        .from('tags')
        .select('id, slug, name_he, channel_id, type, is_active')
        .eq('channel_id', channelId)
        .eq('type', 'genre')
        .eq('is_active', true)
        .limit(200)

      if (!alive) return
      if (tagsErr) {
        setSubcats([{ value: '', label: 'כל תתי-הקטגוריות' }])
        return
      }

      const tagList = (tags as TagRow[] | null | undefined) ?? []

      if (tagList.length === 0) {
        setSubcats([{ value: '', label: 'כל תתי-הקטגוריות' }])
        setSubcatId('')
        return
      }

      // Sort: known-order tags first (by index), then any extras alphabetically
      const sorted = [...tagList].sort((a, b) => {
        const ai = knownOrder.indexOf(a.name_he)
        const bi = knownOrder.indexOf(b.name_he)
        const aIdx = ai === -1 ? Infinity : ai
        const bIdx = bi === -1 ? Infinity : bi
        if (aIdx !== bIdx) return aIdx - bIdx
        return (a.name_he || '').localeCompare(b.name_he || '')
      })

      const opts = sorted.map((t) => ({ value: String(t.id), label: t.name_he }))
      setSubcats([{ value: '', label: 'כל תתי-הקטגוריות' }, ...opts])

      // If current subcat isn't in this channel -> reset
      if (subcatId && !opts.some((o) => o.value === subcatId)) setSubcatId('')
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  // keep form state in sync when navigating via links
  useEffect(() => {
    setQ(urlQ)
    setChannel(urlChannel)
    setSubcatId(urlSubcatId)
    setAuthor(urlAuthor)
    if (urlSort === 'comments' || urlSort === 'reactions' || urlSort === 'recent') setSort(urlSort)
  }, [urlQ, urlChannel, urlSubcatId, urlAuthor, urlSort])

  function buildUrl(next: Partial<{ q: string; channel: string; subcat: string; sort: SortKey; page: number; author: string }>) {
    const params = new URLSearchParams()

    const qv = (next.q ?? q).trim()
    const cv = (next.channel ?? channel).trim()
    const sv = (next.subcat ?? subcatId).trim()
    const sortv = (next.sort ?? sort).trim() as SortKey
    const pv = next.page ?? 1
    const av = (next.author ?? author).trim()

    if (qv) params.set('q', qv)
    if (cv) params.set('channel', cv)
    if (sv) params.set('subcat', sv) // tag id
    if (av) params.set('author', av)
    if (sortv && sortv !== 'recent') params.set('sort', sortv)
    if (pv > 1) params.set('page', String(pv))

    const qs = params.toString()
    return `/search${qs ? `?${qs}` : ''}`
  }

  async function runSearch() {
    setLoading(true)
    setError(null)

    try {
      // Resolve channel slug -> id
      let channelId: number | null = null
      if (urlChannel) {
        const { data } = await supabase.from('channels').select('id').eq('slug', urlChannel).maybeSingle()
        channelId = data?.id != null ? Number((data as { id: number }).id) : null
      }

      // Subcategory id comes directly from the URL (we store tag.id as the value)
      const subcatNum = urlSubcatId ? Number(urlSubcatId) : null
      const subcatValid = subcatNum != null && Number.isFinite(subcatNum) ? subcatNum : null

      // Resolve author username -> id
      let authorId: string | null = null
      if (urlAuthor) {
        const { data } = await supabase.from('profiles').select('id').eq('username', urlAuthor).maybeSingle()
        authorId = data?.id ?? null
      }
      if (urlAuthor && !authorId) {
        setResults([])
        setTotal(0)
        setLoading(false)
        return
      }

      const from = (urlPage - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let query = supabase
        .from('posts_with_counts')
        .select(
          'id,author_id,title,slug,excerpt,cover_image_url,status,published_at,created_at,updated_at,channel_id,subcategory_tag_id,comments_count,reactions_count',
          { count: 'exact' }
        )
        .eq('status', 'published')
        .is('deleted_at', null)

      if (channelId) query = query.eq('channel_id', channelId)
      if (subcatValid) query = query.eq('subcategory_tag_id', subcatValid)
      if (authorId) query = query.eq('author_id', authorId)

      if (urlQ) query = query.or(`title.ilike.%${urlQ}%,excerpt.ilike.%${urlQ}%`)

      if (urlSort === 'comments') query = query.order('comments_count', { ascending: false }).order('published_at', { ascending: false, nullsFirst: false })
      else if (urlSort === 'reactions') query = query.order('reactions_count', { ascending: false }).order('published_at', { ascending: false, nullsFirst: false })
      else query = query.order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })

      const { data, error, count } = await query.range(from, to)
      if (error) throw error

      const rows = (data as PostsWithCountsRow[] | null | undefined) ?? []

      // Fetch related rows (no embeds -> avoids PGRST201)
      const authorIds = Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean)))
      const channelIds = Array.from(new Set(rows.map((r) => r.channel_id).filter((v) => typeof v === 'number')))
      const subcatIds = Array.from(new Set(rows.map((r) => r.subcategory_tag_id).filter((v): v is number => typeof v === 'number')))

      const [{ data: profiles }, { data: chs }, { data: tags }] = await Promise.all([
        authorIds.length ? supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', authorIds) : Promise.resolve({ data: [] as ProfileRow[] }),
        channelIds.length ? supabase.from('channels').select('id,slug,name_he').in('id', channelIds) : Promise.resolve({ data: [] as ChannelRow[] }),
        subcatIds.length ? supabase.from('tags').select('id,slug,name_he').in('id', subcatIds) : Promise.resolve({ data: [] as Array<Pick<TagRow, 'id' | 'slug' | 'name_he'>> }),
      ])

      const profilesMap = new Map((profiles as ProfileRow[] | null | undefined)?.map((p) => [p.id, p]) ?? [])
      const channelsMap = new Map((chs as ChannelRow[] | null | undefined)?.map((c) => [c.id, c]) ?? [])
      const tagsMap = new Map((tags as Array<{ id: number; slug: string; name_he: string }> | null | undefined)?.map((t) => [t.id, t]) ?? [])

      const mapped: PostCardVM[] = rows.map((r) => {
        const pr = profilesMap.get(r.author_id)
        const chRow = channelsMap.get(r.channel_id)
        const tg = r.subcategory_tag_id != null ? tagsMap.get(r.subcategory_tag_id) : undefined

        return {
          id: r.id,
          slug: r.slug,
          title: r.title,
          excerpt: r.excerpt,
          cover_image_url: r.cover_image_url,
          published_at: r.published_at,
          created_at: r.created_at,
          channel: chRow ? { slug: chRow.slug, name_he: chRow.name_he } : null,
          author: pr ? { username: pr.username, display_name: pr.display_name, avatar_url: pr.avatar_url } : null,
          subcategory: tg ? { id: tg.id, slug: tg.slug, name_he: tg.name_he } : null,
          comments_count: typeof r.comments_count === 'number' ? r.comments_count : 0,
          reactions_count: typeof r.reactions_count === 'number' ? r.reactions_count : 0,
        }
      })

      setResults(mapped)
      setTotal(count || 0)
    } catch (e: unknown) {
      const msg =
        (typeof e === 'object' && e && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : e instanceof Error
          ? e.message
          : 'שגיאה לא ידועה')
      setError(msg)
      setResults([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  // Run when URL params change
  useEffect(() => {
    runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const pageNumbers = useMemo(() => {
    const maxButtons = 7
    if (pages <= maxButtons) return Array.from({ length: pages }, (_, i) => i + 1)

    const list: (number | '…')[] = []
    const add = (x: number | '…') => list.push(x)

    const start = Math.max(2, urlPage - 1)
    const end = Math.min(pages - 1, urlPage + 1)

    add(1)
    if (start > 2) add('…')
    for (let i = start; i <= end; i++) add(i)
    if (end < pages - 1) add('…')
    add(pages)
    return list
  }, [pages, urlPage])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(buildUrl({ q, channel, subcat: subcatId, sort, page: 1, author }))
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">חיפוש פוסטים</h1>
        <div className="text-sm text-muted-foreground">סינונים + מיון + פייג׳יניישן</div>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border bg-neutral-50/80 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-neutral-50/70 dark:bg-muted/80 dark:supports-[backdrop-filter]:bg-muted/70"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">טקסט</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חפש כותרת..."
              className="h-11 w-full rounded-xl border px-3 bg-background text-foreground placeholder:text-muted-foreground dark:border-border"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">קטגוריה</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-11 w-full rounded-xl border px-3 bg-background text-foreground dark:border-border">
              {(channels.length ? channels : [{ value: '', label: 'טוען...' }]).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{subcatLabel}</label>
            <select value={subcatId} onChange={(e) => setSubcatId(e.target.value)} className="h-11 w-full rounded-xl border px-3 bg-background text-foreground dark:border-border" disabled={!channel}>
              {(subcats.length ? subcats : [{ value: '', label: 'בחר קטגורייה קודם' }]).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">מיון</label>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-11 w-full rounded-xl border px-3 bg-background text-foreground dark:border-border">
              <option value="recent">אחרונים</option>
              <option value="reactions">ריאקשנים</option>
              <option value="comments">תגובות</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="submit" className="rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            חפש
          </button>

          <div className="text-xs text-muted-foreground">{loading ? 'טוען...' : `${total.toLocaleString()} תוצאות`}</div>
        </div>

        {error ? <div className="mt-3 text-sm text-red-700">שגיאת חיפוש: {error}</div> : null}
      </form>

      <div className="mt-6 space-y-3">
        {results.map((p) => (
          <div
            key={p.id}
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/post/${p.slug}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') router.push(`/post/${p.slug}`)
            }}
            className="cursor-pointer rounded-2xl border bg-white p-4 hover:shadow-sm dark:bg-card dark:border-border"
          >
            <div className="flex flex-row-reverse items-start gap-4">
              {p.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.cover_image_url} alt="" className="h-20 w-28 rounded-xl object-cover" />
              ) : (
                <div className="h-20 w-28 rounded-xl bg-muted" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {p.channel ? (
                    <Link
                      href={`/c/${p.channel.slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full border px-2 py-0.5 hover:bg-muted"
                    >
                      {p.channel.name_he}
                    </Link>
                  ) : null}

                  {p.subcategory?.name_he ? <span className="rounded-full border px-2 py-0.5">{p.subcategory.name_he}</span> : null}

                  {p.author?.username ? (
                    <Link
                      href={`/u/${p.author.username}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full border px-2 py-0.5 hover:bg-muted"
                    >
                      {p.author.display_name || p.author.username}
                    </Link>
                  ) : null}
                </div>

                <div className="mt-2 text-lg font-bold leading-snug">{p.title}</div>
                {p.excerpt ? <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</div> : null}

                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>💬 {p.comments_count ?? 0}</span>
                  <span>🕒 {timeAgo(p.published_at || p.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {!loading && !error && results.length === 0 ? <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground dark:bg-card dark:border-border">לא נמצאו תוצאות.</div> : null}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        {pageNumbers.map((n, idx) =>
          n === '…' ? (
            <span key={`dots-${idx}`} className="px-2 text-muted-foreground">
              …
            </span>
          ) : (
            <Link
              key={n}
              href={buildUrl({ page: n })}
              className={`h-9 min-w-9 rounded-xl border px-3 text-center text-sm leading-9 dark:border-border ${n === urlPage ? 'bg-black text-white dark:bg-foreground dark:text-background' : 'bg-white hover:bg-muted dark:bg-card dark:hover:bg-muted'}`}
            >
              {n}
            </Link>
          )
        )}
      </div>
    </div>
  )
}
