'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CalendarDays, Clock, Search } from 'lucide-react'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import {
  getUserHistoryActionClasses,
  getUserHistoryActionLabel,
} from '@/lib/admin/userModerationHistory'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  is_anonymous: boolean | null
}

type HistoryEvent = {
  id: string
  created_at: string
  action: string
  reason: string | null
  actor_id: string | null
  target_user_id: string | null
  metadata: Record<string, unknown>
  actor_profile: Profile | null
  target_profile: Profile | null
  target_profile_exists: boolean
}

type Filters = {
  action: string
  q: string
  from: string
  to: string
}

type QuickRange = { label: string; days: number | null }

const PAGE_SIZE = 50
const QUICK_RANGES: QuickRange[] = [
  { label: 'הכל', days: null },
  { label: '30 יום', days: 30 },
  { label: '60 יום', days: 60 },
  { label: '180 יום', days: 180 },
]

const ACTION_OPTIONS = [
  { value: '', label: 'כל הפעולות' },
  { value: 'user_suspend', label: 'הגבלת משתמש' },
  { value: 'user_unsuspend', label: 'שחרור הגבלה' },
  { value: 'user_ban', label: 'חסימת משתמש' },
  { value: 'user_unban', label: 'הסרת חסימה' },
  { value: 'user_takedown', label: 'הסתרת תוכן' },
  { value: 'user_restore_content', label: 'שחזור תוכן מוסתר' },
  { value: 'user_purge_content', label: 'מחיקת תוכן לצמיתות' },
  { value: 'user_anonymize', label: 'אנונימיזציה' },
  { value: 'hard_delete_user', label: 'מחיקה מלאה' },
] as const

function profileName(profile: Profile | null, fallbackId?: string | null): string {
  if (!profile) return fallbackId ? `${fallbackId.slice(0, 8)}…` : '—'
  return profile.display_name || (profile.username ? `@${profile.username}` : `${profile.id.slice(0, 8)}…`)
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function openDatePicker(ref: React.RefObject<HTMLInputElement | null>) {
  try {
    ref.current?.showPicker()
  } catch {
    // no-op
  }
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getUserHistoryActionClasses(action)}`}>
      {getUserHistoryActionLabel(action)}
    </span>
  )
}

function detailsSummary(event: HistoryEvent): string[] {
  const details: string[] = []
  const { metadata } = event

  if (typeof metadata.replacement_username === 'string' && metadata.replacement_username) {
    details.push(`שם חלופי: ${metadata.replacement_username}`)
  }
  if (typeof metadata.hidden_posts === 'number') {
    details.push(`הוסתרו ${metadata.hidden_posts} פוסטים`)
  }
  if (typeof metadata.restored_posts === 'number') {
    details.push(`שוחזרו ${metadata.restored_posts} פוסטים`)
  }
  if (typeof metadata.deleted_posts === 'number') {
    details.push(`נמחקו ${metadata.deleted_posts} פוסטים`)
  }

  const storage = metadata.storage
  if (storage && typeof storage === 'object') {
    const safeStorage = storage as Record<string, unknown>
    const assets = typeof safeStorage.postAssets === 'number' ? safeStorage.postAssets : null
    const covers = typeof safeStorage.postCovers === 'number' ? safeStorage.postCovers : null
    if (assets !== null || covers !== null) {
      details.push(
        `אחסון: ${assets ?? 0} קבצי תוכן, ${covers ?? 0} קאברים`,
      )
    }
  }

  return details
}

export default function UserModerationHistoryTab() {
  const searchParams = useSearchParams()
  const initialQuery = (searchParams.get('q') ?? '').trim()
  const [filters, setFilters] = useState<Filters>({ action: '', q: initialQuery, from: '', to: '' })
  const [draftQ, setDraftQ] = useState(initialQuery)
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraftQ(initialQuery)
    setFilters((prev) => (prev.q === initialQuery ? prev : { ...prev, q: initialQuery }))
  }, [initialQuery])

  const load = useCallback(async (currentOffset: number, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      })
      if (filters.action) params.set('action', filters.action)
      if (filters.q) params.set('q', filters.q)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)

      const response = await adminFetch(`/api/admin/users/history?${params}`)
      const json: unknown = await response.json()
      if (!response.ok) throw new Error(getAdminErrorMessage(json, 'שגיאה'))

      const payload = json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
      const nextEvents = Array.isArray(payload.events) ? (payload.events as HistoryEvent[]) : []
      const nextTotal = typeof payload.total === 'number' ? payload.total : 0

      setEvents((prev) => (append ? [...prev, ...nextEvents] : nextEvents))
      setTotal(nextTotal)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filters])

  useEffect(() => {
    setOffset(0)
    setEvents([])
    void load(0, false)
  }, [load])

  function applyTextSearch() {
    setFilters((prev) => ({ ...prev, q: draftQ.trim() }))
  }

  function applyQuickRange(days: number | null) {
    if (days === null) {
      setFilters((prev) => ({ ...prev, from: '', to: '' }))
      return
    }

    setFilters((prev) => ({
      ...prev,
      from: isoDaysAgo(days),
      to: isoToday(),
    }))
  }

  function clearAll() {
    setDraftQ('')
    setFilters({ action: '', q: '', from: '', to: '' })
  }

  function handleLoadMore() {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    void load(nextOffset, true)
  }

  function currentRange(): number | null | undefined {
    if (!filters.from && !filters.to) return null
    for (const { days } of QUICK_RANGES) {
      if (days !== null && filters.from === isoDaysAgo(days) && filters.to === isoToday()) return days
    }
    return undefined
  }

  const hasMore = events.length < total
  const hasFilters = Boolean(filters.action || filters.q || filters.from || filters.to)

  return (
    <div dir="rtl" className="space-y-4">
      <div className="space-y-3 rounded-xl border border-neutral-200 bg-[#f7f6f3] p-3 dark:border-border dark:bg-neutral-900/60">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">פעולה</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:focus:border-zinc-500"
            >
              {ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">טווח מהיר</label>
            <div className="flex gap-1">
              {QUICK_RANGES.map(({ label, days }) => {
                const active = currentRange() === days
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => applyQuickRange(days)}
                    className={
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ' +
                      (active
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50')
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">מתאריך</label>
            <div className="flex items-center gap-1">
              <input
                ref={fromRef}
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => openDatePicker(fromRef)}
                aria-label="בחר תאריך התחלה"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-500 dark:hover:bg-muted/50"
              >
                <CalendarDays size={14} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">עד תאריך</label>
            <div className="flex items-center gap-1">
              <input
                ref={toRef}
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => openDatePicker(toRef)}
                aria-label="בחר תאריך סיום"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-500 dark:hover:bg-muted/50"
              >
                <CalendarDays size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">חיפוש</label>
            <div className="relative">
              <Search size={13} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyTextSearch()}
                placeholder="משתמש, אדמין, סיבה או מזהה…"
                className="w-full min-w-[160px] sm:w-[220px] rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-3 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-zinc-500"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={applyTextSearch}
            className="self-end rounded-lg border border-neutral-200 bg-white px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50"
          >
            חפש
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="self-end rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-500 dark:hover:bg-muted/50"
            >
              נקה
            </button>
          )}
        </div>
      </div>

      {!loading && !error && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {total === 0 ? 'אין אירועים' : `${total.toLocaleString('he-IL')} אירועים בסה״כ`}
          {events.length > 0 && events.length < total ? ` · מוצגים ${events.length}` : ''}
        </p>
      )}

      {error && <ErrorBanner message={error} onRetry={() => void load(0, false)} />}
      {loading && <TableSkeleton rows={6} />}

      {!loading && !error && events.length === 0 && (
        <EmptyState
          title="אין היסטוריית משתמשים"
          icon={<Clock size={36} strokeWidth={1.5} />}
        />
      )}

      {!loading && events.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-border dark:bg-card">
          <div className="hidden grid-cols-[160px_180px_220px_180px_1fr] gap-3 border-b border-neutral-100 bg-[#f7f6f3] px-4 py-2.5 text-xs font-medium text-neutral-500 sm:grid dark:border-border dark:bg-muted/30 dark:text-neutral-400">
            <span>זמן</span>
            <span>פעולה</span>
            <span>משתמש</span>
            <span>אדמין</span>
            <span>פרטים</span>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-border">
            {events.map((event) => {
              const detailLines = detailsSummary(event)
              const targetName = profileName(event.target_profile, event.target_user_id)
              const actorName = profileName(event.actor_profile, event.actor_id)

              const targetCell = (
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar src={event.target_profile?.avatar_url} name={targetName} size={24} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-neutral-800">{targetName}</div>
                    {event.target_user_id && (
                      <div className="font-mono text-[11px] text-neutral-400">{event.target_user_id.slice(0, 12)}…</div>
                    )}
                  </div>
                </div>
              )

              return (
                <div
                  key={event.id}
                  className="grid grid-cols-1 gap-2 px-4 py-3 text-sm transition-colors hover:bg-neutral-50 sm:grid-cols-[160px_180px_220px_180px_1fr] sm:items-center sm:gap-3 dark:hover:bg-muted/30"
                >
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{fmtDateTime(event.created_at)}</div>

                  <div><ActionBadge action={event.action} /></div>

                  <div className="min-w-0">
                    {event.target_profile_exists && event.target_user_id ? (
                      <Link href={`/admin/users/${event.target_user_id}`} className="block hover:opacity-80">
                        {targetCell}
                      </Link>
                    ) : (
                      targetCell
                    )}
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar src={event.actor_profile?.avatar_url} name={actorName} size={24} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-neutral-800 dark:text-foreground">{actorName}</div>
                      {event.actor_id && (
                        <div className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500">{event.actor_id.slice(0, 12)}…</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                    {event.reason ? (
                      <div className="rounded-md border border-neutral-200 bg-[#f7f6f3] px-2 py-1 dark:border-border dark:bg-muted/30">
                        סיבה: {event.reason}
                      </div>
                    ) : (
                      <div className="text-neutral-400 dark:text-neutral-500">ללא סיבה מפורטת</div>
                    )}
                    {detailLines.map((line) => (
                      <div key={line} className="text-neutral-500 dark:text-neutral-400">{line}</div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded-lg border border-neutral-200 bg-white px-5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50"
          >
            {loadingMore ? 'טוען…' : 'טען עוד'}
          </button>
        </div>
      )}
    </div>
  )
}
