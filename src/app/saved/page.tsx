'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bookmark, BookOpenText, Clock3, ExternalLink, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'
import Avatar from '@/components/Avatar'
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

const DEFAULT_TONE: ChannelTone = {
  badge: 'border-neutral-200 bg-white/80 text-neutral-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200',
  panel: 'from-white via-neutral-50 to-neutral-100 dark:from-[#1f1f1f] dark:via-[#1b1b1b] dark:to-[#171717]',
  panelRing: 'ring-black/5 dark:ring-white/8',
  icon: 'bg-neutral-900 text-white dark:bg-white dark:text-black',
  cta: 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-100',
}

function getChannelTone(channelName: string | null, channelSlug: string | null): ChannelTone {
  const normalizedSlug = (channelSlug ?? '').trim()
  const normalizedName = (channelName ?? '').trim()

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

  return DEFAULT_TONE
}

function asCleanString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v).trim()
  try {
    return JSON.stringify(v).trim()
  } catch {
    return String(v).trim()
  }
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
    const parts = [msg, details, hint].filter(Boolean)
    const combined = parts.join(' — ')
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

function SavedSkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-[#1b1b1a] dark:ring-white/5">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="h-9 w-32 rounded-full bg-neutral-200 dark:bg-white/10" />
          <div className="h-9 w-28 rounded-full bg-neutral-200 dark:bg-white/10" />
        </div>
        <div className="h-6 w-3/4 rounded-2xl bg-neutral-200 dark:bg-white/10" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded-xl bg-neutral-100 dark:bg-white/5" />
          <div className="h-4 w-11/12 rounded-xl bg-neutral-100 dark:bg-white/5" />
          <div className="h-4 w-8/12 rounded-xl bg-neutral-100 dark:bg-white/5" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 flex-1 rounded-2xl bg-neutral-200 dark:bg-white/10" />
          <div className="h-10 w-28 rounded-2xl bg-neutral-200 dark:bg-white/10" />
        </div>
      </div>
    </div>
  )
}

export default function SavedPostsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<SavedPostRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [pg, setPg] = useState<PaginationState>({ page: 0, pageSize: 8, total: 0 })
  const [userId, setUserId] = useState<string | null>(null)
  const [removingPostIds, setRemovingPostIds] = useState<Record<string, true>>({})
  const [authRefreshKey, setAuthRefreshKey] = useState(0)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') return
      setAuthRefreshKey((prev) => prev + 1)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      let keepLoading = false
      try {
        setLoading(true)
        setErr(null)

        const resolution = await waitForClientSession(5000)
        if (resolution.status === 'timeout') {
          keepLoading = true
          return
        }
        if (resolution.status !== 'authenticated') {
          if (alive) {
            setUserId(null)
            setRows([])
            setErr('כדי לצפות בפוסטים השמורים יש להתחבר.')
            setLoading(false)
          }
          return
        }

        if (alive) setUserId(resolution.user.id)

        const from = pg.page * pg.pageSize
        const to = from + pg.pageSize - 1

        const { data, error, count } = await supabase
          .from('post_bookmarks')
          .select(
            'created_at, post_id, post:posts!post_bookmarks_post_id_fkey(id, slug, title, excerpt, published_at, author:profiles!posts_author_id_fkey(username, display_name, avatar_url), channel:channels!posts_channel_id_fkey(slug, name_he))',
            { count: 'exact' }
          )
          .eq('user_id', resolution.user.id)
          .order('created_at', { ascending: false })
          .range(from, to)

        if (error) throw error
        if (alive) {
          setRows((data ?? []) as unknown as SavedPostRow[])
          setPg((prev) => ({ ...prev, total: typeof count === 'number' ? count : prev.total }))
        }
      } catch (e: unknown) {
        if (alive) setErr(formatErr(e))
      } finally {
        if (alive && !keepLoading) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [authRefreshKey, pg.page, pg.pageSize])

  const totalPages = Math.max(1, Math.ceil(pg.total / pg.pageSize))
  const canPrev = pg.page > 0
  const canNext = pg.page < totalPages - 1
  const savedCountLabel = rows.length > 0 ? `${pg.total.toLocaleString('he-IL')} שמורים` : 'רשימת הקריאה שלך'

  const removeBookmark = async (postId: string) => {
    if (!userId) {
      setErr('כדי להסיר פוסט מהרשימה יש להתחבר.')
      return
    }

    setRemovingPostIds((prev) => ({ ...prev, [postId]: true }))

    const prevRows = rows
    setRows((current) => current.filter((row) => row.post_id !== postId))
    setPg((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }))

    try {
      const { error } = await supabase
        .from('post_bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('post_id', postId)

      if (error) throw error

      setPg((prev) => {
        const newTotalPages = Math.max(1, Math.ceil(prev.total / prev.pageSize))
        const safePage = Math.min(prev.page, newTotalPages - 1)
        return safePage === prev.page ? prev : { ...prev, page: safePage }
      })
    } catch (e: unknown) {
      setRows(prevRows)
      setPg((prev) => ({ ...prev, total: prev.total + 1 }))
      setErr(formatErr(e))
    } finally {
      setRemovingPostIds((prev) => {
        const next = { ...prev }
        delete next[postId]
        return next
      })
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
    <main className="min-h-screen bg-[#f5f1ea] dark:bg-[#111111]" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="overflow-hidden rounded-[32px] border border-black/5 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.98),_rgba(246,240,229,0.96)_48%,_rgba(236,231,223,0.94)_100%)] p-5 shadow-[0_30px_80px_-55px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:border-white/8 dark:bg-[radial-gradient(circle_at_top_right,_rgba(42,42,42,0.98),_rgba(27,27,27,0.98)_52%,_rgba(18,18,18,1)_100%)] dark:ring-white/5 sm:p-7">
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
            <div className="mt-5 rounded-3xl border border-red-200/80 bg-red-50/95 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {err}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <SavedSkeletonCard />
              <SavedSkeletonCard />
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-6 rounded-[28px] border border-dashed border-black/10 bg-white/70 px-5 py-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black">
                <BookOpenText className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-black text-neutral-950 dark:text-foreground">אין פוסטים שמורים עדיין</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-neutral-600 dark:text-muted-foreground">
                כשתשמרי פוסטים, הם יחכו לך כאן לקריאה רגועה ומאורגנת.
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <PaginationBar className="mb-4" />

              <div className="grid gap-4 lg:grid-cols-2">
                {rows.map((row) => {
                  const post = row.post

                  if (!post) {
                    return (
                      <div
                        key={`${row.post_id}-${row.created_at}`}
                        className="overflow-hidden rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-[#1b1b1a] dark:ring-white/5"
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
                  const savedDate = formatDate(row.created_at)
                  const publishedDate = formatDate(post.published_at)
                  const excerpt = clampText(post.excerpt, 180)

                  return (
                    <article
                      key={`${row.post_id}-${row.created_at}`}
                      className={`group overflow-hidden rounded-[28px] border border-black/5 bg-gradient-to-br ${tone.panel} p-5 shadow-[0_20px_50px_-45px_rgba(0,0,0,0.45)] ring-1 ${tone.panelRing} transition duration-200 hover:-translate-y-[2px] dark:border-white/10`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                            {channelLabel ? (
                              channelSlug ? (
                                <FeedIntentLink
                                  href={`/c/${channelSlug}`}
                                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${tone.badge}`}
                                >
                                  <span>{channelLabel}</span>
                                </FeedIntentLink>
                              ) : (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${tone.badge}`}>
                                  {channelLabel}
                                </span>
                              )
                            ) : null}

                            {savedDate ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-white/70 px-3 py-1 text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-muted-foreground">
                                <Clock3 className="h-3 w-3" />
                                נשמר ב־{savedDate}
                              </span>
                            ) : null}
                          </div>

                          <Link
                            href={`/post/${post.slug}`}
                            className="mt-4 block text-lg font-black leading-8 tracking-tight text-neutral-950 transition hover:opacity-80 dark:text-foreground"
                          >
                            {clampText(post.title ?? 'ללא כותרת', 96)}
                          </Link>

                          <div className="mt-3 min-h-[88px] text-sm leading-7 text-neutral-600 dark:text-muted-foreground">
                            {excerpt || 'פוסט ללא תקציר. שמור כאן לקריאה חוזרת כשתרצי לחזור אליו.'}
                          </div>
                        </div>

                        <div className="shrink-0 sm:self-start">
                          {authorUsername ? (
                            <Link
                              href={`/u/${authorUsername}`}
                              className="inline-flex max-w-[152px] items-center gap-2 rounded-full border border-black/8 bg-white/75 px-2.5 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
                            >
                              <Avatar src={post.author?.avatar_url} name={authorDisplay} size={34} />
                              <span className="truncate">{authorDisplay}</span>
                            </Link>
                          ) : (
                            <div className="inline-flex max-w-[152px] items-center gap-2 rounded-full border border-black/8 bg-white/75 px-2.5 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-foreground">
                              <Avatar src={post.author?.avatar_url} name={authorDisplay} size={34} />
                              <span className="truncate">{authorDisplay}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-4 text-xs text-neutral-500 dark:border-white/10 dark:text-muted-foreground">
                        <div className="space-y-1">
                          <div className="font-semibold text-neutral-700 dark:text-neutral-200">מוכן לחזרה מהירה</div>
                          <div>{publishedDate ? `פורסם ב־${publishedDate}` : 'טיוטה שפורסמה בהמשך תופיע כאן עם הפרטים המעודכנים'}</div>
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                          <Link
                            href={`/post/${post.slug}`}
                            className={`inline-flex min-w-[124px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${tone.cta}`}
                          >
                            <BookOpenText className="h-4 w-4" />
                            לקריאה
                          </Link>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault()
                              void removeBookmark(row.post_id)
                            }}
                            disabled={!!removingPostIds[row.post_id]}
                            className="inline-flex min-w-[110px] items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-sm font-bold text-neutral-900 transition hover:-translate-y-[1px] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
                          >
                            <Trash2 className="h-4 w-4" />
                            {removingPostIds[row.post_id] ? 'מסיר...' : 'הסר'}
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>

              <PaginationBar className="mt-6" />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
