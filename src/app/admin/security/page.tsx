'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/admin/adminFetch'
import PageHeader from '@/components/admin/PageHeader'
import FilterTabs from '@/components/admin/FilterTabs'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import { formatProfileIdentityInlineSummary, getProfileIdentityChangeLines } from '@/lib/admin/profileIdentityAudit'
import { Lock, LogIn, LogOut, User, UserPlus, KeyRound, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'

/* ── types ── */

type MiniProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

type AuditRow = {
  id: string
  user_id: string | null
  event: string
  ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  profiles: MiniProfile | null
}

type SecurityApiResponse = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  error?: string
}

/* ── event config ── */

type EventFilter = 'all' | 'login_success' | 'login_failed' | 'logout' | 'signup' | 'password_reset' | 'token_refresh_failed' | 'profile_identity_updated'

const PROFILE_IDENTITY_EVENT_OPTION: { value: EventFilter; label: string } = {
  value: 'profile_identity_updated',
  label: 'שינוי זהות',
}

const EVENT_OPTIONS: { value: EventFilter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'login_success', label: 'כניסות' },
  { value: 'login_failed', label: 'כישלונות' },
  { value: 'logout', label: 'יציאות' },
  { value: 'signup', label: 'הרשמות' },
  { value: 'password_reset', label: 'איפוס סיסמה' },
  { value: 'token_refresh_failed', label: 'פג תוקף' },
]

function EventBadge({ event }: { event: string }) {
  if (event === 'profile_identity_updated') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-400">
        <User size={12} />
        שינוי זהות
      </span>
    )
  }

  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    login_success:         { label: 'כניסה',        icon: <LogIn size={12} />,      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30' },
    login_failed:          { label: 'כישלון כניסה', icon: <AlertTriangle size={12} />, cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30' },
    logout:                { label: 'יציאה',         icon: <LogOut size={12} />,     cls: 'bg-neutral-50 text-neutral-600 border-neutral-200 dark:bg-muted/40 dark:text-neutral-400 dark:border-border' },
    signup:                { label: 'הרשמה',         icon: <UserPlus size={12} />,   cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30' },
    password_reset:        { label: 'איפוס סיסמה',  icon: <KeyRound size={12} />,   cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30' },
    token_refresh_failed:  { label: 'פג תוקף',      icon: <RefreshCw size={12} />,  cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30' },
  }
  const cfg = map[event] ?? { label: event, icon: <Lock size={12} />, cls: 'bg-neutral-50 text-neutral-600 border-neutral-200 dark:bg-muted/40 dark:text-neutral-400 dark:border-border' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function MetadataPreview({ row }: { row: AuditRow }) {
  if (!row.metadata) {
    return <span className="text-neutral-300 dark:text-neutral-600">—</span>
  }

  if (row.event === 'profile_identity_updated') {
    const lines = getProfileIdentityChangeLines(row.metadata)

    return (
      <div className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        {lines.length > 0 ? (
          lines.map((line) => (
            <div key={line.key}>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{line.label}:</span>{' '}
              <span>{line.previous}</span>
              <span className="mx-1 text-neutral-300 dark:text-neutral-600">→</span>
              <span>{line.next}</span>
            </div>
          ))
        ) : (
          <span>{formatProfileIdentityInlineSummary(row.metadata)}</span>
        )}
      </div>
    )
  }

  return (
    <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">
      {row.metadata.email_hash
        ? `hash:${String(row.metadata.email_hash)}`
        : JSON.stringify(row.metadata).slice(0, 40)}
    </span>
  )
}

/* ── page ── */

export default function SecurityPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [eventFilter, setEventFilter] = useState<EventFilter>('all')
  const [ipSearch, setIpSearch] = useState('')
  const [ipInput, setIpInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const PAGE_SIZE = 50

  function todayStr() {
    return new Date().toISOString().slice(0, 10)
  }

  function yesterdayStr() {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  function daysAgoStr(n: number) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }

  function applyQuickDate(preset: 'today' | 'yesterday' | '7d' | '30d') {
    const today = todayStr()
    if (preset === 'today') { setDateFrom(today); setDateTo(today) }
    else if (preset === 'yesterday') { const y = yesterdayStr(); setDateFrom(y); setDateTo(y) }
    else if (preset === '7d') { setDateFrom(daysAgoStr(6)); setDateTo(today) }
    else if (preset === '30d') { setDateFrom(daysAgoStr(29)); setDateTo(today) }
    setPage(1)
  }

  function clearDates() {
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page) })
      if (eventFilter !== 'all') qs.set('event', eventFilter)
      if (ipSearch) qs.set('ip', ipSearch)
      if (dateFrom) qs.set('start', dateFrom)
      if (dateTo) qs.set('end', dateTo)

      const res = await adminFetch(`/api/admin/security?${qs}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `שגיאה ${res.status}`)
      }
      const body = await res.json() as SecurityApiResponse
      setRows(body.rows ?? [])
      setTotal(body.total ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינה')
    } finally {
      setLoading(false)
    }
  }, [page, eventFilter, ipSearch, dateFrom, dateTo])

  useEffect(() => { void load() }, [load])

  function applyIpSearch() {
    setIpSearch(ipInput.trim())
    setPage(1)
  }

  function onEventChange(v: string) {
    setEventFilter(v as EventFilter)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader
        title="אבטחה"
        description={`${total.toLocaleString('he-IL')} אירועים`}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <FilterTabs
          options={[...EVENT_OPTIONS, PROFILE_IDENTITY_EVENT_OPTION]}
          value={eventFilter}
          onChange={onEventChange}
        />

        {/* IP search */}
        <form
          onSubmit={e => { e.preventDefault(); applyIpSearch() }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={ipInput}
            onChange={e => setIpInput(e.target.value)}
            placeholder="חפש IP…"
            className="h-9 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-zinc-500"
          />
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg bg-neutral-900 px-4 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            חפש
          </button>
          {ipSearch && (
            <button
              type="button"
              onClick={() => { setIpInput(''); setIpSearch(''); setPage(1) }}
              className="h-9 shrink-0 rounded-lg border border-neutral-200 px-3 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
            >
              נקה
            </button>
          )}
        </form>

        {/* Date filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {(['today', 'yesterday', '7d', '30d'] as const).map(p => {
              const label = p === 'today' ? 'היום' : p === 'yesterday' ? 'אתמול' : p === '7d' ? '7 ימים' : '30 ימים'
              const isActive =
                p === 'today' ? dateFrom === todayStr() && dateTo === todayStr() :
                p === 'yesterday' ? dateFrom === yesterdayStr() && dateTo === yesterdayStr() :
                p === '7d' ? dateFrom === daysAgoStr(6) && dateTo === todayStr() :
                dateFrom === daysAgoStr(29) && dateTo === todayStr()
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyQuickDate(p)}
                  className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors ${isActive ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-400 dark:hover:bg-muted/50'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:border-border dark:bg-zinc-800/50 dark:text-neutral-300 dark:[color-scheme:dark]"
              dir="ltr"
            />
            <span className="text-xs text-neutral-400 dark:text-neutral-600">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:border-border dark:bg-zinc-800/50 dark:text-neutral-300 dark:[color-scheme:dark]"
              dir="ltr"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={clearDates}
                className="h-8 rounded-lg border border-neutral-200 px-2.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
              >
                נקה תאריך
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <TableSkeleton rows={12} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Lock size={32} />} title="אין אירועים" description="לא נמצאו רשומות לפילטר הנוכחי" />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-border dark:bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-500 dark:border-border dark:bg-muted/30 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">אירוע</th>
                    <th className="px-4 py-3 text-right font-medium">משתמש</th>
                    <th className="px-4 py-3 text-right font-medium hidden md:table-cell">IP</th>
                    <th className="px-4 py-3 text-right font-medium hidden lg:table-cell">פרטים</th>
                    <th className="px-3 py-3 text-right font-medium whitespace-nowrap">זמן</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-border">
                  {rows.map(row => (
                    <tr key={row.id} className="transition-colors hover:bg-neutral-50 dark:hover:bg-muted/30">
                      <td className="px-4 py-3 align-top">
                        <EventBadge event={row.event} />
                      </td>
                      <td className="px-4 py-3 align-top max-w-[9rem] sm:max-w-none">
                        {row.profiles ? (
                          <Link
                            href={`/admin/users/${row.user_id}`}
                            className="block font-medium text-neutral-900 hover:underline dark:text-foreground leading-snug"
                          >
                            <span className="block truncate">{row.profiles.display_name ?? row.profiles.username}</span>
                            <span className="block text-xs text-neutral-400 dark:text-neutral-500 truncate">@{row.profiles.username}</span>
                          </Link>
                        ) : row.user_id ? (
                          <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">{row.user_id.slice(0, 8)}…</span>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell align-top" dir="ltr">
                        <button
                          type="button"
                          onClick={() => { setIpInput(row.ip ?? ''); setIpSearch(row.ip ?? ''); setPage(1) }}
                          className="font-mono text-xs text-neutral-500 hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-foreground"
                          title="סנן לפי IP זה"
                        >
                          {row.ip ?? '—'}
                        </button>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell align-top">
                        <MetadataPreview row={row} />
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-neutral-500 whitespace-nowrap dark:text-neutral-400">
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">
                עמוד {page} מתוך {totalPages} · {total.toLocaleString('he-IL')} סה&quot;כ
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
