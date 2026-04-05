'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { adminFetch } from '@/lib/admin/adminFetch'
import PageHeader from '@/components/admin/PageHeader'
import { getUserHistoryActionLabel } from '@/lib/admin/userModerationHistory'
import { buildAdminUserSearchHref } from '@/lib/admin/adminUsersHref'
import { getProfileIdentityChangeLines } from '@/lib/admin/profileIdentityAudit'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import {
  ArrowRight,
  LogIn,
  LogOut,
  UserPlus,
  KeyRound,
  AlertTriangle,
  ShieldBan,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Trash2,
  MessageSquareX,
  ExternalLink,
  RefreshCcw,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string | null
}

type Moderation = {
  is_suspended: boolean
  reason: string | null
  suspended_at: string | null
  suspended_by: string | null
  is_banned: boolean
  ban_reason: string | null
  banned_at: string | null
  banned_by: string | null
} | null

type Post = {
  id: string
  title: string
  slug: string
  status: string
  created_at: string
  deleted_at: string | null
  is_anonymous: boolean
}

type AuditEvent = {
  id: string
  event: string
  ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type ModerationEvent = {
  id: string
  action: string
  reason: string
  actor_user_id: string
  actor_role: string
  target_type: string
  target_id: string
  created_at: string
}

type AccountActionEvent = {
  id: string
  action: string
  reason: string | null
  created_at: string
}

type TimelineData = {
  profile: Profile
  moderation: Moderation
  posts: Post[]
  auditEvents: AuditEvent[]
  moderationEvents: ModerationEvent[]
  accountActions: AccountActionEvent[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function StatusBadge({ mod }: { mod: Moderation }) {
  if (!mod) return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
      <ShieldCheck size={12} /> רגיל
    </span>
  )
  if (mod.is_banned) return (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
      <ShieldBan size={12} /> חסום
    </span>
  )
  if (mod.is_suspended) return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
      <ShieldAlert size={12} /> מוגבל
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
      <ShieldCheck size={12} /> רגיל
    </span>
  )
}

function PostStatusBadge({ post }: { post: Post }) {
  if (post.deleted_at) return (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
      <Trash2 size={10} /> נמחק
    </span>
  )
  if (post.status === 'published') return (
    <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
      פורסם
    </span>
  )
  return (
    <span className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-muted/40 dark:text-neutral-400">
      {post.status}
    </span>
  )
}

// ── Timeline item types ────────────────────────────────────────────────────

type TimelineItem =
  | { kind: 'audit'; ts: string; data: AuditEvent }
  | { kind: 'moderation'; ts: string; data: ModerationEvent }
  | { kind: 'account'; ts: string; data: AccountActionEvent }

function auditConfig(event: string): { label: string; icon: React.ReactNode; cls: string } {
  if (event === 'profile_identity_updated') {
    return {
      label: 'שינוי זהות',
      icon: <RefreshCcw size={14} />,
      cls: 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-400',
    }
  }

  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    login_success:         { label: 'כניסה',          icon: <LogIn size={14} />,          cls: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400' },
    login_failed:          { label: 'כישלון כניסה',   icon: <AlertTriangle size={14} />,  cls: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400' },
    logout:                { label: 'יציאה',           icon: <LogOut size={14} />,         cls: 'bg-neutral-50 border-neutral-200 text-neutral-600 dark:bg-muted/40 dark:border-border dark:text-neutral-400' },
    signup:                { label: 'הרשמה',           icon: <UserPlus size={14} />,       cls: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-400' },
    password_reset:        { label: 'איפוס סיסמה',    icon: <KeyRound size={14} />,       cls: 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-500/10 dark:border-purple-500/30 dark:text-purple-400' },
    token_refresh_failed:  { label: 'פג תוקף',        icon: <RefreshCcw size={14} />,     cls: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-400' },
  }
  return map[event] ?? { label: event, icon: <AlertTriangle size={14} />, cls: 'bg-neutral-50 border-neutral-200 text-neutral-600 dark:bg-muted/40 dark:border-border dark:text-neutral-400' }
}

function moderationActionLabel(action: string): string {
  const map: Record<string, string> = {
    delete_comment: 'הסרת תגובה',
    delete_note:    'הסרת פתק',
  }
  return map[action] ?? action
}

function AuditMetadataPreview({
  event,
  metadata,
}: {
  event: string
  metadata: Record<string, unknown> | null
}) {
  if (!metadata || Object.keys(metadata).length === 0) return null

  if (event === 'profile_identity_updated') {
    const lines = getProfileIdentityChangeLines(metadata)

    if (lines.length > 0) {
      return (
        <div className="mt-1.5 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          {lines.map((line) => (
            <div key={line.key}>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{line.label}:</span>{' '}
              <span>{line.previous}</span>
              <span className="mx-1 text-neutral-300 dark:text-neutral-600">→</span>
              <span>{line.next}</span>
            </div>
          ))}
        </div>
      )
    }
  }

  return (
    <div className="mt-1.5 font-mono text-[11px] text-neutral-400 break-words dark:text-neutral-500">
      {JSON.stringify(metadata)}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function UserTimelinePage() {
  const params = useParams()
  const userId = typeof params.id === 'string' ? params.id : ''

  const [data, setData]     = useState<TimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/timeline`)
        const json: unknown = await res.json()
        if (!res.ok) {
          const msg = (typeof json === 'object' && json !== null && 'error' in json)
            ? String((json as { error: unknown }).error)
            : `HTTP ${res.status}`
          throw new Error(msg)
        }
        if (!cancelled) setData(json as TimelineData)
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [userId])

  const timeline: TimelineItem[] = data
    ? [
        ...data.auditEvents.map((e): TimelineItem => ({ kind: 'audit', ts: e.created_at, data: e })),
        ...data.moderationEvents.map((e): TimelineItem => ({ kind: 'moderation', ts: e.created_at, data: e })),
        ...data.accountActions.map((e): TimelineItem => ({ kind: 'account', ts: e.created_at, data: e })),
      ].sort((a, b) => b.ts.localeCompare(a.ts))
    : []

  const displayName = data?.profile.display_name || data?.profile.username || userId.slice(0, 8)

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-3">
        <Link
          href={buildAdminUserSearchHref({
            userId,
            displayName: data?.profile.display_name ?? null,
            username: data?.profile.username ?? null,
          })}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-foreground"
        >
          <ArrowRight size={14} />
          משתמשים
        </Link>
        <span className="text-neutral-300 dark:text-neutral-600">/</span>
        <span className="text-sm font-medium text-neutral-700 truncate max-w-[200px] dark:text-neutral-300">
          {displayName}
        </span>
      </div>

      <PageHeader
        title={`ציר זמן: ${displayName}`}
        description={`מזהה: ${userId}`}
        actions={
          <Link
            href={`/admin/users/history?q=${encodeURIComponent(userId)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
          >
            היסטוריה גלובלית
          </Link>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-border dark:bg-card">
          <TableSkeleton rows={6} />
        </div>
      ) : data ? (
        <div className="space-y-4">

          {/* ── User profile card ─────────────────────────────────────── */}
          <div className="flex flex-wrap items-start gap-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-border dark:bg-card">
            {data.profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.profile.avatar_url}
                alt=""
                className="h-14 w-14 rounded-full object-cover bg-neutral-100"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-xl font-bold text-neutral-400 dark:bg-muted/40 dark:text-neutral-500">
                {(data.profile.display_name || data.profile.username || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900 dark:text-foreground">{displayName}</h2>
                <StatusBadge mod={data.moderation} />
              </div>
              <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                @{data.profile.username ?? '—'} · נרשם {fmt(data.profile.created_at)}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-neutral-300 dark:text-neutral-600">{data.profile.id}</p>
            </div>
            <Link
              href={buildAdminUserSearchHref({
                userId,
                displayName: data.profile.display_name,
                username: data.profile.username,
              })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
            >
              ניהול משתמש
            </Link>
          </div>

          {/* ── Moderation status detail ──────────────────────────────── */}
          {data.moderation && (data.moderation.is_banned || data.moderation.is_suspended) && (
            <div className={`rounded-xl border p-4 text-sm ${data.moderation.is_banned ? 'border-red-200 bg-red-50/40 dark:border-red-500/30 dark:bg-red-500/10' : 'border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/10'}`}>
              <div className="font-semibold text-neutral-900 dark:text-foreground">
                {data.moderation.is_banned ? 'חסום לצמיתות' : 'מוגבל (השעיה זמנית)'}
              </div>
              <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                {data.moderation.is_banned
                  ? `${fmt(data.moderation.banned_at)} · ${data.moderation.ban_reason ?? 'ללא סיבה'}`
                  : `${fmt(data.moderation.suspended_at)} · ${data.moderation.reason ?? 'ללא סיבה'}`}
              </div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">

            {/* ── Activity timeline ─────────────────────────────────────── */}
            <div className="rounded-xl border border-neutral-200 bg-white dark:border-border dark:bg-card">
              <div className="border-b border-neutral-100 px-5 py-3 dark:border-border">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-foreground">
                  פעילות ({timeline.length})
                </h3>
              </div>

              {timeline.length === 0 ? (
                <EmptyState title="אין פעילות מתועדת" icon={<AlertTriangle size={28} strokeWidth={1.5} />} />
              ) : (
                <ul className="divide-y divide-neutral-50 max-h-[65vh] overflow-y-auto dark:divide-border">
                  {timeline.map((item) => {
                    if (item.kind === 'audit') {
                      const cfg = auditConfig(item.data.event)
                      return (
                        <li key={item.data.id} className="flex items-start gap-3 px-5 py-3">
                          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${cfg.cls}`}>
                            {cfg.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-neutral-900 dark:text-foreground">{cfg.label}</span>
                              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{fmt(item.ts)}</span>
                            </div>
                            {item.data.ip && (
                              <div className="mt-0.5 font-mono text-[11px] text-neutral-400 dark:text-neutral-500">
                                {item.data.ip}
                              </div>
                            )}
                            <AuditMetadataPreview
                              event={item.data.event}
                              metadata={item.data.metadata}
                            />
                          </div>
                        </li>
                      )
                    }

                    if (item.kind === 'account') {
                      return (
                        <li key={item.data.id} className="flex items-start gap-3 px-5 py-3">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-border dark:bg-muted/40 dark:text-neutral-400">
                            <ShieldAlert size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-neutral-900 dark:text-foreground">
                                {getUserHistoryActionLabel(item.data.action)}
                              </span>
                              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{fmt(item.ts)}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                              {item.data.reason ?? 'ללא סיבה מפורטת'}
                            </div>
                          </div>
                        </li>
                      )
                    }

                    // moderation event
                    return (
                      <li key={item.data.id} className="flex items-start gap-3 px-5 py-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                          <MessageSquareX size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-neutral-900 dark:text-foreground">
                              {moderationActionLabel(item.data.action)}
                            </span>
                            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{fmt(item.ts)}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                            {item.data.reason}
                          </div>
                          <div className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                            {item.data.actor_role} · {item.data.target_type}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* ── Posts ────────────────────────────────────────────────── */}
            <div className="rounded-xl border border-neutral-200 bg-white dark:border-border dark:bg-card">
              <div className="border-b border-neutral-100 px-5 py-3 dark:border-border">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-foreground">
                  פוסטים ({data.posts.length})
                </h3>
              </div>

              {data.posts.length === 0 ? (
                <EmptyState title="אין פוסטים" icon={<FileText size={28} strokeWidth={1.5} />} />
              ) : (
                <ul className="divide-y divide-neutral-50 max-h-[65vh] overflow-y-auto dark:divide-border">
                  {data.posts.map((post) => (
                    <li key={post.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-sm font-medium text-neutral-900 leading-snug dark:text-foreground">
                          {post.is_anonymous ? <em className="text-neutral-400 dark:text-neutral-500">אנונימי — {post.title}</em> : post.title}
                        </span>
                        {!post.is_anonymous && !post.deleted_at && post.status === 'published' && (
                          <a
                            href={`/post/${post.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 shrink-0 text-neutral-300 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <PostStatusBadge post={post} />
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{fmt(post.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
