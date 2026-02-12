'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import PageHeader from '@/components/admin/PageHeader'
import FilterTabs from '@/components/admin/FilterTabs'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import { FileText, Search, RefreshCw, Trash2, RotateCcw, ExternalLink, MoreHorizontal } from 'lucide-react'

type AuthorProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type PostRow = {
  id: string
  author_id: string
  title: string | null
  slug: string | null
  status: string | null
  created_at: string | null
  published_at: string | null
  deleted_at: string | null
  deleted_reason: string | null
  moderated_at: string | null
  moderated_reason: string | null
  author?: AuthorProfile | null
}

function fmtName(p: AuthorProfile | null | undefined, fallbackId?: string) {
  if (!p) return fallbackId ? fallbackId.slice(0, 8) : '—'
  return p.display_name || (p.username ? `@${p.username}` : p.id.slice(0, 8))
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

function getAuthor(p: PostRow): AuthorProfile | null {
  return p.author ?? null
}

function authorLabel(p: PostRow): string {
  const a = getAuthor(p)
  return fmtName(a, p.author_id)
}

type FilterVal = 'all' | 'active' | 'deleted' | 'published' | 'draft'

const FILTER_OPTIONS: { value: FilterVal; label: string }[] = [
  { value: 'active', label: 'פעילים' },
  { value: 'published', label: 'פורסמו' },
  { value: 'draft', label: 'טיוטות' },
  { value: 'deleted', label: 'נמחקו' },
  { value: 'all', label: 'הכל' },
]

export default function AdminPostsPage() {
  const [filter, setFilter] = useState<FilterVal>('active')
  const [q, setQ] = useState('')
  const [posts, setPosts] = useState<PostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [modal, setModal] = useState<{ post: PostRow; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Mobile action menu
  const [mobileMenu, setMobileMenu] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const url = `/api/admin/posts?filter=${filter}&limit=200&q=${encodeURIComponent(q.trim())}`
      const r = await adminFetch(url)
      const j: unknown = await r.json()
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'Failed'))
      const rec = (j && typeof j === 'object') ? (j as Record<string, unknown>) : null
      const arr = rec && Array.isArray(rec['posts']) ? (rec['posts'] as unknown[]) : []
      setPosts(arr as PostRow[])
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const canSubmitDelete = useMemo(() => {
    const r = modal?.reason?.trim() ?? ''
    return r.length >= 3 && !busy
  }, [modal?.reason, busy])

  const isAlreadyRemoved = useMemo(() => {
    const p = modal?.post
    return Boolean(p && (p.deleted_at || p.moderated_at || p.status === 'moderated'))
  }, [modal?.post])

  async function doSoftDelete() {
    if (!modal) return
    setBusy(true)
    try {
      const r = await adminFetch('/api/admin/posts/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post_id: modal.post.id, reason: modal.reason }),
      })
      const j: unknown = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה'))
      setModal(null)
      await load()
      alert('הפוסט הוסתר ע״י אדמין (לא נכנס ל־Trash של המשתמש) ונשלחה התראה לבעל הפוסט.')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function doHardDelete() {
    if (!modal) return
    const ok = confirm('מחיקה לצמיתות של הפוסט וכל התוכן הקשור (תגובות/לייקים וכו׳). בלתי הפיך.\n\nלהמשיך?')
    if (!ok) return
    setBusy(true)
    try {
      const r = await adminFetch('/api/admin/posts/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post_id: modal.post.id, reason: modal.reason }),
      })
      const j: unknown = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה'))
      setModal(null)
      await load()
      alert('הפוסט נמחק לצמיתות.')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function doRestore(postId: string) {
    const ok = confirm('לשחזר את הפוסט?')
    if (!ok) return
    const r = await adminFetch('/api/admin/posts/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ post_id: postId }),
    })
    const j: unknown = await r.json().catch(() => ({}))
    if (!r.ok) {
      alert(getAdminErrorMessage(j, 'שגיאה'))
      return
    }
    await load()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="פוסטים"
        description="ניהול פוסטים (soft delete + סיבה + התראה)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חפש לפי כותרת / slug"
                className="w-[200px] rounded-lg border border-neutral-200 bg-white py-2 pr-8 pl-3 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
              />
            </div>
            <button
              type="button"
              onClick={load}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
              aria-label="חפש / רענן"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      <FilterTabs value={filter} onChange={setFilter} options={FILTER_OPTIONS} />

      {err && <ErrorBanner message={err} onRetry={load} />}

      {loading ? (
        <TableSkeleton rows={5} />
      ) : posts.length === 0 ? (
        <EmptyState
          title="אין פוסטים בתצוגה הזאת"
          icon={<FileText size={36} strokeWidth={1.5} />}
        />
      ) : (
        <div className="grid gap-2">
          {posts.map((p) => {
            const isRemoved = Boolean(p.deleted_at || p.moderated_at || p.status === 'moderated')
            return (
              <div
                key={p.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900">
                        {p.title || '(ללא כותרת)'}
                      </span>
                      {p.deleted_at ? (
                        <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          נמחק (משתמש)
                        </span>
                      ) : p.moderated_at || p.status === 'moderated' ? (
                        <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          נמחק זמנית (אדמין)
                        </span>
                      ) : p.status === 'published' ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          פורסם
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                          טיוטה
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">
                      נוצר: {fmtDateTime(p.created_at)} · פורסם: {fmtDateTime(p.published_at)}
                    </div>

                    {p.deleted_at && p.deleted_reason ? (
                      <div className="mt-2 rounded-lg bg-neutral-50 p-2 text-xs whitespace-pre-wrap text-neutral-600">
                        <b>סיבת מחיקה:</b> {p.deleted_reason}
                      </div>
                    ) : null}

                    {(p.moderated_at || p.status === 'moderated') && p.moderated_reason ? (
                      <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs whitespace-pre-wrap text-red-700">
                        <b>סיבת מחיקה (אדמין):</b> {p.moderated_reason}
                      </div>
                    ) : null}
                  </div>

                  {/* Desktop actions */}
                  <div className="hidden items-center gap-2 sm:flex">
                    <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
                      <Avatar src={getAuthor(p)?.avatar_url} name={authorLabel(p)} size={24} />
                      <span className="text-xs font-medium text-neutral-700">{authorLabel(p)}</span>
                    </div>

                    {!isRemoved && p.slug && (
                      <Link
                        href={`/post/${p.slug}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        <ExternalLink size={12} />
                        פתח
                      </Link>
                    )}

                    {!isRemoved ? (
                      <button
                        type="button"
                        onClick={() => setModal({ post: p, reason: '' })}
                        className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                      >
                        <Trash2 size={12} />
                        מחק
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => doRestore(p.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          <RotateCcw size={12} />
                          שחזר
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ post: p, reason: '' })}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                        >
                          <Trash2 size={12} />
                          לצמיתות
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Mobile actions dropdown */}
                  <div className="relative sm:hidden">
                    <button
                      type="button"
                      onClick={() => setMobileMenu(mobileMenu === p.id ? null : p.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {mobileMenu === p.id && (
                      <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                        {!isRemoved && p.slug && (
                          <Link
                            href={`/post/${p.slug}`}
                            className="block w-full px-3 py-2 text-right text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                            onClick={() => setMobileMenu(null)}
                          >
                            פתח פוסט
                          </Link>
                        )}
                        {!isRemoved ? (
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-right text-xs font-medium text-red-600 hover:bg-red-50"
                            onClick={() => { setModal({ post: p, reason: '' }); setMobileMenu(null) }}
                          >
                            מחק
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-right text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                              onClick={() => { doRestore(p.id); setMobileMenu(null) }}
                            >
                              שחזר
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-right text-xs font-medium text-red-600 hover:bg-red-50"
                              onClick={() => { setModal({ post: p, reason: '' }); setMobileMenu(null) }}
                            >
                              מחק לצמיתות
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Author on mobile */}
                <div className="mt-2 flex items-center gap-2 sm:hidden">
                  <Avatar src={getAuthor(p)?.avatar_url} name={authorLabel(p)} size={20} />
                  <span className="text-xs text-neutral-500">{authorLabel(p)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !busy && setModal(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">מחיקת פוסט</h2>
            <p className="mt-1 text-sm text-neutral-500">
              המחיקה הזמנית היא הסתרה ע"י אדמין (לא נכנס ל־Trash של המשתמש). בעל הפוסט יקבל התראה.
            </p>

            <div className="mt-4 rounded-lg bg-neutral-50 p-3">
              <div className="text-sm font-semibold text-neutral-900">{modal.post.title || '(ללא כותרת)'}</div>
              <div className="mt-0.5 text-xs text-neutral-400">{modal.post.id}</div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                סיבה למחיקה (חובה)
              </label>
              <textarea
                value={modal.reason}
                onChange={(e) => setModal({ ...modal, reason: e.target.value })}
                placeholder="לדוגמה: שפה פוגענית / ספאם / הפרת כללים..."
                className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                rows={4}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                disabled={busy}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={doSoftDelete}
                className={
                  'rounded-lg px-4 py-2 text-sm font-medium text-white ' +
                  (!canSubmitDelete || isAlreadyRemoved
                    ? 'cursor-not-allowed bg-neutral-300'
                    : 'bg-neutral-900 hover:bg-neutral-800')
                }
                disabled={!canSubmitDelete || isAlreadyRemoved}
              >
                מחק זמנית
              </button>
              <button
                type="button"
                disabled={!canSubmitDelete || isAlreadyRemoved}
                onClick={doHardDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                מחיקה לצמיתות
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
