'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Clock, Search, CalendarDays } from 'lucide-react'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import ErrorBanner from './ErrorBanner'
import EmptyState from './EmptyState'
import { TableSkeleton } from './AdminSkeleton'

// ─── Types ────────────────────────────────────────────────────────────────────

type PostSnapshot = {
  title: string | null
  slug: string | null
  author_id: string | null
  channel_id: string | null
  status: string | null
  published_at: string | null
  is_anonymous: boolean | null
  created_at: string | null
}

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type DeletionEvent = {
  id: string
  created_at: string
  action: 'soft_delete' | 'admin_soft_hide' | 'hard_delete' | 'user_hard_delete' | 'admin_hard_delete'
  actor_kind: 'user' | 'admin' | 'system'
  actor_user_id: string | null
  target_post_id: string
  post_snapshot: PostSnapshot
  reason: string | null
  actor_profile: Profile | null
  author_profile: Profile | null
}

type Filters = {
  action: string
  actor_kind: string
  q: string
  author: string
  from: string
  to: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const ACTION_CONFIG: Record<string, { label: string; className: string }> = {
  soft_delete:       { label: 'מחיקה עצמית (זמנית)', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30' },
  admin_soft_hide:   { label: 'הסתרה (אדמין)',         className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30' },
  hard_delete:       { label: 'מחיקה קבועה (משתמש)',  className: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30' },
  admin_hard_delete: { label: 'מחיקה קבועה (אדמין)',  className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40' },
}

type QuickRange = { label: string; days: number | null }
const QUICK_RANGES: QuickRange[] = [
  { label: 'הכל',     days: null },
  { label: '30 יום',  days: 30 },
  { label: '60 יום',  days: 60 },
  { label: '180 יום', days: 180 },
]

const IS_HARD = (action: string) =>
  action === 'hard_delete' || action === 'user_hard_delete' || action === 'admin_hard_delete'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function profileName(p: Profile | null, fallbackId?: string | null): string {
  if (!p) return fallbackId ? fallbackId.slice(0, 8) + '…' : '—'
  return p.display_name || (p.username ? `@${p.username}` : p.id.slice(0, 8) + '…')
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

function openDatePicker(ref: React.RefObject<HTMLInputElement | null>) {
  try {
    ref.current?.showPicker()
  } catch {
    // showPicker() not supported in this browser — native click still works
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const normalizedAction = action === 'user_hard_delete' ? 'hard_delete' : action
  const cfg = ACTION_CONFIG[normalizedAction] ?? {
    label: action,
    className: 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-muted/40 dark:text-neutral-400 dark:border-border',
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function ProfileCell({ profile, userId }: { profile: Profile | null; userId: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Avatar src={profile?.avatar_url} name={profileName(profile, userId)} size={20} />
      <span className="truncate text-xs text-neutral-700 dark:text-neutral-300">{profileName(profile, userId)}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeletionHistoryTab() {
  const [filters, setFilters] = useState<Filters>({
    action: '', actor_kind: '', q: '', author: '', from: '', to: '',
  })
  // Draft text inputs — committed to filters on Enter / "חפש" click
  const [draftQ,      setDraftQ]      = useState('')
  const [draftAuthor, setDraftAuthor] = useState('')

  const [events,      setEvents]      = useState<DeletionEvent[]>([])
  const [total,       setTotal]       = useState(0)
  const [offset,      setOffset]      = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [err,         setErr]         = useState<string | null>(null)

  // Refs for showPicker() on calendar icon click
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef   = useRef<HTMLInputElement>(null)

  // ── Data fetching ────────────────────────────────────────────────────────────

  const load = useCallback(async (currentOffset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true)
    setErr(null)

    try {
      const params = new URLSearchParams({
        limit:  String(PAGE_SIZE),
        offset: String(currentOffset),
      })
      if (filters.action)     params.set('action',     filters.action)
      if (filters.actor_kind) params.set('actor_kind', filters.actor_kind)
      if (filters.q)          params.set('q',          filters.q)
      if (filters.author)     params.set('author',     filters.author)
      if (filters.from)       params.set('from',       filters.from)
      if (filters.to)         params.set('to',         filters.to)

      const r = await adminFetch(`/api/admin/posts/history?${params}`)
      const j: unknown = await r.json()
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה'))

      const data      = j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
      const newEvents = Array.isArray(data.events) ? (data.events as DeletionEvent[]) : []
      const newTotal  = typeof data.total === 'number' ? data.total : 0

      setEvents(prev => append ? [...prev, ...newEvents] : newEvents)
      setTotal(newTotal)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filters])

  useEffect(() => {
    setOffset(0)
    setEvents([])
    load(0, false)
  }, [load])

  // ── Actions ──────────────────────────────────────────────────────────────────

  function applyTextSearch() {
    setFilters(f => ({ ...f, q: draftQ.trim(), author: draftAuthor.trim() }))
  }

  function applyQuickRange(days: number | null) {
    if (days === null) {
      setFilters(f => ({ ...f, from: '', to: '' }))
    } else {
      setFilters(f => ({ ...f, from: isoDaysAgo(days), to: isoToday() }))
    }
  }

  function clearAll() {
    setFilters({ action: '', actor_kind: '', q: '', author: '', from: '', to: '' })
    setDraftQ('')
    setDraftAuthor('')
  }

  function handleLoadMore() {
    const next = offset + PAGE_SIZE
    setOffset(next)
    load(next, true)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const hasMore    = events.length < total
  const hasFilters = filters.action || filters.actor_kind || filters.q ||
                     filters.author || filters.from || filters.to

  // Which quick-range button is currently active
  function activeRange(): number | null | undefined {
    if (!filters.from && !filters.to) return null  // "הכל"
    for (const { days } of QUICK_RANGES) {
      if (days !== null && filters.from === isoDaysAgo(days) && filters.to === isoToday()) return days
    }
    return undefined  // custom
  }
  const currentRange = activeRange()

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="space-y-4">

      {/* ── Filters panel ── */}
      <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-border dark:bg-muted/30">

        {/* Row 1: dropdowns */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Action */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">פעולה</label>
            <select
              value={filters.action}
              onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:focus:border-zinc-500"
            >
              <option value="">הכל</option>
              <option value="soft_delete">מחיקה עצמית (זמנית)</option>
              <option value="admin_soft_hide">הסתרה (אדמין)</option>
              <option value="hard_delete">מחיקה קבועה (משתמש)</option>
              <option value="admin_hard_delete">מחיקה קבועה (אדמין)</option>
            </select>
          </div>

          {/* Actor kind */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">מבצע</label>
            <select
              value={filters.actor_kind}
              onChange={e => setFilters(f => ({ ...f, actor_kind: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:focus:border-zinc-500"
            >
              <option value="">הכל</option>
              <option value="user">משתמש</option>
              <option value="admin">אדמין</option>
              <option value="system">מערכת</option>
            </select>
          </div>
        </div>

        {/* Row 2: date range */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Quick-range buttons */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">טווח מהיר</label>
            <div className="flex gap-1">
              {QUICK_RANGES.map(({ label, days }) => {
                const isActive = currentRange === days
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => applyQuickRange(days)}
                    className={
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ' +
                      (isActive
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

          {/* From date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">מתאריך</label>
            <div className="flex items-center gap-1">
              <input
                ref={fromRef}
                type="date"
                value={filters.from}
                onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:focus:border-zinc-500"
              />
              <button
                type="button"
                aria-label="בחר תאריך התחלה"
                onClick={() => openDatePicker(fromRef)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-500 dark:hover:bg-muted/50"
              >
                <CalendarDays size={14} />
              </button>
            </div>
          </div>

          {/* To date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">עד תאריך</label>
            <div className="flex items-center gap-1">
              <input
                ref={toRef}
                type="date"
                value={filters.to}
                onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:focus:border-zinc-500"
              />
              <button
                type="button"
                aria-label="בחר תאריך סיום"
                onClick={() => openDatePicker(toRef)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-500 dark:hover:bg-muted/50"
              >
                <CalendarDays size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: text search */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Title / slug search */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">כותרת / slug</label>
            <div className="relative">
              <Search size={13} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={draftQ}
                onChange={e => setDraftQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyTextSearch()}
                placeholder="חפש כותרת…"
                className="w-[160px] rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-3 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Author display name search */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">שם מחבר</label>
            <div className="relative">
              <Search size={13} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={draftAuthor}
                onChange={e => setDraftAuthor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyTextSearch()}
                placeholder="חפש מחבר…"
                className="w-[160px] rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-3 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-zinc-500"
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

      {/* ── Count ── */}
      {!loading && !err && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {total === 0
            ? 'אין אירועים'
            : `${total.toLocaleString('he-IL')} אירועים בסה״כ`}
          {events.length > 0 && events.length < total
            ? ` · מוצגים ${events.length}`
            : ''}
        </p>
      )}

      {/* ── States ── */}
      {err     && <ErrorBanner message={err} onRetry={() => load(0, false)} />}
      {loading && <TableSkeleton rows={6} />}

      {!loading && !err && events.length === 0 && (
        <EmptyState title="אין היסטוריית מחיקות" icon={<Clock size={36} strokeWidth={1.5} />} />
      )}

      {/* ── Events table ── */}
      {!loading && events.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-border dark:bg-card">
          {/* Header — desktop only */}
          <div className="hidden grid-cols-[160px_180px_1fr_160px_160px] gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5 text-xs font-medium text-neutral-500 sm:grid dark:border-border dark:bg-muted/30 dark:text-neutral-400">
            <span>זמן</span>
            <span>פעולה</span>
            <span>פוסט</span>
            <span>מחק / הסתיר</span>
            <span>מחבר הפוסט</span>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-border">
            {events.map((ev) => {
              const snap      = ev.post_snapshot
              const isHard    = IS_HARD(ev.action)
              const postTitle = snap.title || '(ללא כותרת)'
              const postSlug  = snap.slug

              return (
                <div
                  key={ev.id}
                  className="grid grid-cols-1 gap-2 px-4 py-3 text-sm transition-colors hover:bg-neutral-50 sm:grid-cols-[160px_180px_1fr_160px_160px] sm:items-center sm:gap-3 dark:hover:bg-muted/30"
                >
                  {/* Time */}
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{fmtDateTime(ev.created_at)}</div>

                  {/* Action */}
                  <div><ActionBadge action={ev.action} /></div>

                  {/* Post */}
                  <div className="min-w-0">
                    {isHard || !postSlug ? (
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{postTitle}</span>
                    ) : (
                      <a
                        href={`/post/${postSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {postTitle}
                      </a>
                    )}
                    {postSlug && (
                      <div className="mt-0.5 font-mono text-xs text-neutral-400 dark:text-neutral-500">{postSlug}</div>
                    )}
                    {ev.reason && (
                      <div className="mt-1 rounded border border-neutral-100 bg-neutral-50 px-2 py-1 text-xs text-neutral-500 dark:border-border dark:bg-muted/30 dark:text-neutral-400">
                        סיבה: {ev.reason}
                      </div>
                    )}
                  </div>

                  {/* Actor */}
                  <ProfileCell profile={ev.actor_profile} userId={ev.actor_user_id} />

                  {/* Author */}
                  <ProfileCell profile={ev.author_profile} userId={snap.author_id} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Load more ── */}
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
