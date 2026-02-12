'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import PageHeader from '@/components/admin/PageHeader'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import {
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  Flag,
  User,
  FileText,
} from 'lucide-react'

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

export default function AdminReportDetailClient({
  id,
  isDrawer = false,
}: {
  id: string
  isDrawer?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [saving, setSaving] = useState(false)

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

      if (!r.ok) throw new Error(getAdminErrorMessage(payload, 'Failed'))

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
    setSaving(true)
    setErr(null)
    try {
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
        setErr(getAdminErrorMessage(payload, 'שגיאה'))
        return
      }
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <div className="space-y-5" dir="rtl">
      {!isDrawer && (
        <PageHeader
          title={`דיווח #${shortId}`}
          description="צפייה בדיווח + הקשר הודעות (±5)."
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/admin/reports"
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <ArrowRight size={13} />
                חזרה
              </Link>
              <button
                onClick={() => void load()}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
                aria-label="רענון"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          }
        />
      )}

      {err && <ErrorBanner message={err} onRetry={load} />}

      {loading ? (
        <TableSkeleton rows={3} />
      ) : !report ? (
        <EmptyState
          title="לא נמצא"
          description="הדיווח לא נמצא במערכת."
          icon={<Flag size={36} strokeWidth={1.5} />}
        />
      ) : (
        <>
          {/* Report card */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                {report.category}
              </span>
              <span className="text-xs text-neutral-400">{fmtDateTime(report.created_at)}</span>
              {report.status === 'open' ? (
                <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  פתוח
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  טופל
                </span>
              )}
            </div>

            {/* Reporter & Reported */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                  <User size={12} />
                  מדווח
                </div>
                <div className="mt-2 flex items-center gap-2.5">
                  <Avatar
                    src={report.reporter_profile?.avatar_url ?? null}
                    name={fmtName(report.reporter_profile, report.reporter_id)}
                    size={28}
                    shape="circle"
                  />
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">
                      {fmtName(report.reporter_profile, report.reporter_id)}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {fmtSub(report.reporter_profile, report.reporter_id)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                  <User size={12} />
                  דווח על
                </div>
                <div className="mt-2 flex items-center gap-2.5">
                  <Avatar
                    src={report.reported_profile?.avatar_url ?? null}
                    name={fmtName(report.reported_profile, report.reported_user_id)}
                    size={28}
                    shape="circle"
                  />
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">
                      {fmtName(report.reported_profile, report.reported_user_id)}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {fmtSub(report.reported_profile, report.reported_user_id)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quote / Details */}
            <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                <FileText size={12} />
                ציטוט / פרטים
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                {report.message_excerpt || report.details || '—'}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              {report.status === 'open' ? (
                <button
                  onClick={() => void setStatus('resolved')}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  סמן כטופל
                </button>
              ) : (
                <button
                  onClick={() => void setStatus('open')}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  החזר לפתוח
                </button>
              )}

              {report.conversation_id && (
                <Link
                  href={`/inbox?conversation=${report.conversation_id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <MessageSquare size={14} />
                  פתח שיחה
                </Link>
              )}
            </div>

            <div className="mt-3 text-[11px] text-neutral-400">
              הערה: צפייה בהודעות כאן מיועדת לאדמין בלבד.
            </div>
          </div>

          {/* Messages context */}
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-900">
              <MessageSquare size={16} className="text-neutral-500" />
              הקשר הודעות
            </h2>

            {messages.length === 0 ? (
              <EmptyState
                title="אין הודעות להציג"
                description="אין conversation_id או שאין נתונים."
                icon={<MessageSquare size={28} strokeWidth={1.5} />}
              />
            ) : (
              <div className="grid gap-2">
                {messages.map((m) => {
                  const isReported = m.id === report.message_id
                  return (
                    <div
                      key={m.id}
                      className={
                        isReported
                          ? 'rounded-xl border-2 border-amber-400 bg-amber-50/50 p-3.5'
                          : 'rounded-xl border border-neutral-200 bg-white p-3.5'
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar
                            src={m.sender_profile?.avatar_url ?? null}
                            name={fmtName(m.sender_profile, m.sender_id)}
                            size={24}
                            shape="circle"
                          />
                          <span className="text-xs font-semibold text-neutral-900">
                            {fmtName(m.sender_profile, m.sender_id)}
                          </span>
                          {isReported && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              הודעה מדווחת
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-neutral-400">{fmtDateTime(m.created_at)}</span>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{m.body}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
