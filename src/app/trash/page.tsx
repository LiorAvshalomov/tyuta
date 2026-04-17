'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArchiveRestore, BookOpenText, Clock3, Eye, FileStack, NotebookPen, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'
import { buildLoginRedirect, shouldRunLoginRedirect } from '@/lib/auth/protectedRoutes'
import RichText, { type RichNode } from '@/components/RichText'

type TrashPostRow = {
  id: string
  slug: string
  title: string | null
  excerpt: string | null
  deleted_at: string | null
  updated_at: string | null
  created_at: string | null
  status: 'draft' | 'published'
  content_json: unknown
}

type TrashCachePayload = {
  rows: TrashPostRow[]
  savedAt: string
}

const TRASH_CACHE_PREFIX = 'tyuta:trash-cache:'
const TRASH_REFRESH_AFTER_MS = 60 * 1000

function cacheKeyForUser(userId: string) {
  return `${TRASH_CACHE_PREFIX}${userId}`
}

function daysLeft(deletedAt: string | null) {
  if (!deletedAt) return null
  const deletedMs = new Date(deletedAt).getTime()
  if (Number.isNaN(deletedMs)) return null
  const nowMs = Date.now()
  const diffDays = Math.floor((nowMs - deletedMs) / (1000 * 60 * 60 * 24))
  const left = 14 - diffDays
  return left < 0 ? 0 : left
}

function formatDateTime(iso: string | null) {
  if (!iso) return 'לא זמין'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'לא זמין'
  return date.toLocaleString('he-IL')
}

function clampText(value: string | null | undefined, max: number) {
  const text = (value ?? '').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text
}

function extractPlainText(node: unknown): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractPlainText).filter(Boolean).join('\n')
  if (typeof node !== 'object') return ''

  const item = node as { type?: string; text?: string; content?: unknown[] }
  const text = item.text ?? ''
  const children = Array.isArray(item.content) ? item.content.map(extractPlainText).filter(Boolean).join('\n') : ''
  const combined = [text, children].filter(Boolean).join('')

  if (!combined.trim()) return ''

  const needsSpacing = item.type && ['paragraph', 'heading', 'blockquote', 'listItem', 'bulletList', 'orderedList'].includes(item.type)
  return needsSpacing ? `${combined.trim()}\n\n` : combined
}

function normalizePreviewText(row: TrashPostRow) {
  const excerpt = (row.excerpt ?? '').trim()
  const content = extractPlainText(row.content_json).replace(/\n{3,}/g, '\n\n').trim()

  if (excerpt && content.startsWith(excerpt)) return content
  if (excerpt && content) return `${excerpt}\n\n${content}`
  return excerpt || content
}

function asRichContent(value: unknown): RichNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as RichNode
}

function readTrashCache(userId: string): TrashCachePayload | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(cacheKeyForUser(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as TrashCachePayload
    if (!Array.isArray(parsed.rows) || typeof parsed.savedAt !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function writeTrashCache(userId: string, rows: TrashPostRow[]) {
  if (typeof window === 'undefined') return

  try {
    const payload: TrashCachePayload = {
      rows,
      savedAt: new Date().toISOString(),
    }
    window.sessionStorage.setItem(cacheKeyForUser(userId), JSON.stringify(payload))
  } catch {
    // Cache is best-effort only.
  }
}

function statusTone(status: TrashPostRow['status']) {
  return status === 'published'
    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
    : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300'
}

function urgencyTone(left: number | null) {
  if (left == null) {
    return 'border-black/10 bg-white/70 text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-muted-foreground'
  }
  if (left <= 2) {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
  }
  if (left <= 5) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
}

async function authedFetch(input: string, init: RequestInit = {}) {
  const resolution = await waitForClientSession(4000)
  const token = resolution.status === 'authenticated' ? resolution.session.access_token : null
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

async function assertOk(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string
  }
  if (response.ok) return

  const message = typeof body.error === 'string'
    ? body.error
    : body.error?.message ?? 'Request failed'
  throw new Error(message)
}

function PreviewModal({
  row,
  onClose,
}: {
  row: TrashPostRow
  onClose: () => void
}) {
  const previewText = normalizePreviewText(row)
  const previewExcerpt = (row.excerpt ?? '').trim()
  const richContent = asRichContent(row.content_json)
  const left = daysLeft(row.deleted_at)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 py-6" dir="rtl">
      <button type="button" aria-label="סגור" className="absolute inset-0 cursor-default" onClick={onClose} />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-black/10 bg-[#fcfaf6] shadow-[0_35px_90px_-45px_rgba(0,0,0,0.6)] dark:border-white/10 dark:bg-[#191919]">
        <div className="flex items-start justify-between gap-4 border-b border-black/8 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusTone(row.status)}`}>
                {row.status === 'published' ? 'פורסם בעבר' : 'טיוטה'}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${urgencyTone(left)}`}>
                <Clock3 className="h-3 w-3" />
                {left == null ? 'זמן לא זמין' : left === 0 ? 'נמחק אוטומטית בקרוב' : `נותרו ${left} ימים`}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-neutral-950 dark:text-foreground">
              {(row.title ?? '').trim() || 'ללא כותרת'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/85 text-neutral-700 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {previewText ? (
            <div className="space-y-5">
              {previewExcerpt ? (
                <div className="rounded-[24px] border border-black/8 bg-white/80 px-5 py-4 text-sm leading-7 text-neutral-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-200">
                  {previewExcerpt}
                </div>
              ) : null}

              {richContent ? (
                <div className="rounded-[26px] border border-black/8 bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                  <RichText content={richContent} />
                </div>
              ) : (
                <div className="rounded-[26px] border border-black/8 bg-white/80 p-5 text-[15px] leading-8 text-neutral-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-200">
                  {previewText.split('\n').map((line, index) => (
                    <p key={`${index}-${line.slice(0, 24)}`} className={line.trim() ? '' : 'h-4'}>
                      {line.trim() || '\u00A0'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[26px] border border-dashed border-black/10 bg-white/70 p-6 text-sm text-neutral-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-muted-foreground">
              אין כרגע טקסט זמין לתצוגה מוקדמת עבור הפוסט הזה.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TrashPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<TrashPostRow[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)
  const [previewRow, setPreviewRow] = useState<TrashPostRow | null>(null)

  useEffect(() => {
    const run = async () => {
      const resolved = await waitForClientSession()
      if (resolved.status !== 'authenticated') {
        const loginTarget = buildLoginRedirect('/trash')
        if (shouldRunLoginRedirect(loginTarget)) {
          router.replace(loginTarget)
        }
        return
      }
      setUserId(resolved.user.id)
    }
    void run()
  }, [router])

  const load = useCallback(async (uid: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true

    if (!silent) setLoading(true)
    setErrorMsg(null)

    const { data, error } = await supabase
      .from('posts')
      .select('id, slug, title, excerpt, deleted_at, updated_at, created_at, status, content_json')
      .eq('author_id', uid)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (error) {
      setErrorMsg(error.message)
      if (!silent) setRows([])
      if (!silent) setLoading(false)
      return
    }

    const nextRows = (data ?? []) as TrashPostRow[]
    setRows(nextRows)
    setLastLoadedAt(new Date().toISOString())
    writeTrashCache(uid, nextRows)

    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    if (!userId) return

    const cached = readTrashCache(userId)
    if (cached) {
      setRows(cached.rows)
      setLastLoadedAt(cached.savedAt)
      setLoading(false)
    }

    void load(userId, { silent: Boolean(cached) })
  }, [userId, load])

  useEffect(() => {
    if (!userId) return

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const last = lastLoadedAt ? new Date(lastLoadedAt).getTime() : 0
      if (Date.now() - last < TRASH_REFRESH_AFTER_MS) return
      void load(userId, { silent: true })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [lastLoadedAt, load, userId])

  const emptyState = useMemo(() => !loading && rows.length === 0, [loading, rows.length])
  const deletedCountLabel = rows.length > 0 ? `${rows.length.toLocaleString('he-IL')} פוסטים כרגע` : 'סל המחזור שלך'

  const restore = useCallback(
    async (postId: string) => {
      if (!userId) return
      setBusyId(postId)
      setErrorMsg(null)

      try {
        const response = await authedFetch(`/api/posts/${postId}/restore`, { method: 'POST' })
        await assertOk(response)
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : 'Request failed')
        setBusyId(null)
        return
      }

      await load(userId, { silent: true })
      setBusyId(null)
    },
    [userId, load]
  )

  const restoreAll = useCallback(async () => {
    if (!userId) return
    if (rows.length === 0) return
    const ok = confirm('לשחזר את כל הפוסטים שמופיעים כאן?')
    if (!ok) return
    setBusyId('ALL_RESTORE')
    setErrorMsg(null)

    try {
      for (const row of rows) {
        const response = await authedFetch(`/api/posts/${row.id}/restore`, { method: 'POST' })
        await assertOk(response)
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Request failed')
      setBusyId(null)
      return
    }

    await load(userId, { silent: true })
    setBusyId(null)
  }, [userId, rows, load])

  const purge = useCallback(
    async (postId: string) => {
      if (!userId) return
      const ok = window.confirm('מחיקה לצמיתות? אי אפשר לשחזר אחרי זה.')
      if (!ok) return

      setBusyId(postId)
      setErrorMsg(null)

      try {
        const response = await authedFetch(`/api/posts/${postId}/purge`, { method: 'POST' })
        await assertOk(response)
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : 'Request failed')
        setBusyId(null)
        return
      }

      await load(userId, { silent: true })
      setBusyId(null)
    },
    [userId, load]
  )

  return (
    <main className="min-h-screen bg-[#f4f0e8] dark:bg-[#111111]" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="overflow-hidden rounded-[32px] border border-black/5 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.98),_rgba(246,239,228,0.96)_50%,_rgba(236,231,223,0.94)_100%)] p-5 shadow-[0_30px_80px_-55px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:border-white/8 dark:bg-[radial-gradient(circle_at_top_right,_rgba(42,42,42,0.98),_rgba(27,27,27,0.98)_52%,_rgba(18,18,18,1)_100%)] dark:ring-white/5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-bold text-neutral-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200">
                <FileStack className="h-3.5 w-3.5" />
                {deletedCountLabel}
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-neutral-950 dark:text-foreground sm:text-[2.35rem]">
                פוסטים שנמחקו
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void restoreAll()}
                disabled={rows.length === 0 || busyId === 'ALL_RESTORE'}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/85 px-4 py-2.5 text-sm font-bold text-neutral-900 transition hover:-translate-y-[1px] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
              >
                <ArchiveRestore className="h-4 w-4" />
                {busyId === 'ALL_RESTORE' ? 'משחזר...' : 'שחזר הכל'}
              </button>
              <Link
                href="/notebook"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/85 px-4 py-2.5 text-sm font-bold text-neutral-900 transition hover:-translate-y-[1px] hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
              >
                <NotebookPen className="h-4 w-4" />
                למחברת
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-black/8 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[11px] font-semibold text-neutral-500 dark:text-muted-foreground">משך השמירה</div>
              <div className="mt-1 text-sm font-black text-neutral-950 dark:text-foreground">14 ימים עד מחיקה אוטומטית</div>
            </div>
          </div>

          {errorMsg ? (
            <div className="mt-5 rounded-3xl border border-red-200/80 bg-red-50/95 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {errorMsg}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 grid gap-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-[#1b1b1a] dark:ring-white/5"
                >
                  <div className="animate-pulse space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="h-9 w-28 rounded-full bg-neutral-200 dark:bg-white/10" />
                      <div className="h-9 w-32 rounded-full bg-neutral-200 dark:bg-white/10" />
                    </div>
                    <div className="h-6 w-2/5 rounded-2xl bg-neutral-200 dark:bg-white/10" />
                    <div className="space-y-2">
                      <div className="h-4 w-full rounded-xl bg-neutral-100 dark:bg-white/5" />
                      <div className="h-4 w-10/12 rounded-xl bg-neutral-100 dark:bg-white/5" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-11 flex-1 rounded-2xl bg-neutral-200 dark:bg-white/10" />
                      <div className="h-11 flex-1 rounded-2xl bg-neutral-200 dark:bg-white/10" />
                      <div className="h-11 flex-1 rounded-2xl bg-neutral-200 dark:bg-white/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : emptyState ? (
            <div className="mt-6 rounded-[28px] border border-dashed border-black/10 bg-white/70 px-5 py-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black">
                <BookOpenText className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-black text-neutral-950 dark:text-foreground">אין כאן פוסטים כרגע</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-neutral-600 dark:text-muted-foreground">
                כשתמחקי פוסט זמנית, הוא יופיע כאן עם אפשרות שחזור ותצוגה מקדימה.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {rows.map((row) => {
                const left = daysLeft(row.deleted_at)
                const previewText = normalizePreviewText(row)
                const canPreview = Boolean(((row.title ?? '').trim() || previewText).trim())

                return (
                  <article
                    key={row.id}
                    className="overflow-hidden rounded-[28px] border border-black/5 bg-gradient-to-br from-white via-white to-neutral-100/85 p-5 shadow-[0_20px_50px_-45px_rgba(0,0,0,0.45)] ring-1 ring-black/5 dark:border-white/10 dark:bg-gradient-to-br dark:from-[#1f1f1f] dark:via-[#1a1a1a] dark:to-[#151515] dark:ring-white/5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusTone(row.status)}`}>
                            {row.status === 'published' ? 'פורסם בעבר' : 'טיוטה'}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${urgencyTone(left)}`}>
                            <Clock3 className="h-3 w-3" />
                            {left == null ? 'זמן לא זמין' : left === 0 ? 'המחיקה האוטומטית כבר כאן' : `נשארו ${left} ימים`}
                          </span>
                        </div>

                        <h2 className="mt-4 text-xl font-black tracking-tight text-neutral-950 dark:text-foreground">
                          {(row.title ?? '').trim() || 'ללא כותרת'}
                        </h2>

                        <div className="mt-3 min-h-[56px] text-sm leading-7 text-neutral-600 dark:text-muted-foreground">
                          {clampText(row.excerpt, 180) || clampText(previewText, 180) || 'אין תקציר זמין כרגע, אבל עדיין אפשר לפתוח תצוגה מקדימה נקייה של הטקסט אם הוא נשמר.'}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-[24px] border border-black/8 bg-white/75 px-4 py-3 text-xs text-neutral-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-muted-foreground">
                        <div>נמחק ב־{formatDateTime(row.deleted_at)}</div>
                        <div className="mt-1">עודכן לאחרונה ב־{formatDateTime(row.updated_at ?? row.created_at)}</div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2 border-t border-black/8 pt-4 sm:flex-row sm:flex-wrap dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => canPreview && setPreviewRow(row)}
                        disabled={!canPreview}
                        className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-sm font-black text-neutral-900 transition hover:-translate-y-[1px] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
                      >
                        <Eye className="h-4 w-4" />
                        צפייה
                      </button>

                      <button
                        type="button"
                        onClick={() => void restore(row.id)}
                        disabled={busyId === row.id}
                        className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-sm font-black text-neutral-900 transition hover:-translate-y-[1px] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
                      >
                        <ArchiveRestore className="h-4 w-4" />
                        {busyId === row.id ? 'משחזר...' : 'שחזור'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void purge(row.id)}
                        disabled={busyId === row.id}
                        className="inline-flex min-w-[154px] items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-[1px] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        מחיקה לצמיתות
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {previewRow ? <PreviewModal row={previewRow} onClose={() => setPreviewRow(null)} /> : null}
    </main>
  )
}
