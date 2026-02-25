'use client'

import { useState, useCallback } from 'react'
import { Search, Shield } from 'lucide-react'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import ErrorBanner from './ErrorBanner'
import { TableSkeleton } from './AdminSkeleton'

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type RecentEvent = {
  id: string
  created_at: string
  action: string
  actor_role: 'admin' | 'moderator'
  target_type: 'comment' | 'note'
  target_id: string
  reason: string
  snapshot: Record<string, unknown>
  author_profile: Profile | null
}

type StatsResult = {
  deleted_comments: number
  deleted_notes: number
  total: number
  by_actor_role: { admin: number; moderator: number }
  recent_events: RecentEvent[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function profileName(p: Profile | null, fallbackId?: string | null): string {
  if (!p) return fallbackId ? fallbackId.slice(0, 8) + '…' : '—'
  return p.display_name || (p.username ? `@${p.username}` : p.id.slice(0, 8) + '…')
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value.toLocaleString('he-IL')}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
    </div>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ModerationStatsTab() {
  const [query,   setQuery]   = useState('')
  const [userId,  setUserId]  = useState('')
  const [stats,   setStats]   = useState<StatsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  const search = useCallback(async (rawQuery: string) => {
    const q = rawQuery.trim()
    if (!q) return

    setLoading(true)
    setErr(null)
    setStats(null)
    setUserId('')

    try {
      // Determine if input is a UUID or display_name search
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)
      let resolvedId = isUuid ? q : null

      if (!resolvedId) {
        // Resolve display_name → user_id via /api/admin/users/search
        const r = await adminFetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`)
        const j: unknown = await r.json()
        if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה'))
        const data  = j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
        const users = Array.isArray(data.users) ? (data.users as Record<string, unknown>[]) : []
        if (users.length === 0) throw new Error('לא נמצא משתמש')
        const first = users[0]
        resolvedId = typeof first.id === 'string' ? first.id : null
        if (!resolvedId) throw new Error('לא נמצא מזהה משתמש')
      }

      setUserId(resolvedId)

      const r2 = await adminFetch(`/api/admin/moderation/stats?userId=${encodeURIComponent(resolvedId)}`)
      const j2: unknown = await r2.json()
      if (!r2.ok) throw new Error(getAdminErrorMessage(j2, 'שגיאה'))

      const data2 = j2 && typeof j2 === 'object' ? (j2 as Record<string, unknown>) : {}
      setStats({
        deleted_comments: typeof data2.deleted_comments === 'number' ? data2.deleted_comments : 0,
        deleted_notes:    typeof data2.deleted_notes    === 'number' ? data2.deleted_notes    : 0,
        total:            typeof data2.total            === 'number' ? data2.total            : 0,
        by_actor_role: {
          admin:     typeof (data2.by_actor_role as Record<string,unknown>)?.admin     === 'number'
                       ? (data2.by_actor_role as Record<string,number>).admin     : 0,
          moderator: typeof (data2.by_actor_role as Record<string,unknown>)?.moderator === 'number'
                       ? (data2.by_actor_role as Record<string,number>).moderator : 0,
        },
        recent_events: Array.isArray(data2.recent_events)
          ? (data2.recent_events as RecentEvent[])
          : [],
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="space-y-5">

      {/* Search bar */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500">
            חיפוש לפי שם משתמש או UUID
          </label>
          <div className="relative">
            <Search size={13} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(query)}
              placeholder="שם / UUID…"
              className="w-[260px] rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-3 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => search(query)}
          disabled={loading || !query.trim()}
          className="rounded-lg border border-neutral-200 bg-white px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        >
          {loading ? 'טוען…' : 'חפש'}
        </button>
      </div>

      {err     && <ErrorBanner message={err} onRetry={() => search(query)} />}
      {loading && <TableSkeleton rows={3} />}

      {/* UUID display */}
      {userId && !loading && (
        <p className="font-mono text-xs text-neutral-400">UUID: {userId}</p>
      )}

      {/* Stats cards */}
      {stats && !loading && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="תגובות שנמחקו" value={stats.deleted_comments} />
            <StatCard label="הערות שנמחקו"  value={stats.deleted_notes} />
            <StatCard label="ע״י אדמין"     value={stats.by_actor_role.admin} />
            <StatCard label="ע״י מודרטור"   value={stats.by_actor_role.moderator} />
          </div>

          {/* Recent events */}
          {stats.recent_events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-neutral-400">
              <Shield size={32} strokeWidth={1.5} />
              <p className="text-sm">אין היסטוריית מחיקות למשתמש זה</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2.5 text-xs font-medium text-neutral-500">
                20 הפעולות האחרונות
              </div>

              <div className="hidden grid-cols-[140px_70px_1fr_150px] gap-3 border-b border-neutral-100 px-4 py-2 text-xs text-neutral-400 sm:grid">
                <span>זמן</span>
                <span>סוג</span>
                <span>תמצית / סיבה</span>
                <span>משתמש מושפע</span>
              </div>

              <div className="divide-y divide-neutral-100">
                {stats.recent_events.map(ev => {
                  const snap    = ev.snapshot
                  const excerpt = typeof snap.excerpt === 'string' ? snap.excerpt.slice(0, 80) : null

                  return (
                    <div
                      key={ev.id}
                      className="grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[140px_70px_1fr_150px] sm:items-center sm:gap-3"
                    >
                      <div className="text-xs text-neutral-500">{fmtDateTime(ev.created_at)}</div>
                      <div><TargetBadge targetType={ev.target_type} /></div>
                      <div className="min-w-0">
                        {excerpt && (
                          <p className="truncate text-xs text-neutral-600">{excerpt}</p>
                        )}
                        <p className="mt-0.5 truncate text-xs text-neutral-400">
                          סיבה: {ev.reason}
                        </p>
                      </div>
                      <ProfileCell profile={ev.author_profile} userId={null} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
