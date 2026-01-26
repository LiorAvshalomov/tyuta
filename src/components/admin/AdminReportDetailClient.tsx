'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'

type MiniProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

type Report = {
  id: string
  created_at: string
  category: string
  details: string | null
  status: 'open' | 'resolved'
  resolved_at: string | null
  reporter_id: string
  reported_user_id: string
  conversation_id: string | null
  message_id: string | null
  message_created_at: string | null
  message_excerpt: string | null
  reporter_profile: MiniProfile | null
  reported_profile: MiniProfile | null
}

type Msg = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  sender_profile: MiniProfile | null
}

type ApiOk = { ok: true; report: Report; messages: Msg[] }
type ApiErr = { ok?: false; error: any }

function fmtName(p: MiniProfile | null, fallbackId?: string) {
  if (p?.display_name) return p.display_name
  if (p?.username) return `@${p.username}`
  const id = p?.id ?? fallbackId
  return id ? id.slice(0, 8) : '—'
}

function fmtSub(p: MiniProfile | null, fallbackId?: string) {
  if (p?.username) return `@${p.username}`
  const id = p?.id ?? fallbackId
  return id ? id.slice(0, 8) : '—'
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

function isApiOk(v: unknown): v is ApiOk {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return o.ok === true && typeof o.report === 'object' && Array.isArray(o.messages)
}

function getErr(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, any>
  const e = o.error
  if (!e) return null
  return typeof e === 'string' ? e : typeof e?.message === 'string' ? e.message : null
}

export default function AdminReportDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])

  const shortId = useMemo(() => (typeof id === 'string' ? id.slice(0, 8) : '—'), [id])

  async function load() {
    if (!id) {
      setErr('missing id')
      setReport(null)
      setMessages([])
      setLoading(false)
      return
    }

    setLoading(true)
    setErr(null)

    try {
      const r = await adminFetch(`/api/admin/reports/${id}`)

      const ct = r.headers.get('content-type') ?? ''
      const payload: unknown = ct.includes('application/json')
        ? await r.json().catch(() => ({}))
        : { error: await r.text().catch(() => 'Non-JSON response') }

      if (!r.ok) throw new Error(getErr(payload) ?? 'Failed')

      if (!isApiOk(payload)) throw new Error('Bad API response')

      setReport(payload.report)
      setMessages(payload.messages)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה'
      setErr(msg)
      setReport(null)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  async function setStatus(next: 'open' | 'resolved') {
    if (!report) return
    const r = await adminFetch('/api/admin/reports/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: report.id, status: next }),
    })

    const ct = r.headers.get('content-type') ?? ''
    const payload: unknown = ct.includes('application/json')
      ? await r.json().catch(() => ({}))
      : { error: await r.text().catch(() => 'Non-JSON response') }

    if (!r.ok) {
      alert(getErr(payload) ?? 'שגיאה')
      return
    }
    await load()
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-black">דיווח #{shortId}</div>
          <div className="mt-1 text-sm text-muted-foreground">צפייה בדיווח + הקשר הודעות (±5).</div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/reports"
            className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-sm font-bold hover:bg-white"
          >
            חזרה
          </Link>
          <button
            onClick={() => void load()}
            className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-sm font-bold hover:bg-white"
          >
            רענון
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <div className="mt-4 rounded-3xl border border-black/5 bg-white/60 p-4 text-sm">טוען…</div>
      ) : !report ? (
        <div className="mt-4 rounded-3xl border border-black/5 bg-white/60 p-4 text-sm">לא נמצא.</div>
      ) : (
        <>
          <div className="mt-4 rounded-3xl border border-black/5 bg-white/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-black/10 bg-[#FAF9F6] px-2 py-0.5 text-xs font-bold">
                {report.category}
              </span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(report.created_at)}</span>
              <span className="text-xs text-muted-foreground">
                סטטוס: <b>{report.status}</b>
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-black/5 bg-white/50 p-3">
                <div className="text-xs font-bold text-muted-foreground">מדווח</div>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar
                    src={report.reporter_profile?.avatar_url ?? null}
                    name={fmtName(report.reporter_profile, report.reporter_id)}
                    size={28}
                    shape="circle"
                  />
                  <div>
                    <div className="text-sm font-black">{fmtName(report.reporter_profile, report.reporter_id)}</div>
                    <div className="text-xs text-muted-foreground">{fmtSub(report.reporter_profile, report.reporter_id)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white/50 p-3">
                <div className="text-xs font-bold text-muted-foreground">דווח על</div>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar
                    src={report.reported_profile?.avatar_url ?? null}
                    name={fmtName(report.reported_profile, report.reported_user_id)}
                    size={28}
                    shape="circle"
                  />
                  <div>
                    <div className="text-sm font-black">{fmtName(report.reported_profile, report.reported_user_id)}</div>
                    <div className="text-xs text-muted-foreground">{fmtSub(report.reported_profile, report.reported_user_id)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-black/5 bg-[#FAF9F6] p-3">
              <div className="text-xs font-bold text-muted-foreground">ציטוט / פרטים</div>
              <div className="mt-2 whitespace-pre-wrap text-sm">{report.message_excerpt || report.details || '—'}</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {report.status === 'open' ? (
                <button
                  onClick={() => void setStatus('resolved')}
                  className="rounded-full bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90"
                >
                  סמן כטופל
                </button>
              ) : (
                <button
                  onClick={() => void setStatus('open')}
                  className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-bold hover:bg-white"
                >
                  החזר לפתוח
                </button>
              )}

              <button
                onClick={() => router.push(`/inbox?conversation=${report.conversation_id ?? ''}`)}
                className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-bold hover:bg-white"
              >
                פתח שיחה (אם יש לך גישה)
              </button>
            </div>

            <div className="mt-2 text-xs text-muted-foreground">
              הערה: צפייה בהודעות כאן מיועדת לאדמין בלבד.
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-black">הקשר הודעות</div>
            <div className="mt-2 grid gap-2">
              {messages.length === 0 ? (
                <div className="text-sm text-muted-foreground">אין הודעות להציג (אין conversation_id או שאין נתונים).</div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="rounded-3xl border border-black/5 bg-white/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar
                          src={m.sender_profile?.avatar_url ?? null}
                          name={fmtName(m.sender_profile, m.sender_id)}
                          size={24}
                          shape="circle"
                        />
                        <div className="text-xs font-bold">{fmtName(m.sender_profile, m.sender_id)}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{fmtDateTime(m.created_at)}</div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm">{m.body}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
