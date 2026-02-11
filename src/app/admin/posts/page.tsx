'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'

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
export default function AdminPostsPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'deleted' | 'published' | 'draft'>('active')
  const [q, setQ] = useState('')
  const [posts, setPosts] = useState<PostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [modal, setModal] = useState<{ post: PostRow; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)

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
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-black">פוסטים</div>
          <div className="mt-1 text-sm text-muted-foreground">ניהול פוסטים (soft delete + סיבה + התראה).</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חפש לפי כותרת / slug"
            className="w-[220px] rounded-full border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none backdrop-blur"
          />
          <button
            onClick={load}
            className="rounded-full border border-black/10 bg-white/60 px-3 py-2 text-sm font-bold hover:bg-white"
          >
            חפש/רענן
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ['active', 'פעילים'],
            ['published', 'פורסמו'],
            ['draft', 'טיוטות'],
            ['deleted', 'נמחקו'],
            ['all', 'הכל'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={
              'rounded-full px-3 py-1.5 text-sm font-bold transition ' +
              (filter === k ? 'bg-black text-white' : 'border border-black/10 bg-white/60 hover:bg-white')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {err && <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="mt-4 grid gap-2">
        {loading ? (
          <div className="rounded-3xl border border-black/5 bg-white/60 p-4 text-sm">טוען…</div>
        ) : posts.length === 0 ? (
          <div className="rounded-3xl border border-black/5 bg-white/60 p-4 text-sm text-muted-foreground">
            אין פוסטים בתצוגה הזאת.
          </div>
        ) : (
          posts.map((p) => {
            const isRemoved = Boolean(p.deleted_at || p.moderated_at || p.status === 'moderated')
            return (
            <div key={p.id} className="rounded-3xl border border-black/5 bg-white/60 p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-black">{p.title || '(ללא כותרת)'}</div>
                    {p.deleted_at ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                        נמחק (משתמש)
                      </span>
                    ) : p.moderated_at || p.status === 'moderated' ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                        נמחק זמנית (אדמין)
                      </span>
                    ) : p.status === 'published' ? (
                      <span className="rounded-full border border-black/10 bg-[#FAF9F6] px-2 py-0.5 text-xs font-bold">
                        פורסם
                      </span>
                    ) : (
                      <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-xs font-bold">
                        טיוטה
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    created: {fmtDateTime(p.created_at)} · published: {fmtDateTime(p.published_at)}
                  </div>
                  {p.deleted_at && p.deleted_reason ? (
                    <div className="mt-2 rounded-2xl border border-black/5 bg-[#FAF9F6] p-2 text-xs whitespace-pre-wrap">
                      <b>סיבת מחיקה:</b> {p.deleted_reason}
                    </div>
                  ) : null}

                  {(p.moderated_at || p.status === 'moderated') && p.moderated_reason ? (
                    <div className="mt-2 rounded-2xl border border-red-200 bg-red-50/60 p-2 text-xs whitespace-pre-wrap">
                      <b>סיבת מחיקה (אדמין):</b> {p.moderated_reason}
                    </div>
                  ) : null}
                </div>
            
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-2xl border border-black/5 bg-white/50 px-2 py-1">
                    <Avatar src={getAuthor(p)?.avatar_url} name={authorLabel(p)} size={24} />
                    <div className="text-xs font-bold">{authorLabel(p)}</div>
                  </div>
            
                  {!isRemoved && p.slug && (
                    <Link
                      href={`/post/${p.slug}`}
                      className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-xs font-bold hover:bg-white"
                    >
                      פתח פוסט
                    </Link>
                  )}
            
                  {!isRemoved ? (
                    <button
                      onClick={() => setModal({ post: p, reason: '' })}
                      className="rounded-full bg-black px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    >
                      מחק
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => doRestore(p.id)}
                        className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-xs font-bold hover:bg-white"
                      >
                        שחזר
                      </button>
                      <button
                        onClick={() => setModal({ post: p, reason: '' })}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        מחק לצמיתות
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )
          })
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-3xl border border-black/10 bg-white p-4 shadow-xl">
            <div className="text-lg font-black">מחיקת פוסט</div>
            <div className="mt-1 text-sm text-muted-foreground">
              המחיקה הזמנית היא הסתרה ע"י אדמין (לא נכנס ל־Trash של המשתמש). בעל הפוסט יקבל התראה: “המערכת מחקה לך את הפוסט” + סיבה.
            </div>

            <div className="mt-3 rounded-2xl border border-black/5 bg-[#FAF9F6] p-3">
              <div className="text-sm font-black">{modal.post.title || '(ללא כותרת)'}</div>
              <div className="mt-1 text-xs text-muted-foreground">{modal.post.id}</div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-bold text-muted-foreground">סיבה למחיקה (חובה)</div>
              <textarea
                value={modal.reason}
                onChange={(e) => setModal({ ...modal, reason: e.target.value })}
                placeholder="לדוגמה: שפה פוגענית / ספאם / הפרת כללים…"
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm outline-none"
                rows={4}
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-bold hover:bg-white"
                disabled={busy}
              >
                ביטול
              </button>
              <button
                onClick={doSoftDelete}
                className={
                  'rounded-full px-4 py-2 text-sm font-bold text-white ' +
                  (!canSubmitDelete || isAlreadyRemoved ? 'bg-black/30 cursor-not-allowed' : 'bg-black hover:opacity-90')
                }
                disabled={!canSubmitDelete || isAlreadyRemoved}
              >
                מחק זמנית
              </button>
                  <button
                    disabled={!canSubmitDelete || isAlreadyRemoved}
                    onClick={doHardDelete}
                    className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
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