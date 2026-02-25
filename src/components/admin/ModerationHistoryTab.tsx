'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Shield, Search, CalendarDays } from 'lucide-react'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import ErrorBanner from './ErrorBanner'
import EmptyState from './EmptyState'
import { TableSkeleton } from './AdminSkeleton'

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ActorEntry = {
  id: string
  role: 'admin' | 'moderator'
  profile: Profile | null
}

type ModerationEvent = {
  id: string
  created_at: string
  action: string
  actor_user_id: string
  actor_role: 'admin' | 'moderator'
  target_type: 'comment' | 'note'
  target_id: string
  target_post_id: string | null
  target_author_id: string
  reason: string
  snapshot: Record<string, unknown>
  actor_profile: Profile | null
  author_profile: Profile | null
}

type Filters = {
  actor_user_id: string
  actor_role: string
  target_type: string
  author: string
  from: string
  to: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

type QuickRange = { label: string; days: number | null }
const QUICK_RANGES: QuickRange[] = [
  { label: 'הכל',     days: null },
  { label: '30 יום',  days: 30   },
  { label: '60 יום',  days: 60   },
  { label: '180 יום', days: 180  },
]

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
  try { ref.current?.showPicker() } catch { /* not supported */ }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TargetBadge({ targetType }: { targetType: string }) {
  if (targetType === 'comment') {
    return (
      <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
        תגובה
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
      הערה
    </span>
  )
}

function RoleBadge({ role }: { role: 'admin' | 'moderator' }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
        אדמין
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-md border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700">
      מוד׳
    </span>
  )
}

function ProfileCell({ profile, userId }: { profile: Profile | null; userId: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Avatar src={profile?.avatar_url} name={profileName(profile, userId)} size={20} />
      <span className="truncate text-xs text-neutral-700">{profileName(profile, userId)}</span>
    </div>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function EventDrawer({ event, onClose }: { event: ModerationEvent; onClose: () => void }) {
  const snap    = event.snapshot
  const excerpt = typeof snap.excerpt === 'string' ? snap.excerpt : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-900">פרטי אירוע מודרציה</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-xs text-neutral-500">זמן</dt>
            <dd className="text-neutral-800">{fmtDateTime(event.created_at)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-xs text-neutral-500">סוג יעד</dt>
            <dd><TargetBadge targetType={event.target_type} /></dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-xs text-neutral-500">מבצע</dt>
            <dd className="flex items-center gap-2 min-w-0">
              <RoleBadge role={event.actor_role} />
              <ProfileCell profile={event.actor_profile} userId={event.actor_user_id} />
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-xs text-neutral-500">מחבר</dt>
            <dd className="min-w-0">
              <ProfileCell profile={event.author_profile} userId={event.target_author_id} />
            </dd>
          </div>
          {event.target_post_id && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-xs text-neutral-500">פוסט</dt>
              <dd className="font-mono text-xs text-neutral-500 break-all">{event.target_post_id}</dd>
            </div>
          )}
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-xs text-neutral-500">מזהה יעד</dt>
            <dd className="font-mono text-xs text-neutral-500 break-all">{event.target_id}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-xs text-neutral-500">סיבה</dt>
            <dd className="text-neutral-800">{event.reason}</dd>
          </div>
          {excerpt && (
            <div>
              <dt className="mb-1 text-xs text-neutral-500">תוכן (תמצית)</dt>
              <dd className="rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700 whitespace-pre-wrap">
                {excerpt}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ModerationHistoryTab() {
  const [filters, setFilters] = useState<Filters>({
    actor_user_id: '', actor_role: '', target_type: '', author: '', from: '', to: '',
  })
  const [draftAuthor, setDraftAuthor] = useState('')

  const [events,      setEvents]      = useState<ModerationEvent[]>([])
  const [total,       setTotal]       = useState(0)
  const [actors,      setActors]      = useState<ActorEntry[]>([])
  const [offset,      setOffset]      = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [err,         setErr]         = useState<string | null>(null)
  const [drawer,      setDrawer]      = useState<ModerationEvent | null>(null)

  const fromRef = useRef<HTMLInputElement>(null)
  const toRef   = useRef<HTMLInputElement>(null)

  // ── Data fetching ────────────────────────────────────────────────────────

  const load = useCallback(async (currentOffset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true)
    setErr(null)

    try {
      const params = new URLSearchParams({
        limit:  String(PAGE_SIZE),
        offset: String(currentOffset),
      })
      if (filters.actor_user_id) params.set('actor_user_id', filters.actor_user_id)
      if (filters.actor_role)    params.set('actor_role',    filters.actor_role)
      if (filters.target_type)   params.set('target_type',   filters.target_type)
      if (filters.author)        params.set('author',        filters.author)
      if (filters.from)          params.set('from',          filters.from)
      if (filters.to)            params.set('to',            filters.to)

      const r = await adminFetch(`/api/admin/moderation/history?${params}`)
      const j: unknown = await r.json()
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה'))

      const data = j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
      const newEvents = Array.isArray(data.events) ? (data.events as ModerationEvent[]) : []
      const newTotal  = typeof data.total === 'number' ? data.total : 0
      const newActors = Array.isArray(data.actors) ? (data.actors as ActorEntry[]) : []

      setEvents(prev => append ? [...prev, ...newEvents] : newEvents)
      setTotal(newTotal)
      if (!append && newActors.length) setActors(newActors)
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

  // ── Actions ──────────────────────────────────────────────────────────────

  function applyAuthorSearch() {
    setFilters(f => ({ ...f, author: draftAuthor.trim() }))
  }

  function applyQuickRange(days: number | null) {
    if (days === null) {
      setFilters(f => ({ ...f, from: '', to: '' }))
    } else {
      setFilters(f => ({ ...f, from: isoDaysAgo(days), to: isoToday() }))
    }
  }

  function clearAll() {
    setFilters({ actor_user_id: '', actor_role: '', target_type: '', author: '', from: '', to: '' })
    setDraftAuthor('')
  }

  function handleLoadMore() {
    const next = offset + PAGE_SIZE
    setOffset(next)
    load(next, true)
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const hasMore    = events.length < total
  const hasFilters = !!(filters.actor_user_id || filters.actor_role || filters.target_type ||
                        filters.author || filters.from || filters.to)

  function activeRange(): number | null | undefined {
    if (!filters.from && !filters.to) return null
    for (const { days } of QUICK_RANGES) {
      if (days !== null && filters.from === isoDaysAgo(days) && filters.to === isoToday()) return days
    }
    return undefined
  }
  const currentRange = activeRange()

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="space-y-4">

      {/* ── Filters panel ── */}
      <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">

        {/* Row 1: dropdowns */}
        <div className="flex flex-wrap items-end gap-3">

          {/* Actor dropdown (active admins/mods from env) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">מבצע</label>
            <select
              value={filters.actor_user_id}
              onChange={e => setFilters(f => ({ ...f, actor_user_id: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
            >
              <option value="">הכל</option>
              {actors.map(a => (
                <option key={a.id} value={a.id}>
                  {profileName(a.profile, a.id)} ({a.role === 'admin' ? 'אדמין' : 'מוד׳'})
                </option>
              ))}
            </select>
          </div>

          {/* Actor role */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">תפקיד</label>
            <select
              value={filters.actor_role}
              onChange={e => setFilters(f => ({ ...f, actor_role: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
            >
              <option value="">הכל</option>
              <option value="admin">אדמין</option>
              <option value="moderator">מודרטור</option>
            </select>
          </div>

          {/* Target type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">סוג תוכן</label>
            <select
              value={filters.target_type}
              onChange={e => setFilters(f => ({ ...f, target_type: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
            >
              <option value="">הכל</option>
              <option value="comment">תגובות</option>
              <option value="note">הערות קהילה</option>
            </select>
          </div>
        </div>

        {/* Row 2: date range */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">טווח מהיר</label>
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
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50')
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">מתאריך</label>
            <div className="flex items-center gap-1">
              <input
                ref={fromRef}
                type="date"
                value={filters.from}
                onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
              />
              <button
                type="button"
                aria-label="בחר תאריך התחלה"
                onClick={() => openDatePicker(fromRef)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50"
              >
                <CalendarDays size={14} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">עד תאריך</label>
            <div className="flex items-center gap-1">
              <input
                ref={toRef}
                type="date"
                value={filters.to}
                onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
              />
              <button
                type="button"
                aria-label="בחר תאריך סיום"
                onClick={() => openDatePicker(toRef)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50"
              >
                <CalendarDays size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: author search */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">שם משתמש מושפע</label>
            <div className="relative">
              <Search size={13} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={draftAuthor}
                onChange={e => setDraftAuthor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyAuthorSearch()}
                placeholder="חפש שם משתמש…"
                className="w-[200px] rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-3 text-sm outline-none focus:border-neutral-400"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={applyAuthorSearch}
            className="self-end rounded-lg border border-neutral-200 bg-white px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            חפש
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="self-end rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-50"
            >
              נקה
            </button>
          )}
        </div>
      </div>

      {/* ── Count ── */}
      {!loading && !err && (
        <p className="text-xs text-neutral-400">
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
        <EmptyState title="אין היסטוריית מודרציה" icon={<Shield size={36} strokeWidth={1.5} />} />
      )}

      {/* ── Events table ── */}
      {!loading && events.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {/* Header */}
          <div className="hidden grid-cols-[140px_80px_80px_1fr_150px_150px] gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5 text-xs font-medium text-neutral-500 sm:grid">
            <span>זמן</span>
            <span>סוג</span>
            <span>תפקיד</span>
            <span>תמצית / סיבה</span>
            <span>מבצע</span>
            <span>משתמש מושפע</span>
          </div>

          <div className="divide-y divide-neutral-100">
            {events.map((ev) => {
              const snap    = ev.snapshot
              const excerpt = typeof snap.excerpt === 'string' ? snap.excerpt.slice(0, 80) : null

              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setDrawer(ev)}
                  className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-right text-sm transition-colors hover:bg-neutral-50 sm:grid-cols-[140px_80px_80px_1fr_150px_150px] sm:items-center sm:gap-3"
                >
                  <div className="text-xs text-neutral-500">{fmtDateTime(ev.created_at)}</div>
                  <div><TargetBadge targetType={ev.target_type} /></div>
                  <div><RoleBadge role={ev.actor_role} /></div>
                  <div className="min-w-0 text-right">
                    {excerpt && (
                      <p className="truncate text-xs text-neutral-600">{excerpt}</p>
                    )}
                    <p className="mt-0.5 truncate text-xs text-neutral-400">
                      סיבה: {ev.reason}
                    </p>
                  </div>
                  <ProfileCell profile={ev.actor_profile} userId={ev.actor_user_id} />
                  <ProfileCell profile={ev.author_profile} userId={ev.target_author_id} />
                </button>
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
            className="rounded-lg border border-neutral-200 bg-white px-5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loadingMore ? 'טוען…' : 'טען עוד'}
          </button>
        </div>
      )}

      {/* ── Detail drawer ── */}
      {drawer && <EventDrawer event={drawer} onClose={() => setDrawer(null)} />}
    </div>
  )
}
