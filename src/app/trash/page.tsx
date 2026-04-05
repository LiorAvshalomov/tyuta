'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'
import { buildLoginRedirect } from '@/lib/auth/protectedRoutes'

type TrashPostRow = {
  id: string
  slug: string
  title: string | null
  excerpt: string | null
  deleted_at: string | null
  updated_at: string | null
  created_at: string | null
  status: 'draft' | 'published'
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

export default function TrashPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<TrashPostRow[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      const resolved = await waitForClientSession()
      if (resolved.status !== 'authenticated') {
        router.replace(buildLoginRedirect('/trash'))
        return
      }
      setUserId(resolved.user.id)
    }
    void run()
  }, [router])

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    setErrorMsg(null)

    const { data, error } = await supabase
      .from('posts')
      .select('id, slug, title, excerpt, deleted_at, updated_at, created_at, status')
      .eq('author_id', uid)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (error) {
      setErrorMsg(error.message)
      setRows([])
      setLoading(false)
      return
    }

    setRows((data ?? []) as TrashPostRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!userId) return
    void load(userId)
  }, [userId, load])

  const emptyState = useMemo(() => !loading && rows.length === 0, [loading, rows.length])

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

      await load(userId)
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

    await load(userId)
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

      await load(userId)
      setBusyId(null)
    },
    [userId, load]
  )

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-background" dir="rtl">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">פוסטים שנמחקו</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              כאן מופיעים פוסטים שנמחקו (סופט דיליט). אפשר לשחזר או למחוק לצמיתות.
              <br />
              פוסטים שלא משוחזרים נמחקים אוטומטית אחרי <span className="font-bold">14 יום</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void restoreAll()}
              disabled={rows.length === 0 || busyId === 'ALL_RESTORE'}
              className="rounded-full border bg-white px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:bg-card dark:border-border dark:hover:bg-muted"
            >
              שחזר הכל
            </button>
            <Link href="/notebook" className="rounded-full border bg-white px-4 py-2 text-sm hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted">
              למחברת
            </Link>
          </div>
        </header>

        {errorMsg ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">{errorMsg}</div>
        ) : null}

        {loading ? (
          <div className="text-sm text-muted-foreground">טוען...</div>
        ) : emptyState ? (
          <div className="rounded-3xl border bg-white p-6 text-sm text-muted-foreground dark:bg-card dark:border-border">אין פוסטים שנמחקו.</div>
        ) : (
          <div className="grid gap-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-3xl border bg-white p-4 shadow-sm dark:bg-card dark:border-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{(r.title ?? '').trim() || 'ללא כותרת'}</div>
                    {r.excerpt ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.excerpt}</div> : null}
                    <div className="mt-2 text-xs text-muted-foreground">
                      נמחק: {r.deleted_at ? new Date(r.deleted_at).toLocaleString('he-IL') : '-'}
                      {(() => {
                        const left = daysLeft(r.deleted_at)
                        if (left == null) return null
                        return (
                          <div className="mt-1">
                            נשארו <span className="font-bold">{left}</span> ימים למחיקה אוטומטית
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.slug ? (
                      <Link
                        href={`/post/${r.slug}`}
                        className="rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted"
                      >
                        צפייה
                      </Link>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void restore(r.id)}
                      disabled={busyId === r.id}
                      className="rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-60 dark:bg-card dark:border-border dark:hover:bg-muted"
                    >
                      שחזור
                    </button>

                    <button
                      type="button"
                      onClick={() => void purge(r.id)}
                      disabled={busyId === r.id}
                      className="rounded-full bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      מחיקה לצמיתות
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
