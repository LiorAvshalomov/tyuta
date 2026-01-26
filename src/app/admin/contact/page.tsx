'use client'

import { useEffect, useState } from 'react'
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

export default function AdminContactPage() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [active, setActive] = useState<any | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const r = await adminFetch(`/api/admin/contact?status=${status}&limit=200`)
      const j = await r.json()
      if (!r.ok) throw new Error(getErr(j, 'Failed'))
      setMessages(j.messages ?? [])
      if (active) {
        const refreshed = (j.messages ?? []).find((m: any) => m.id === active.id)
        setActive(refreshed ?? null)
      }
    } catch (e: any) {
      setErr(e?.message ?? 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  async function setResolved(id: string, next: 'open' | 'resolved') {
    const r = await adminFetch('/api/admin/contact/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: next }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      alert(getErr(j, 'שגיאה'))
      return
    }
    await load()
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-black">צור קשר</div>
          <div className="mt-1 text-sm text-muted-foreground">Inbox לפניות מהעמוד “צור קשר”.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatus('open')}
            className={
              'rounded-full px-3 py-1.5 text-sm font-bold transition ' +
              (status === 'open' ? 'bg-black text-white' : 'border border-black/10 bg-white/60 hover:bg-white')
            }
          >
            פתוחים
          </button>
          <button
            onClick={() => setStatus('resolved')}
            className={
              'rounded-full px-3 py-1.5 text-sm font-bold transition ' +
              (status === 'resolved' ? 'bg-black text-white' : 'border border-black/10 bg-white/60 hover:bg-white')
            }
          >
            טופלו
          </button>
          <button
            onClick={load}
            className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-sm font-bold hover:bg-white"
          >
            רענון
          </button>
        </div>
      </div>

      {err && <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_420px]">
        <div className="grid gap-2">
          {loading ? (
            <div className="rounded-3xl border border-black/5 bg-white/60 p-4 text-sm">טוען…</div>
          ) : messages.length === 0 ? (
            <div className="rounded-3xl border border-black/5 bg-white/60 p-4 text-sm text-muted-foreground">
              אין פניות בסטטוס הזה.
            </div>
          ) : (
            messages.map((m) => (
              <button
                key={m.id}
                onClick={() => setActive(m)}
                className={
                  'text-right rounded-3xl border border-black/5 p-3 shadow-sm transition ' +
                  (active?.id === m.id ? 'bg-white' : 'bg-white/60 hover:bg-white')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-muted-foreground">{fmtDateTime(m.created_at)}</div>
                    <div className="mt-1 text-sm font-black">{m.subject || 'ללא נושא'}</div>
                    <div className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{m.message}</div>
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl border border-black/5 bg-white/50 px-2 py-1">
                    <Avatar url={m.user_profile?.avatar_url} size={24} alt="" />
                    <div className="text-xs font-bold">{fmtName(m.user_profile, m.user_id)}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-3xl border border-black/5 bg-white/60 p-4">
          {!active ? (
            <div className="text-sm text-muted-foreground">בחר פנייה כדי לראות פירוט.</div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black">{active.subject || 'ללא נושא'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{fmtDateTime(active.created_at)}</div>
                </div>
                <div className="text-xs text-muted-foreground">סטטוס: <b>{active.status}</b></div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Avatar url={active.user_profile?.avatar_url} size={28} alt="" />
                <div className="text-sm font-black">{fmtName(active.user_profile, active.user_id)}</div>
              </div>
              {active.email && <div className="mt-1 text-xs text-muted-foreground">אימייל: {active.email}</div>}

              <div className="mt-3 rounded-2xl border border-black/5 bg-[#FAF9F6] p-3">
                <div className="text-xs font-bold text-muted-foreground">הודעה</div>
                <div className="mt-2 whitespace-pre-wrap text-sm">{active.message}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {active.status === 'open' ? (
                  <button
                    onClick={() => setResolved(active.id, 'resolved')}
                    className="rounded-full bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90"
                  >
                    סמן כטופל
                  </button>
                ) : (
                  <button
                    onClick={() => setResolved(active.id, 'open')}
                    className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-bold hover:bg-white"
                  >
                    החזר לפתוח
                  </button>
                )}
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                כרגע אין “שלח/י תשובה” אוטומטית — בהמשך נוסיף תגובה מערכתית (notification) או מייל לפי החלטה.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
