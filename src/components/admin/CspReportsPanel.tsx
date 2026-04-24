'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldAlert, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminFetch } from '@/lib/admin/adminFetch'

type CspReportRow = {
  id: string
  route_path: string
  effective_directive: string
  blocked_uri: string
  source_file: string | null
  line_number: number | null
  status: string
  sample: string | null
  user_agent_family: string | null
  count: number
  first_seen_at: string
  last_seen_at: string
}

type CspResponse = {
  rows: CspReportRow[]
  total: number
  page: number
  pageSize: number
  setupRequired?: boolean
  error?: string
}

type StatusFilter = 'all' | 'new' | 'known' | 'ignored' | 'fixed'
type UpdateStatus = 'new' | 'known' | 'ignored' | 'fixed'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',     label: 'הכל' },
  { value: 'new',     label: 'חדש' },
  { value: 'known',   label: 'ידוע' },
  { value: 'ignored', label: 'התעלם' },
  { value: 'fixed',   label: 'תוקן' },
]

const STATUS_ACTIONS: { value: UpdateStatus; label: string }[] = [
  { value: 'known',   label: 'סמן ידוע' },
  { value: 'ignored', label: 'התעלם' },
  { value: 'fixed',   label: 'תוקן' },
  { value: 'new',     label: 'חזור לחדש' },
]

const STATUS_CLS: Record<string, string> = {
  new:     'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  known:   'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
  ignored: 'border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-border dark:bg-muted/40 dark:text-neutral-400',
  fixed:   'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
}

const STATUS_HE: Record<string, string> = {
  new: 'חדש', known: 'ידוע', ignored: 'התעלם', fixed: 'תוקן',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[status] ?? STATUS_CLS.ignored}`}>
      {STATUS_HE[status] ?? status}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function ActionMenu({
  row,
  onUpdate,
}: {
  row: CspReportRow
  onUpdate: (id: string, status: UpdateStatus) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const actions = STATUS_ACTIONS.filter((a) => a.value !== row.status)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex h-6 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 text-[11px] font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50"
      >
        {busy ? '...' : 'פעולה'}
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-20 min-w-[110px] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-border dark:bg-card">
          {actions.map((action) => (
            <button
              key={action.value}
              type="button"
              className="block w-full px-3 py-2 text-right text-xs text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-muted/50"
              onClick={async () => {
                setOpen(false)
                setBusy(true)
                await onUpdate(row.id, action.value)
                setBusy(false)
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CspReportsPanel() {
  const [rows, setRows] = useState<CspReportRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new')
  const [setupRequired, setSetupRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page) })
      if (statusFilter !== 'all') qs.set('status', statusFilter)
      const res = await adminFetch(`/api/admin/security/csp?${qs}`)
      const body = await res.json().catch(() => ({})) as CspResponse
      if (!res.ok) throw new Error(body.error ?? `שגיאה ${res.status}`)
      setRows(body.rows ?? [])
      setTotal(body.total ?? 0)
      setPageSize(body.pageSize ?? 50)
      setSetupRequired(Boolean(body.setupRequired))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת דוחות CSP')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { void load() }, [load])

  const handleStatusChange = (filter: StatusFilter) => {
    setStatusFilter(filter)
    setPage(1)
  }

  const handleUpdate = async (id: string, status: UpdateStatus) => {
    const res = await adminFetch('/api/admin/security/csp', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-border dark:bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-4 dark:border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert size={17} className="text-amber-600 dark:text-amber-300" />
            <h2 className="text-sm font-bold text-neutral-900 dark:text-foreground">CSP Report-Only</h2>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            הפרות ממדיניות CSP מחמירה במסלולים רגישים. לא חוסמות משתמשים.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
          aria-label="רענן דוחות CSP"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-100 px-4 py-2.5 dark:border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleStatusChange(tab.value)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-400 dark:hover:bg-muted/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {setupRequired ? (
        <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
          נדרש להחיל את migration של{' '}
          <code className="font-mono text-xs">csp_violation_reports</code> לפני הצגת היסטוריה.
        </div>
      ) : error ? (
        <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : loading ? (
        <div className="p-4 text-sm text-neutral-400 dark:text-neutral-500">טוען...</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
          {statusFilter === 'new' ? 'אין הפרות חדשות — מצוין.' : 'אין דוחות לפילטר הנוכחי.'}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-500 dark:border-border dark:bg-muted/30 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">מסלול</th>
                  <th className="px-4 py-3 text-right font-medium">Directive</th>
                  <th className="px-4 py-3 text-right font-medium">חסום</th>
                  <th className="px-3 py-3 text-right font-medium">ספירה</th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">ראשון</th>
                  <th className="px-4 py-3 text-right font-medium">אחרון</th>
                  <th className="px-4 py-3 text-right font-medium">סטטוס</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-50 dark:hover:bg-muted/30">
                    <td
                      className="max-w-[140px] truncate px-4 py-3 font-mono text-xs"
                      title={row.route_path}
                    >
                      {row.route_path}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {row.effective_directive}
                    </td>
                    <td
                      className="max-w-[180px] truncate px-4 py-3 font-mono text-xs"
                      title={
                        row.source_file
                          ? `${row.blocked_uri}\n${row.source_file}${row.line_number ? `:${row.line_number}` : ''}`
                          : row.blocked_uri
                      }
                    >
                      {row.blocked_uri}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-xs">
                      {row.count.toLocaleString('he-IL')}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400 sm:table-cell">
                      {formatDate(row.first_seen_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(row.last_seen_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ActionMenu row={row} onUpdate={handleUpdate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 dark:border-border">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {total.toLocaleString('he-IL')} קבוצות
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {page}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
