"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import Avatar from "@/components/Avatar"
import { adminFetch } from "@/lib/admin/adminFetch"
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import PageHeader from '@/components/admin/PageHeader'
import FilterTabs from '@/components/admin/FilterTabs'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import {
  Flag,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  FileText,
  User,
  X,
} from 'lucide-react'
import AdminReportDrawer from '@/components/admin/AdminReportDetailClient'

/* ── types ── */

type MiniProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

type ReportRow = {
  id: string
  created_at: string
  category?: string | null
  reason_code?: string | null
  details?: string | null
  status?: "open" | "resolved" | string
  conversation_id?: string | null
  message_id?: string | null
  reporter_id?: string | null
  reported_user_id?: string | null
  reporter_display_name?: string | null
  reported_display_name?: string | null
  reporter_username?: string | null
  reported_username?: string | null
  reporter_profile?: MiniProfile | null
  reported_profile?: MiniProfile | null
  message_preview?: string | null
  message_excerpt?: string | null
}

type ReportsApiResponse = {
  ok?: boolean
  error?: { code?: string; message?: string } | string
  reports?: ReportRow[]
}

function isReportsApiResponse(v: unknown): v is ReportsApiResponse {
  return typeof v === "object" && v !== null
}

/* ── source type ── */

type SourceType = "all" | "inbox" | "posts" | "users"

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "inbox", label: "אינבוקס" },
  { value: "posts", label: "פוסטים / תגובות" },
  { value: "users", label: "משתמשים" },
]

const STATUS_OPTIONS: { value: "open" | "resolved"; label: string }[] = [
  { value: "open", label: "פתוחים" },
  { value: "resolved", label: "טופלו" },
]

function detectSource(r: ReportRow): "inbox" | "posts" | "users" {
  if (r.conversation_id != null) return "inbox"
  if (r.conversation_id == null && r.details?.includes('post:')) return "posts"
  return "users"
}

function isPostReport(details?: string | null) {
  return !!details && /\bentity:\s*post\b/i.test(details)
}

function parseDetailValue(details: string | null | undefined, key: string) {
  if (!details) return null
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'm')
  const m = details.match(re)
  return m ? m[1].trim() : null
}

function extractUserWrittenDetails(details: string | null | undefined) {
  if (!details) return null
  const lines = details
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const cleaned = lines.filter((l) => {
    const low = l.toLowerCase()
    if (low.startsWith('entity:')) return false
    if (low.startsWith('post:')) return false
    if (low.startsWith('post_title:')) return false
    if (low.startsWith('title:')) return false
    if (low.startsWith('reason_label:')) return false
    return true
  })

  const txt = cleaned.join('\n').trim()
  return txt.length ? txt : null
}

function reasonLabelFromCode(code?: string | null) {
  switch (code) {
    case 'abusive_language':
      return 'שפה פוגענית / הקנטה'
    case 'spam_promo':
      return 'ספאם / פרסום'
    case 'hate_incitement':
      return 'שנאה / הסתה'
    case 'privacy_exposure':
      return 'חשיפת מידע אישי'
    case 'other':
      return 'אחר'
    default:
      return null
  }
}

function reportReasonLabel(r: ReportRow) {
  return reasonLabelFromCode(r.reason_code) || parseDetailValue(r.details, 'reason_label')
}

function fmtName(p: MiniProfile | null | undefined, fallback?: string | null) {
  if (p?.display_name) return p.display_name
  if (p?.username) return `@${p.username}`
  return fallback || '—'
}

/* ── component ── */

export default function ReportsPage() {
  const [status, setStatus] = useState<"open" | "resolved">("open")
  const [source, setSource] = useState<SourceType>("all")
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeReportId, setActiveReportId] = useState<string | null>(null)

  const title = useMemo(() => (status === "open" ? "דיווחים פתוחים" : "דיווחים שטופלו"), [status])

  const filtered = useMemo(() => {
    if (source === "all") return rows
    return rows.filter((r) => detectSource(r) === source)
  }, [rows, source])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await adminFetch(`/api/admin/reports?status=${status}`)
      const contentType = res.headers.get("content-type") || ""

      if (!contentType.includes("application/json")) {
        const text = await res.text()
        throw new Error(`API החזיר תשובה לא-JSON (${res.status}): ${text.slice(0, 120)}`)
      }

      const json: unknown = await res.json()
      if (!isReportsApiResponse(json)) throw new Error("תגובה לא צפויה מהשרת")
      if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))

      setRows(Array.isArray(json.reports) ? json.reports : [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "שגיאה לא ידועה"
      setError(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [status])

  async function toggleResolve(id: string, nextStatus: "open" | "resolved") {
    setError(null)

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)))

    try {
      const res = await adminFetch(`/api/admin/reports/resolve`, {
        method: "POST",
        body: JSON.stringify({ id, status: nextStatus }),
      })

      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        const text = await res.text()
        throw new Error(`API החזיר תשובה לא-JSON (${res.status}): ${text.slice(0, 120)}`)
      }

      const json: unknown = await res.json()
      if (!isReportsApiResponse(json)) throw new Error("תגובה לא צפויה מהשרת")
      if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))

      await load()
    } catch (e: unknown) {
      await load()
      const msg = e instanceof Error ? e.message : "שגיאה לא ידועה"
      setError(msg)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  function parsePostSlug(details?: string | null) {
    if (!details) return null
    const m = details.match(/post:\s*(.+)/)
    return m ? m[1].trim() : null
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description="דיווחים מהצ׳אט (מודרציה)"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterTabs value={source} onChange={setSource} options={SOURCE_OPTIONS} />
            <FilterTabs value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="אין דיווחים להצגה"
          description={status === "open" ? "כל הדיווחים טופלו" : "עדיין לא סומנו דיווחים כטופלו"}
          icon={<Flag size={36} strokeWidth={1.5} />}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const src = detectSource(r)
            const reporterName = fmtName(r.reporter_profile, r.reporter_display_name || r.reporter_username)
            const reportedName = fmtName(r.reported_profile, r.reported_display_name || r.reported_username)
            const when = new Date(r.created_at).toLocaleString("he-IL")

            return (
              <div
                key={r.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Source badge */}
                    {src === "inbox" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        <MessageSquare size={11} /> אינבוקס
                      </span>
                    )}
                    {src === "posts" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                        <FileText size={11} /> פוסט / תגובה
                      </span>
                    )}
                    {src === "users" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                        <User size={11} /> משתמש
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {r.category || "כללי"}
                    </span>
                    {(() => {
                      const reason = reportReasonLabel(r)
                      return reason ? (
                        <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                          {reason}
                        </span>
                      ) : null
                    })()}

                    <span className="text-xs text-neutral-400">{when}</span>
                  </div>
                  <span
                    className={
                      'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ' +
                      (r.status === 'resolved'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700')
                    }
                  >
                    {r.status === 'resolved' ? 'טופל' : 'פתוח'}
                  </span>
                </div>

                {/* Reporter → Reported */}
                <div className="mt-2 flex items-center gap-2 text-sm text-neutral-800">
                  <div className="flex items-center gap-1.5">
                    <Avatar
                      src={r.reporter_profile?.avatar_url ?? null}
                      name={reporterName}
                      size={20}
                      shape="circle"
                    />
                    <span className="font-semibold">{reporterName}</span>
                  </div>
                  <span className="text-neutral-400">דיווח/ה על</span>
                  <div className="flex items-center gap-1.5">
                    <Avatar
                      src={r.reported_profile?.avatar_url ?? null}
                      name={reportedName}
                      size={20}
                      shape="circle"
                    />
                    <span className="font-semibold">{reportedName}</span>
                  </div>
                </div>

                {/* Context — varies by source */}
                {src === "inbox" && (r.message_preview || r.message_excerpt) && (
                  <div className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                    {r.message_excerpt || r.message_preview}
                  </div>
                )}
                {src === "posts" && (r.message_preview || r.message_excerpt || r.details) && (
                  <div className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                    {isPostReport(r.details) ? (
                      <div className="space-y-1">
                        <div className="font-bold text-neutral-900">
                          {parseDetailValue(r.details, 'post_title') || 'ללא כותרת'}
                        </div>
                        {r.message_excerpt ? (
                          <div className="line-clamp-3 whitespace-pre-wrap">{r.message_excerpt}</div>
                        ) : null}
                        {(() => {
                          const userTxt = extractUserWrittenDetails(r.details)
                          return userTxt ? (
                            <div className="line-clamp-2 whitespace-pre-wrap text-[13px] text-neutral-600">
                              {userTxt}
                            </div>
                          ) : null
                        })()}
                      </div>
                    ) : (
                      <div className="line-clamp-3 whitespace-pre-wrap">{r.message_excerpt || r.message_preview}</div>
                    )}
                  </div>
                )}
                {src === "users" && r.details && (
                  <div className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                    {r.details}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {src === "inbox" && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      onClick={() => setActiveReportId(r.id)}
                    >
                      <MessageSquare size={13} />
                      פירוט + הקשר
                    </button>
                  )}

                  {src === "posts" && (() => {
                    const slug = parsePostSlug(r.details)
                    return slug ? (
                      <Link
                        href={`/post/${slug}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        <FileText size={13} />
                        צפה בפוסט
                      </Link>
                    ) : null
                  })()}

                  {src === "users" && (
                    <Link
                      href="/admin/users"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      <User size={13} />
                      ניהול משתמש
                    </Link>
                  )}

                  {src !== "inbox" && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      onClick={() => setActiveReportId(r.id)}
                    >
                      פירוט
                    </button>
                  )}

                  {r.status !== "resolved" ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      onClick={() => toggleResolve(r.id, "resolved")}
                    >
                      <CheckCircle2 size={13} />
                      סמן טופל
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      onClick={() => toggleResolve(r.id, "open")}
                    >
                      <RotateCcw size={13} />
                      החזר לפתוח
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Drawer */}
      {activeReportId && (
        <ReportDrawer
          id={activeReportId}
          onClose={() => setActiveReportId(null)}
        />
      )}
    </div>
  )
}

/* ── Drawer wrapper ── */

function ReportDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-bold text-neutral-900">פרטי דיווח</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
            aria-label="סגור"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <AdminReportDrawer id={id} isDrawer />
        </div>
      </div>
    </div>
  )
}
