'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'

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

function asCleanString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v).trim()
  // Supabase/PostgREST sometimes returns details/hint as objects.
  try {
    return JSON.stringify(v).trim()
  } catch {
    return String(v).trim()
  }
}

function formatErr(e: unknown): string {
  if (e && typeof e === 'object') {
    const se = e as SupabaseLikeError
    const msg = asCleanString(se.message)
    const details = asCleanString(se.details)
    const hint = asCleanString(se.hint)
    const code = asCleanString(se.code)

    // Sometimes Supabase/PostgREST errors have an empty message but include details/code.
    const parts = [msg, details, hint].filter(Boolean)
    const combined = parts.join(' — ')
    if (combined) return code ? `${combined} (${code})` : combined
    if (code) return `שגיאה מהשרת (${code})`
  }
  return e instanceof Error && e.message ? e.message : 'שגיאה לא ידועה'
}

function clampText(s: string | null | undefined, max: number) {
  const t = (s ?? '').trim()
  if (!t) return ''
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}

export default function SavedPostsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<SavedPostRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [pg, setPg] = useState<PaginationState>({ page: 0, pageSize: 8, total: 0 })
  const [userId, setUserId] = useState<string | null>(null)
  const [removingPostIds, setRemovingPostIds] = useState<Record<string, true>>({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        setErr(null)

        const { data: u } = await supabase.auth.getUser()
        if (!u.user) {
          if (alive) {
            setRows([])
            setErr('כדי לראות פוסטים שמורים צריך להתחבר.')
            setLoading(false)
          }
          return
        }

        if (alive) setUserId(u.user.id)

        const from = pg.page * pg.pageSize
        const to = from + pg.pageSize - 1

        const { data, error, count } = await supabase
          .from('post_bookmarks')
          .select(
            // IMPORTANT:
            // In our DB PostgREST needs explicit relationship names for embeds,
            // otherwise it may return 400 or silently omit nested objects.
            'created_at, post_id, post:posts!post_bookmarks_post_id_fkey(id, slug, title, excerpt, published_at, author:profiles!posts_author_id_fkey(username, display_name, avatar_url), channel:channels!posts_channel_id_fkey(slug, name_he))',
            { count: 'exact' }
          )
          .eq('user_id', u.user.id)
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
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [pg.page, pg.pageSize])

  const totalPages = Math.max(1, Math.ceil(pg.total / pg.pageSize))
  const canPrev = pg.page > 0
  const canNext = pg.page < totalPages - 1

  const removeBookmark = async (postId: string) => {
    if (!userId) {
      setErr('כדי להסיר פוסט מהשמורים צריך להתחבר.')
      return
    }
    // optimistic UI
    setRemovingPostIds((prev) => ({ ...prev, [postId]: true }))

    const prevRows = rows
    setRows((rws) => rws.filter((r) => r.post_id !== postId))
    setPg((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }))

    try {
      const { error } = await supabase
        .from('post_bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('post_id', postId)

      if (error) throw error

      // If we removed the last item on the page, go back one page.
      setPg((prev) => {
        const newTotalPages = Math.max(1, Math.ceil(prev.total / prev.pageSize))
        const safePage = Math.min(prev.page, newTotalPages - 1)
        return safePage === prev.page ? prev : { ...prev, page: safePage }
      })
    } catch (e: unknown) {
      // rollback
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
      <div className={`flex items-center justify-between gap-3 ${className}`}>
        <div className="text-xs text-neutral-500 dark:text-muted-foreground">
          עמוד {pg.page + 1} מתוך {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPg((prev) => ({ ...prev, page: prev.page - 1 }))}
            disabled={!canPrev}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-neutral-50 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-card dark:border-border dark:text-foreground dark:hover:bg-muted"
          >
            הקודם
          </button>
          <button
            type="button"
            onClick={() => setPg((prev) => ({ ...prev, page: prev.page + 1 }))}
            disabled={!canNext}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-neutral-50 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-card dark:border-border dark:text-foreground dark:hover:bg-muted"
          >
            הבא
          </button>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-background" dir="rtl">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-card dark:ring-white/5">
          <h1 className="text-2xl font-black tracking-tight text-neutral-950 dark:text-foreground">פוסטים שמורים</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-muted-foreground">הפוסטים ששמרת לקריאה מאוחרת.</p>

          {err ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
              {err}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 text-sm text-neutral-600 dark:text-muted-foreground">טוען…</div>
          ) : rows.length === 0 ? (
            <div className="mt-6 text-sm text-neutral-600 dark:text-muted-foreground">אין פוסטים שמורים עדיין.</div>
          ) : (
            <div className="mt-6">
              <PaginationBar className="mb-4" />

              <div className="grid gap-4 sm:grid-cols-2">
                {rows.map((r) => {
                  const p = r.post
                  if (!p) {
                    return (
                      <div
                        key={`${r.post_id}-${r.created_at}`}
                        className="rounded-2xl border border-neutral-200 bg-white p-4 dark:bg-card dark:border-border"
                      >
                        <div className="text-[15px] font-extrabold text-neutral-950 dark:text-foreground">פוסט לא זמין</div>
                        <div className="mt-1 text-sm text-neutral-600 dark:text-muted-foreground">
                          נראה שהפוסט שנשמר נמחק או שאינך מורשה לצפות בו.
                        </div>
                      </div>
                    )
                  }

                  const authorDisplay = p.author?.display_name ?? p.author?.username ?? 'משתמש'
                  const authorUsername = p.author?.username ?? null
                  const channelLabel = p.channel?.name_he ?? ''
                  const savedAt = new Date(r.created_at)

                  return (
                    <div
                      key={`${r.post_id}-${r.created_at}`}
                      className="group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:border-neutral-300 hover:shadow dark:bg-card dark:border-border dark:hover:border-border/70"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/post/${p.slug}`}
                            className="block text-[15px] font-extrabold text-neutral-950 underline-offset-4 hover:underline dark:text-foreground"
                          >
                            {clampText(p.title ?? 'ללא כותרת', 80)}
                          </Link>
                          {p.excerpt ? (
                            <div className="mt-2 text-sm leading-6 text-neutral-600 dark:text-muted-foreground">
                              {clampText(p.excerpt, 140)}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {authorUsername ? (
                            <Link
                              href={`/u/${authorUsername}`}
                              className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50 dark:bg-card dark:border-border dark:text-foreground dark:hover:bg-muted"
                            >
                              <Avatar src={p.author?.avatar_url} name={authorDisplay} size={32} />
                              <span className="max-w-[110px] truncate">{authorDisplay}</span>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-900 shadow-sm dark:bg-card dark:border-border dark:text-foreground">
                              <Avatar src={p.author?.avatar_url} name={authorDisplay} size={32} />
                              <span className="max-w-[110px] truncate">{authorDisplay}</span>
                            </div>
                          )}

                          {channelLabel ? (
                            <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-700 dark:bg-muted dark:border-border dark:text-muted-foreground">
                              {channelLabel}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-border dark:text-muted-foreground">
                        <div className="truncate">נשמר · {savedAt.toLocaleDateString('he-IL')}</div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              void removeBookmark(r.post_id)
                            }}
                            disabled={!!removingPostIds[r.post_id]}
                            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-900 shadow-sm transition hover:translate-y-[1px] hover:bg-neutral-50 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card dark:border-border dark:text-foreground dark:hover:bg-muted"
                          >
                            הסר
                          </button>

                          <Link
                            href={`/post/${p.slug}`}
                            className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-bold text-white transition hover:translate-y-[1px] hover:bg-neutral-800 active:translate-y-0"
                          >
                            לקריאה
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <PaginationBar className="mt-6" />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
