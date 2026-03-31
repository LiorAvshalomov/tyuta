"use client"

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import FeedIntentLink from '@/components/FeedIntentLink'
import { heRelativeTime } from '@/lib/time/heRelativeTime'
import { coverProxySrc, isProxySrc } from '@/lib/coverUrl'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type SortKey = 'recent' | 'reactions' | 'comments'

type PostBase = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  created_at: string
  published_at: string | null
  cover_image_url: string | null
  channel_id: number | null
}

type PostRow = PostBase

type PostItem = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  created_at: string
  published_at: string | null
  cover_image_url: string | null
  channel_name: string | null
  medals: { gold: number; silver: number; bronze: number } | null
}

type ChannelRow = {
  id: number
  name_he: string
}

function clampPage(n: number) {
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

function getErrorMessage(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  if (e instanceof Error) return e.message
  return 'שגיאה לא ידועה'
}


// Updated colors as requested:
// פריקה - red/pink background
// סיפורים - blue background  
// מגזין - purple background
function getChannelStyle(channelName: string | null): string {
  switch (channelName) {
    case 'פריקה': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'סיפורים': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'מגזין': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    default: return 'bg-neutral-100 text-neutral-600 dark:bg-muted dark:text-muted-foreground'
  }
}

function getChannelSlug(channelName: string | null): string | null {
  switch (channelName) {
    case 'פריקה': return 'release'
    case 'סיפורים': return 'stories'
    case 'מגזין': return 'magazine'
    default: return null
  }
}

async function authedFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  }
  if (init.body && !headers['Content-Type'] && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(input, { ...init, headers })
}

/* ─────────────────────────────────────────────────────────────
   Desktop Post Card
   ───────────────────────────────────────────────────────────── */
function DesktopPostCard({
  post,
  isOwner,
  returnTo,
  onDelete
}: {
  post: PostItem
  isOwner: boolean
  returnTo: string
  onDelete: (post: PostItem) => void
}) {
  const router = useRouter()
  const hasMedals = post.medals && (post.medals.gold > 0 || post.medals.silver > 0 || post.medals.bronze > 0)
  const channelSlug = getChannelSlug(post.channel_name)

  return (
    <article
      className="group relative hidden sm:block rounded-xl border border-neutral-100 bg-neutral-50 p-4 transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted/50 dark:hover:bg-muted cursor-pointer"
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/post/${post.slug}`)}
      onKeyDown={e => { if (e.key === 'Enter') router.push(`/post/${post.slug}`) }}
    >
      {/* Owner actions */}
      {isOwner && post.id && (
        <div className="absolute left-3 top-3 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Link
            href={`/write?edit=${encodeURIComponent(post.id)}&return=${encodeURIComponent(returnTo)}`}
            onClick={e => e.stopPropagation()}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium shadow-sm hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted"
          >
            ערוך
          </Link>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete(post) }}
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 shadow-sm hover:bg-red-50 dark:bg-card dark:border-red-800 dark:hover:bg-red-950/30"
          >
            מחק
          </button>
        </div>
      )}

      <div className="flex gap-4">
        {/* Cover Image - Right side */}
        <div className="shrink-0">
          <div className="relative h-28 w-36 overflow-hidden rounded-lg bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 dark:from-blue-950/40 dark:via-purple-950/40 dark:to-pink-950/40">
            {post.cover_image_url ? (
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url(${coverProxySrc(post.cover_image_url)})` }}
                aria-hidden="true"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">📝</div>
            )}
          </div>
        </div>

        {/* Content - Left side */}
        <div className="min-w-0 flex-1 flex flex-col justify-between py-1">
          {/* Title */}
          <h4 className="text-base font-bold leading-snug line-clamp-2">
            <span className="tyuta-hover">{post.title}</span>
          </h4>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-sm text-neutral-600 line-clamp-1 mt-1 dark:text-muted-foreground">{post.excerpt}</p>
          )}

          {/* Meta row: Date • Category | Medals */}
          <div className="flex items-center justify-between mt-auto pt-2">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-muted-foreground">
              <span>{heRelativeTime(post.published_at ?? post.created_at)}</span>
              {post.channel_name && (
                <>
                  <span>•</span>
                  {channelSlug ? (
                    <FeedIntentLink
                      href={`/c/${channelSlug}`}
                      onClick={e => e.stopPropagation()}
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${getChannelStyle(post.channel_name)}`}
                    >
                      {post.channel_name}
                    </FeedIntentLink>
                  ) : (
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${getChannelStyle(post.channel_name)}`}>
                      {post.channel_name}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Medals - left side */}
            {hasMedals && (
              <div className="flex items-center gap-1.5 text-sm">
                {post.medals!.bronze > 0 && <span>{post.medals!.bronze} 🥉</span>}
                {post.medals!.silver > 0 && <span>{post.medals!.silver} 🥈</span>}
                {post.medals!.gold > 0 && <span>{post.medals!.gold} 🥇</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

/* ─────────────────────────────────────────────────────────────
   Mobile Post Card
   ───────────────────────────────────────────────────────────── */
function MobilePostCard({
  post,
  isOwner,
  returnTo,
  onDelete
}: {
  post: PostItem
  isOwner: boolean
  returnTo: string
  onDelete: (post: PostItem) => void
}) {
  const router = useRouter()
  const hasMedals = post.medals && (post.medals.gold > 0 || post.medals.silver > 0 || post.medals.bronze > 0)
  const channelSlug = getChannelSlug(post.channel_name)

  return (
    <article
      className="group relative sm:hidden rounded-xl border border-neutral-100 bg-neutral-50 overflow-hidden dark:border-border dark:bg-muted/50 cursor-pointer"
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/post/${post.slug}`)}
      onKeyDown={e => { if (e.key === 'Enter') router.push(`/post/${post.slug}`) }}
    >
      {/* Owner actions */}
      {isOwner && post.id && (
        <div className="absolute left-2 top-2 z-10 flex gap-1">
          <Link
            href={`/write?edit=${encodeURIComponent(post.id)}&return=${encodeURIComponent(returnTo)}`}
            onClick={e => e.stopPropagation()}
            className="rounded-md border border-neutral-200 bg-white/90 px-2 py-1 text-xs font-medium shadow-sm dark:bg-card/90 dark:border-border"
          >
            ערוך
          </Link>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete(post) }}
            className="rounded-md border border-red-200 bg-white/90 px-2 py-1 text-xs font-medium text-red-600 shadow-sm dark:bg-card/90 dark:border-red-800"
          >
            מחק
          </button>
        </div>
      )}

      {/* Cover Image - Top, full width */}
      <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 dark:from-blue-950/40 dark:via-purple-950/40 dark:to-pink-950/40">
        {post.cover_image_url ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${coverProxySrc(post.cover_image_url)})` }}
            aria-hidden="true"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-40">📝</div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Title */}
        <h4 className="text-base font-bold leading-snug line-clamp-2 mb-1">
          <span className="tyuta-hover">{post.title}</span>
        </h4>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-sm text-neutral-600 line-clamp-2 mb-2 dark:text-muted-foreground">{post.excerpt}</p>
        )}

        {/* Meta row: Date • Category | Medals */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 dark:text-muted-foreground">{heRelativeTime(post.published_at ?? post.created_at)}</span>
            {post.channel_name && (
              channelSlug ? (
                <FeedIntentLink
                  href={`/c/${channelSlug}`}
                  onClick={e => e.stopPropagation()}
                  className={`rounded px-2 py-0.5 font-semibold ${getChannelStyle(post.channel_name)}`}
                >
                  {post.channel_name}
                </FeedIntentLink>
              ) : (
                <span className={`rounded px-2 py-0.5 font-semibold ${getChannelStyle(post.channel_name)}`}>
                  {post.channel_name}
                </span>
              )
            )}
          </div>

          {/* Medals */}
          {hasMedals && (
            <div className="flex items-center gap-1 text-sm">
              {post.medals!.bronze > 0 && <span>{post.medals!.bronze} 🥉</span>}
              {post.medals!.silver > 0 && <span>{post.medals!.silver} 🥈</span>}
              {post.medals!.gold > 0 && <span>{post.medals!.gold} 🥇</span>}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export default function ProfilePostsClient({
  profileId,
  username,
}: {
  profileId: string
  username: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const returnTo = useMemo(() => {
    const q = searchParams.toString()
    return q ? `${pathname}?${q}` : pathname
  }, [pathname, searchParams])

  const [viewerId, setViewerId] = useState<string | null>(null)
  const isOwner = viewerId === profileId

  const [sort, setSort] = useState<SortKey>('recent')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<PostItem[]>([])
  const [total, setTotal] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [sortedIdsCache, setSortedIdsCache] = useState<Record<string, string[]>>({})
  const [channelsMap, setChannelsMap] = useState<Map<number, string>>(new Map())
  
  // Mobile: 4 posts, Desktop: 5 posts
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  
  const perPage = isMobile ? 4 : 5

  void username // suppress unused warning

  // Load channels mapping once
  useEffect(() => {
    const loadChannels = async () => {
      const { data } = await supabase.from('channels').select('id, name_he')
      if (data) {
        const map = new Map<number, string>()
        for (const ch of data as ChannelRow[]) {
          map.set(ch.id, ch.name_he)
        }
        setChannelsMap(map)
      }
    }
    loadChannels()
  }, [])

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setViewerId(data.user?.id ?? null))
      .catch(() => setViewerId(null))
  }, [])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [total, perPage])

  useEffect(() => { setPage(1) }, [sort])

  const refetchHard = () => {
    setSortedIdsCache({})
    setRefreshKey(k => k + 1)
  }

  const onDelete = async (post: PostItem) => {
    if (!post.id) return
    const ok = confirm('למחוק את הפוסט? אפשר יהיה לשחזר עד 14 יום.')
    if (!ok) return

    try {
      const res = await authedFetch(`/api/posts/${post.id}/delete`, { method: 'POST' })
      const j = (await res.json().catch(() => ({}))) as { error?: string | { message?: string } }
      if (!res.ok) {
        const msg = typeof j.error === 'string' ? j.error : j.error?.message
        throw new Error(msg ?? 'שגיאה במחיקה')
      }
      setPosts(prev => prev.filter(p => p.id !== post.id))
      refetchHard()
    } catch (e: unknown) {
      alert(getErrorMessage(e))
    }
  }

  useEffect(() => {
    if (channelsMap.size === 0) return // Wait for channels to load

    let cancelled = false

    async function run() {
      setLoading(true)
      setError(null)

      const safePage = clampPage(page)
      const from = (safePage - 1) * perPage
      const to = from + perPage - 1

      try {
        const countRes = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', profileId)
          .eq('status', 'published')
          .is('deleted_at', null)

        if (countRes.error) throw countRes.error
        if (!cancelled) setTotal(countRes.count ?? 0)

        if (sort === 'recent') {
          const res = await supabase
            .from('posts')
            .select('id, slug, title, excerpt, created_at, published_at, cover_image_url, channel_id')
            .eq('author_id', profileId)
            .eq('status', 'published')
            .is('deleted_at', null)
            .order('published_at', { ascending: false, nullsFirst: false })
            .range(from, to)

          if (res.error) throw res.error

          // Get medals for these posts from post_medals_all_time
          const postIds = (res.data ?? []).map((p: PostBase) => p.id)
          const medalsMap = new Map<string, { gold: number; silver: number; bronze: number }>()
          
          if (postIds.length > 0) {
            const { data: medalsData } = await supabase
              .from('post_medals_all_time')
              .select('post_id, gold, silver, bronze')
              .in('post_id', postIds)
            
            for (const m of medalsData ?? []) {
              medalsMap.set(m.post_id, { 
                gold: m.gold ?? 0, 
                silver: m.silver ?? 0, 
                bronze: m.bronze ?? 0 
              })
            }
          }

          const mapped = (res.data ?? []).map((p: PostBase) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            created_at: p.created_at,
            published_at: p.published_at,
            cover_image_url: p.cover_image_url,
            channel_name: p.channel_id ? channelsMap.get(p.channel_id) ?? null : null,
            medals: medalsMap.get(p.id) ?? null,
          })) as PostItem[]

          if (!cancelled) setPosts(mapped)
          return
        }

        const cacheKey = `${sort}:${profileId}`
        let sortedIds = sortedIdsCache[cacheKey]

        if (!sortedIds) {
          const allPostsRes = await supabase
            .from('posts')
            .select('id, slug, title, excerpt, created_at, published_at, cover_image_url, channel_id')
            .eq('author_id', profileId)
            .eq('status', 'published')
            .is('deleted_at', null)
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(500)

          if (allPostsRes.error) throw allPostsRes.error
          const allPosts = (allPostsRes.data ?? []) as PostBase[]
          const ids = allPosts.map(p => p.id)

          const counts = new Map<string, number>()
          if (ids.length) {
            if (sort === 'comments') {
              const cRes = await supabase.from('comments').select('post_id').in('post_id', ids).limit(5000)
              if (cRes.error) throw cRes.error
              for (const row of cRes.data ?? []) {
                const pid = (row as { post_id: string }).post_id
                counts.set(pid, (counts.get(pid) ?? 0) + 1)
              }
            } else {
              const rRes = await supabase.from('post_reaction_votes').select('post_id').in('post_id', ids).limit(5000)
              if (rRes.error) throw rRes.error
              for (const row of rRes.data ?? []) {
                const pid = (row as { post_id: string }).post_id
                counts.set(pid, (counts.get(pid) ?? 0) + 1)
              }
            }
          }

          const byId = new Map(allPosts.map(p => [p.id, p]))
          sortedIds = [...ids].sort((a, b) => {
            const ca = counts.get(a) ?? 0
            const cb = counts.get(b) ?? 0
            if (cb !== ca) return cb - ca
            const pa = byId.get(a)
            const pb = byId.get(b)
            const da = new Date(pa?.published_at ?? pa?.created_at ?? 0).getTime()
            const db = new Date(pb?.published_at ?? pb?.created_at ?? 0).getTime()
            return db - da
          })

          setSortedIdsCache(prev => ({ ...prev, [cacheKey]: sortedIds! }))
        }

        const sliceIds = sortedIds.slice(from, to + 1)
        if (sliceIds.length === 0) {
          if (!cancelled) setPosts([])
          return
        }

        const res = await supabase
          .from('posts')
          .select('id, slug, title, excerpt, created_at, published_at, cover_image_url, channel_id')
          .in('id', sliceIds)
          .is('deleted_at', null)

        if (res.error) throw res.error

        // Get medals
        const medalsMap = new Map<string, { gold: number; silver: number; bronze: number }>()
        if (sliceIds.length > 0) {
          const { data: medalsData } = await supabase
            .from('post_medals_all_time')
            .select('post_id, gold, silver, bronze')
            .in('post_id', sliceIds)
          
          for (const m of medalsData ?? []) {
            medalsMap.set(m.post_id, { 
              gold: m.gold ?? 0, 
              silver: m.silver ?? 0, 
              bronze: m.bronze ?? 0 
            })
          }
        }

        const byId = new Map((res.data ?? []).map(p => [(p as PostRow).id, p as PostRow]))
        const ordered = sliceIds
          .map(id => byId.get(id))
          .filter((p): p is PostRow => Boolean(p))
          .map(p => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            created_at: p.created_at,
            published_at: p.published_at,
            cover_image_url: p.cover_image_url,
            channel_name: p.channel_id ? channelsMap.get(p.channel_id) ?? null : null,
            medals: medalsMap.get(p.id) ?? null,
          })) as PostItem[]

        if (!cancelled) setPosts(ordered)
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => { cancelled = true }
  }, [profileId, sort, page, perPage, sortedIdsCache, refreshKey, channelsMap])

  const pages = useMemo(() => {
    const n = totalPages
    const cur = clampPage(page)
    const out: number[] = []
    const start = Math.max(1, cur - 2)
    const end = Math.min(n, cur + 2)
    for (let i = start; i <= end; i++) out.push(i)
    if (out[0] !== 1) out.unshift(1)
    if (out[out.length - 1] !== n) out.push(n)
    return [...new Set(out)]
  }, [page, totalPages])

  return (
    <section>
      {/* Sort buttons */}
      <div className="mb-4 flex flex-wrap items-center justify-center sm:justify-start gap-2">
        <button
          type="button"
          onClick={() => setSort('recent')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
            sort === 'recent'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-card dark:border-border dark:text-muted-foreground dark:hover:bg-muted'
          }`}
        >
          אחרונים
        </button>
        <button
          type="button"
          onClick={() => setSort('reactions')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
            sort === 'reactions'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-card dark:border-border dark:text-muted-foreground dark:hover:bg-muted'
          }`}
        >
          הכי פופולרי
        </button>
        <button
          type="button"
          onClick={() => setSort('comments')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
            sort === 'comments'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-card dark:border-border dark:text-muted-foreground dark:hover:bg-muted'
          }`}
        >
          הכי הרבה תגובות
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-xl border border-neutral-100 dark:border-border bg-neutral-50 dark:bg-muted/50 p-4">
              {/* Desktop: thumbnail left, text right */}
              <div className="hidden sm:flex items-start gap-4">
                <div className="h-28 w-36 shrink-0 rounded-xl bg-neutral-200 dark:bg-muted" />
                <div className="flex-1 py-1 space-y-2">
                  <div className="h-4 w-3/4 rounded-lg bg-neutral-200 dark:bg-muted" />
                  <div className="h-4 w-1/2 rounded-lg bg-neutral-200 dark:bg-muted" />
                  <div className="h-3 w-full rounded-lg bg-neutral-100 dark:bg-muted/60" />
                  <div className="mt-3 h-3 w-1/3 rounded-lg bg-neutral-100 dark:bg-muted/60" />
                </div>
              </div>
              {/* Mobile: cover top, text below */}
              <div className="sm:hidden space-y-2">
                <div className="aspect-[16/9] w-full rounded-xl bg-neutral-200 dark:bg-muted" />
                <div className="h-4 w-3/4 rounded-lg bg-neutral-200 dark:bg-muted" />
                <div className="h-3 w-full rounded-lg bg-neutral-100 dark:bg-muted/60" />
                <div className="h-3 w-1/4 rounded-lg bg-neutral-100 dark:bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length ? (
        <div className="space-y-3">
          {posts.map(p => (
            <div key={p.slug}>
              <DesktopPostCard post={p} isOwner={isOwner} returnTo={returnTo} onDelete={onDelete} />
              <MobilePostCard post={p} isOwner={isOwner} returnTo={returnTo} onDelete={onDelete} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-neutral-50 px-4 py-12 text-center dark:bg-muted/50">
          <div className="text-3xl mb-2">📝</div>
          <p className="text-sm text-neutral-500 dark:text-muted-foreground">אין עדיין פוסטים.</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-card dark:border-border dark:hover:bg-muted"
          >
            הבא →
          </button>

          {pages.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                n === page
                  ? 'bg-neutral-900 text-white shadow-sm dark:bg-foreground dark:text-background'
                  : 'border border-neutral-200 bg-white hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted'
              }`}
            >
              {n}
            </button>
          ))}

          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-card dark:border-border dark:hover:bg-muted"
          >
            ← קודם
          </button>
        </div>
      )}
    </section>
  )
}
