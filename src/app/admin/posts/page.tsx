'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'

function getErr(j: any, fallback: string) {
  return j?.error?.message ?? j?.error ?? fallback
}

function fmtName(p: any, fallbackId?: string) {
  if (!p) return fallbackId ? fallbackId.slice(0, 8) : '—'
  return p.display_name || (p.username ? `@${p.username}` : p.id?.slice(0, 8) || '—')
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminPostsPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'deleted' | 'published' | 'draft'>('active')
  const [q, setQ] = useState('')
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [modal, setModal] = useState<{ post: any; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const url = `/api/admin/posts?filter=${filter}&limit=200&q=${encodeURIComponent(q.trim())}`
      const r = await adminFetch(url)
      const j = await r.json()
      if (!r.ok) throw new Error(getErr(j, 'Failed'))
      setPosts(j.posts ?? [])
    } catch (e: any) {
      setErr(e?.message ?? 'שגיאה')
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

  async function doDelete() {
    if (!modal) return
    setBusy(true)
    try {
      const r = await adminFetch('/api/admin/posts/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post_id: modal.post.id, reason: modal.reason }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getErr(j, 'שגיאה'))
      setModal(null)
      await load()
      alert('הפוסט נמחק (soft delete) ונשלחה התראה לבעל הפוסט.')
    } catch (e: any) {
      alert(e?.message ?? 'שגיאה')
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
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      alert(getErr(j, 'שגיאה'))
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
          posts.map((p) => (
            <div key={p.id} className="rounded-3xl border border-black/5 bg-white/60 p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-black">{p.title || '(ללא כותרת)'}</div>
                    {p.deleted_at ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                        נמחק
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
                  {p.deleted_at && (
                    <div className="mt-2 rounded-2xl border border-black/5 bg-[#FAF9F6] p-2 text-xs whitespace-pre-wrap">
                      <b>סיבת מחיקה:</b> {p.deleted_reason || '—'}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-2xl border border-black/5 bg-white/50 px-2 py-1">
                    <Avatar url={p.author_profile?.avatar_url} size={24} alt="" />
                    <div className="text-xs font-bold">{fmtName(p.author_profile, p.author_id)}</div>
                  </div>

                  {!p.deleted_at && p.slug && (
                    <Link
                      href={`/post/${p.slug}`}
                      className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-xs font-bold hover:bg-white"
                    >
                      פתח פוסט
                    </Link>
                  )}

                  {!p.deleted_at ? (
                    <button
                      onClick={() => setModal({ post: p, reason: '' })}
                      className="rounded-full bg-black px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    >
                      מחק
                    </button>
                  ) : (
                    <button
                      onClick={() => doRestore(p.id)}
                      className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-xs font-bold hover:bg-white"
                    >
                      שחזר
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-3xl border border-black/10 bg-white p-4 shadow-xl">
            <div className="text-lg font-black">מחיקת פוסט</div>
            <div className="mt-1 text-sm text-muted-foreground">
              המחיקה היא soft delete. בעל הפוסט יקבל התראה: “המערכת מחקה לך את הפוסט” + סיבה.
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
                onClick={doDelete}
                className={
                  'rounded-full px-4 py-2 text-sm font-bold text-white ' +
                  (canSubmitDelete ? 'bg-black hover:opacity-90' : 'bg-black/30 cursor-not-allowed')
                }
                disabled={!canSubmitDelete}
              >
                מחק עכשיו
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
