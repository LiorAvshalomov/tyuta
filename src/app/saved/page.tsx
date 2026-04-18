'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bookmark, BookOpenText, Clock3, ExternalLink, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'
import Avatar from '@/components/Avatar'
import AuthorHover from '@/components/AuthorHover'
import FeedIntentLink from '@/components/FeedIntentLink'
import { mapSupabaseError } from '@/lib/mapSupabaseError'

type SavedPostRow = {
  created_at: string
  post_id: string
  post: {
    id: string
    slug: string
    title: string | null
    excerpt: string | null
    published_at: string | null
    deleted_at: string | null
    author: {
      username: string | null
      display_name: string | null
      avatar_url: string | null
    } | null
    channel: {
      slug: string | null
      name_he: string | null
    } | null
  } | null
}

type PaginationState = {
  page: number
  pageSize: number
  total: number
}

type SupabaseLikeError = {
  message?: string
  details?: unknown
  hint?: unknown
  code?: unknown
}

type ChannelTone = {
  badge: string
  panel: string
  panelRing: string
  icon: string
  cta: string
}

type SavedCachePayload = {
  rows: SavedPostRow[]
  total: number
  page: number
  savedAt: string
}

const PAGE_SIZE = 6
const SAVED_CACHE_PREFIX = 'tyuta:saved-cache:'
const VISIBILITY_STALE_MS = 15 * 1000

function cacheKey(userId: string, page: number) {
  return `${SAVED_CACHE_PREFIX}${userId}:${page}`
}

function readSavedCache(userId: string, page: number): SavedCachePayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(cacheKey(userId, page))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedCachePayload
    if (!Array.isArray(parsed.rows) || typeof parsed.savedAt !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function writeSavedCache(userId: string, page: number, rows: SavedPostRow[], total: number) {
  if (typeof window === 'undefined') return
  try {
    const payload: SavedCachePayload = { rows, total, page, savedAt: new Date().toISOString() }
    window.sessionStorage.setItem(cacheKey(userId, page), JSON.stringify(payload))
  } catch {
    // best-effort
  }
}

function clearSavedCache(userId: string) {
  if (typeof window === 'undefined') return
  try {
    const prefix = `${SAVED_CACHE_PREFIX}${userId}:`
    const toDelete: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i)
      if (k?.startsWith(prefix)) toDelete.push(k)
    }
    for (const k of toDelete) window.sessionStorage.removeItem(k)
  } catch {
    // best-effort
  }
}

const DEFAULT_TONE: ChannelTone = {
  badge: 'border-neutral-200 bg-white/80 text-neutral-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200',
  panel: 'from-white via-neutral-50 to-neutral-100 dark:from-[#1f1f1f] dark:via-[#1b1b1b] dark:to-[#171717]',
  panelRing: 'ring-black/5 dark:ring-white/8',
  icon: 'bg-neutral-900 text-white dark:bg-white dark:text-black',
  cta: 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-100',
}

function getChannelTone(channelName: string | null, channelSlug: string | null): ChannelTone {
  const normalizedSlug = (channelSlug ?? '').trim()

  if (normalizedSlug === 'release') {
    return {
      badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
      panel: 'from-white via-rose-50/80 to-orange-50/90 dark:from-[#1f1a1d] dark:via-[#24161c] dark:to-[#231915]',
      panelRing: 'ring-rose-100/90 dark:ring-rose-900/25',
      icon: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-white',
      cta: 'bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-500 dark:text-white dark:hover:bg-rose-400',
    }
  }

  if (normalizedSlug === 'stories') {
    return {
      badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300',
      panel: 'from-white via-sky-50/80 to-indigo-50/90 dark:from-[#171c25] dark:via-[#16202a] dark:to-[#181b29]',
      panelRing: 'ring-sky-100/90 dark:ring-sky-900/25',
      icon: 'bg-sky-600 text-white dark:bg-sky-500 dark:text-white',
      cta: 'bg-sky-600 text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-white dark:hover:bg-sky-400',
    }
  }

  if (normalizedSlug === 'magazine') {
    return {
      badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300',
      panel: 'from-white via-violet-50/80 to-fuchsia-50/90 dark:from-[#1d1825] dark:via-[#201829] dark:to-[#231826]',
      panelRing: 'ring-violet-100/90 dark:ring-violet-900/25',
      icon: 'bg-violet-600 text-white dark:bg-violet-500 dark:text-white',
      cta: 'bg-violet-600 text-white hover:bg-violet-500 dark:bg-violet-500 dark:text-white dark:hover:bg-violet-400',
    }
  }

  void channelName
  return DEFAULT_TONE
}

function asCleanString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v).trim()
  try { return JSON.stringify(v).trim() } catch { return String(v).trim() }
}

function formatErr(e: unknown): string {
  if (e && typeof e === 'object') {
    const se = e as SupabaseLikeError
    const normalized = {
      message: asCleanString(se.message) || null,
      details: asCleanString(se.details) || null,
      hint: asCleanString(se.hint) || null,
      code: asCleanString(se.code) || null,
    }
    const friendly = mapSupabaseError(normalized)
    if (friendly) return friendly
    const { message: msg, details, hint, code } = normalized
    const combined = [msg, details, hint].filter(Boolean).join(' — ')
    if (combined) return code ? `${combined} (${code})` : combined
    if (code) return `שגיאה (${code})`
  }
  return e instanceof Error && e.message ? e.message : 'שגיאה לא ידועה'
}

function clampText(s: string | null | undefined, max: number) {
  const t = (s ?? '').trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max).trimEnd()}...` : t
}

function formatDate(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const SELECT_BOOKMARKS =
  'created_at, post_id, post:posts!post_bookmarks_post_id_fkey(id, slug, title, excerpt, published_at, deleted_at, author:profiles!posts_author_id_fkey(username, display_name, avatar_url), channel:channels!posts_channel_id_fkey(slug, name_he))'

async function fetchPage(
  uid: string,
  page: number,
  pageSize: number,
): Promise<{ rows: SavedPostRow[]; total: number } | null> {
  const from = page * pageSize
  const to = from + pageSize - 1
  const { data, error, count } = await supabase
    .from('post_bookmarks')
    .select(SELECT_BOOKMARKS, { count: 'exact' })
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) return null
  const visible = ((data ?? []) as unknown as SavedPostRow[]).filter((r) => !r.post?.deleted_at)
  return { rows: visible, total: typeof count === 'number' ? count : 0 }
}

function SavedSkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-[#1b1b1a] dark:ring-white/5">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="h-6 w-24 rounded-full bg-neutral-200 dark:bg-white/10" />
          <div className="h-7 w-28 rounded-full bg-neutral-200 dark:bg-white/10" />
        </div>
        <div className="h-6 w-3/4 rounded-2xl bg-neutral-200 dark:bg-white/10" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded-xl bg-neutral-100 dark:bg-white/5" />
          <div className="h-4 w-11/12 rounded-xl bg-neutral-100 dark:bg-white/5" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 rounded-xl bg-neutral-100 dark:bg-white/5" />
          <div className="flex gap-2">
            <div className="h-9 w-16 rounded-2xl bg-neutral-200 dark:bg-white/10" />
            <div className="h-9 w-20 rounded-2xl bg-neutral-200 dark:bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SavedPostsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<SavedPostRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [pg, setPg] = useState<PaginationState>({ page: 0, pageSize: PAGE_SIZE, total: 0 })
  const [userId, setUserId] = useState<string | null>(null)
  const [removingPostIds, setRemovingPostIds] = useState<Record<string, true>>({})
  const lastLoadedAtRef = useRef<number>(0)

  // Resolve user once
  useEffect(() => {
    let alive = true
    ;(async () => {
      const resolution = await waitForClientSession(5000)
      if (!alive) return
      if (resolution.status === 'authenticated') {
        setUserId(resolution.user.id)
      } else if (resolution.status !== 'timeout') {
        setErr('כדי לצפות בפוסטים השמורים יש להתחבר.')
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // Fetch on userId / page change — always hits the server.
  // Cache is only used to avoid the loading spinner (show stale data instantly).
  useEffect(() => {
    if (!userId) return
    let alive = true

    const cached = readSavedCache(userId, pg.page)
    if (cached) {
      setRows(cached.rows)
      setPg((prev) => ({ ...prev, total: cached.total }))
      setLoading(false)
    } else {
      setLoading(true)
    }

    setErr(null)
    fetchPage(userId, pg.page, pg.pageSize).then((fresh) => {
      if (!alive || !fresh) return
      setRows(fresh.rows)
      setPg((prev) => ({ ...prev, total: fresh.total }))
      writeSavedCache(userId, pg.page, fresh.rows, fresh.total)
      lastLoadedAtRef.current = Date.now()
      setLoading(false)
    }).catch(() => {
      if (alive) setLoading(false)
    })

    return () => { alive = false }
  }, [userId, pg.page, pg.pageSize])

  // Silently refresh without showing a loading spinner
  const silentRefresh = useCallback(async (uid: string, page: number, pageSize: number) => {
    const fresh = await fetchPage(uid, page, pageSize)
    if (!fresh) return
    setRows(fresh.rows)
    setPg((prev) => ({ ...prev, total: fresh.total }))
    clearSavedCache(uid)
    writeSavedCache(uid, page, fresh.rows, fresh.total)
    lastLoadedAtRef.current = Date.now()
  }, [])

  // Realtime: refresh immediately on any bookmark INSERT/DELETE for this user
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`saved_bookmarks:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_bookmarks', filter: `user_id=eq.${userId}` },
        () => { void silentRefresh(userId, pg.page, pg.pageSize) },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, pg.page, pg.pageSize, silentRefresh])

  // Tab focus: refresh if data is stale (tab was inactive for >15s)
  useEffect(() => {
    if (!userId) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoadedAtRef.current < VISIBILITY_STALE_MS) return
      void silentRefresh(userId, pg.page, pg.pageSize)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, pg.page, pg.pageSize, silentRefresh])

  const totalPages = Math.max(1, Math.ceil(pg.total / pg.pageSize))
  const canPrev = pg.page > 0
  const canNext = pg.page < totalPages - 1
  const savedCountLabel = pg.total > 0 ? `${pg.total.toLocaleString('he-IL')} שמורים` : 'רשימת הקריאה שלך'

  const removeBookmark = async (postId: string) => {
    if (!userId) { setErr('כדי להסיר פוסט מהרשימה יש להתחבר.'); return }

    setRemovingPostIds((prev) => ({ ...prev, [postId]: true }))
    const prevRows = rows
    const prevTotal = pg.total
    setRows((current) => current.filter((row) => row.post_id !== postId))
    setPg((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }))

    try {
      const { error } = await supabase
        .from('post_bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('post_id', postId)

      if (error) throw error

      clearSavedCache(userId)
      const fresh = await fetchPage(userId, pg.page, pg.pageSize)
      if (fresh) {
        setRows(fresh.rows)
        setPg((prev) => {
          const newTotal = fresh.total
          const newTotalPages = Math.max(1, Math.ceil(newTotal / prev.pageSize))
          const safePage = Math.min(prev.page, newTotalPages - 1)
          writeSavedCache(userId, safePage, fresh.rows, newTotal)
          return { ...prev, page: safePage, total: newTotal }
        })
      }
    } catch (e: unknown) {
      setRows(prevRows)
      setPg((prev) => ({ ...prev, total: prevTotal }))
      setErr(formatErr(e))
    } finally {
      setRemovingPostIds((prev) => { const next = { ...prev }; delete next[postId]; return next })
    }
  }

  const PaginationBar = ({ className = '' }: { className?: string }) => {
    if (pg.total <= pg.pageSize) return null
    return (
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
        <div className="text-xs font-medium text-neutral-500 dark:text-muted-foreground">
          עמוד {pg.page + 1} מתוך {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPg((prev) => ({ ...prev, page: prev.page - 1 }))}
            disabled={!canPrev}
            className="rounded-full border border-black/10 bg-white/85 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:-translate-y-[1px] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
          >
            הקודם
          </button>
          <button
            type="button"
            onClick={() => setPg((prev) => ({ ...prev, page: prev.page + 1 }))}
            disabled={!canNext}
            className="rounded-full border border-black/10 bg-white/85 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:-translate-y-[1px] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
          >
            הבא
          </button>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-bold text-neutral-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200">
                <Bookmark className="h-3.5 w-3.5" />
                {savedCountLabel}
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-neutral-950 dark:text-foreground sm:text-[2.35rem]">
                פוסטים שמורים
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:w-auto">
              <div className="rounded-2xl border border-black/8 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[11px] font-semibold text-neutral-500 dark:text-muted-foreground">נשמרו עד כה</div>
                <div className="mt-1 text-lg font-black text-neutral-950 dark:text-foreground">{pg.total.toLocaleString('he-IL')}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[11px] font-semibold text-neutral-500 dark:text-muted-foreground">בעמוד הנוכחי</div>
                <div className="mt-1 text-lg font-black text-neutral-950 dark:text-foreground">{rows.length.toLocaleString('he-IL')}</div>
              </div>
            </div>
          </div>

          {err ? (
            <div className="rounded-3xl border border-red-200/80 bg-red-50/95 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {err}
            </div>
          ) : null}

          {loading ? (
            <div className="lg:columns-2 [column-gap:1rem]">
              <div className="mb-4 break-inside-avoid"><SavedSkeletonCard /></div>
              <div className="mb-4 break-inside-avoid"><SavedSkeletonCard /></div>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-black/10 bg-white/70 px-5 py-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black">
                <BookOpenText className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-black text-neutral-950 dark:text-foreground">אין פוסטים שמורים עדיין</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-neutral-600 dark:text-muted-foreground">
                כשתשמרו פוסטים, הם יחכו כאן לקריאה רגועה ומאורגנת.
              </p>
            </div>
          ) : (
            <>
              <PaginationBar />

              <div className="lg:columns-2 [column-gap:1rem]">
                {rows.map((row) => {
                  const post = row.post

                  if (!post) {
                    return (
                      <div
                        key={`${row.post_id}-${row.created_at}`}
                        className="mb-4 break-inside-avoid overflow-hidden rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-[#1b1b1a] dark:ring-white/5"
                      >
                        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/85 px-3 py-1 text-xs font-semibold text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-muted-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                          פוסט לא זמין
                        </div>
                        <div className="mt-4 text-base font-black text-neutral-950 dark:text-foreground">התוכן הזה כבר לא זמין לצפייה</div>
                        <div className="mt-2 text-sm leading-7 text-neutral-600 dark:text-muted-foreground">
                          כנראה שהפוסט נמחק או שכבר אין הרשאה לצפות בו.
                        </div>
                      </div>
                    )
                  }

                  const authorDisplay = post.author?.display_name ?? post.author?.username ?? 'משתמש'
                  const authorUsername = post.author?.username ?? null
                  const channelLabel = post.channel?.name_he ?? null
                  const channelSlug = post.channel?.slug ?? null
                  const tone = getChannelTone(channelLabel, channelSlug)
                  const publishedDate = formatDate(post.published_at)
                  const excerpt = clampText(post.excerpt, 180)

                  return (
                    <article
                      key={`${row.post_id}-${row.created_at}`}
                      className={`group mb-4 break-inside-avoid overflow-hidden rounded-[28px] border border-black/5 bg-gradient-to-br ${tone.panel} p-5 shadow-[0_20px_50px_-45px_rgba(0,0,0,0.45)] ring-1 ${tone.panelRing} transition duration-200 hover:-translate-y-[2px] dark:border-white/10`}
                    >
                      {/* Header: badges + author pill */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                          {channelLabel ? (
                            channelSlug ? (
                              <FeedIntentLink
                                href={`/c/${channelSlug}`}
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${tone.badge}`}
                              >
                                {channelLabel}
                              </FeedIntentLink>
                            ) : (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${tone.badge}`}>
                                {channelLabel}
                              </span>
                            )
                          ) : null}
                          <span className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-white/70 px-2.5 py-1 text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            נשמר
                          </span>
                        </div>

                        {authorUsername ? (
                          <AuthorHover username={authorUsername}>
                            <Link
                              href={`/u/${authorUsername}`}
                              className="inline-flex shrink-0 max-w-[130px] items-center gap-1.5 rounded-full border border-black/8 bg-white/75 px-2 py-1 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
                            >
                              <Avatar src={post.author?.avatar_url} name={authorDisplay} size={26} />
                              <span className="truncate">{authorDisplay}</span>
                            </Link>
                          </AuthorHover>
                        ) : (
                          <div className="inline-flex shrink-0 max-w-[130px] items-center gap-1.5 rounded-full border border-black/8 bg-white/75 px-2 py-1 text-xs font-semibold text-neutral-800 dark:border-white/10 dark:bg-white/5 dark:text-foreground">
                            <Avatar src={post.author?.avatar_url} name={authorDisplay} size={26} />
                            <span className="truncate">{authorDisplay}</span>
                          </div>
                        )}
                      </div>

                      {/* Title — full width */}
                      <Link
                        href={`/post/${post.slug}`}
                        className="mt-3 block text-lg font-black leading-8 tracking-tight text-neutral-950 transition hover:opacity-80 dark:text-foreground"
                      >
                        {clampText(post.title ?? 'ללא כותרת', 96)}
                      </Link>

                      {/* Excerpt — dynamic height */}
                      {excerpt ? (
                        <p className="mt-2 text-sm leading-7 text-neutral-600 dark:text-muted-foreground">
                          {excerpt}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">פוסט ללא תקציר</p>
                      )}

                      {/* Footer */}
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/8 pt-3 dark:border-white/10">
                        <div className="text-xs text-neutral-500 dark:text-muted-foreground">
                          {publishedDate ? `פורסם ב־${publishedDate}` : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => { event.preventDefault(); void removeBookmark(row.post_id) }}
                            disabled={!!removingPostIds[row.post_id]}
                            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-black/10 bg-white/80 px-3 py-2 text-sm font-bold text-neutral-900 transition hover:-translate-y-[1px] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {removingPostIds[row.post_id] ? 'מסיר...' : 'הסר'}
                          </button>
                          <Link
                            href={`/post/${post.slug}`}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-black transition ${tone.cta}`}
                          >
                            <BookOpenText className="h-3.5 w-3.5" />
                            לקריאה
                          </Link>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>

              <PaginationBar />
            </>
          )}
        </section>
      </div>
    </main>
  )
}
