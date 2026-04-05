"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import { buildAdminUserSearchHref } from '@/lib/admin/adminUsersHref'
import PageHeader from '@/components/admin/PageHeader'
import FilterTabs from '@/components/admin/FilterTabs'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import {
  Users,
  Search,
  RefreshCw,
  ShieldBan,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  EyeOff,
  UserX,
  History,
  RotateCcw,
} from 'lucide-react'

type Moderation = {
  is_suspended: boolean
  reason: string | null
  suspended_at: string | null
  suspended_by?: string | null

  is_banned: boolean
  ban_reason: string | null
  banned_at: string | null
  banned_by?: string | null
}

type UserRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string | null
  content_hidden_count?: number
  moderation: Moderation
}

type ApiResp = {
  ok?: boolean
  error?: unknown
  users?: UserRow[]
  user?: UserRow
}

function isApiResp(v: unknown): v is ApiResp {
  return typeof v === 'object' && v !== null
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('he-IL')
  } catch {
    return iso
  }
}

type Tab = 'search' | 'limited' | 'banned'

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'banned', label: 'חסומים' },
  { value: 'limited', label: 'מוגבלים' },
  { value: 'search', label: 'חיפוש' },
]

type ConfirmAction = 'hide' | 'restore_content' | 'purge' | 'anonymize' | 'hard_delete'

export default function AdminUsersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const requestedQuery = searchParams.get('q') ?? ''
  const focusUserId = searchParams.get('focusUserId') ?? ''
  const initialTab: Tab =
    requestedTab === 'search' || requestedTab === 'limited' || requestedTab === 'banned'
      ? requestedTab
      : 'banned'

  const [tab, setTab] = useState<Tab>(initialTab)

  // search
  const [q, setQ] = useState(requestedQuery)
  const canSearch = useMemo(() => q.trim().length >= 2, [q])
  const [searchUsers, setSearchUsers] = useState<UserRow[]>([])
  const appliedFocusUserIdRef = useRef<string | null>(null)

  // lists
  const [limitedUsers, setLimitedUsers] = useState<UserRow[]>([])
  const [bannedUsers, setBannedUsers] = useState<UserRow[]>([])

  // selection & inputs
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [limitedReason, setLimitedReason] = useState('')
  const [banReason, setBanReason] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // confirm dialog
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  // hard-delete double confirmation state
  const [hardDeleteConfirmText, setHardDeleteConfirmText] = useState('')
  const [hardDeleteCheck, setHardDeleteCheck] = useState(false)
  const [hardDeleteReason, setHardDeleteReason] = useState('')
  const [anonymizeConfirmText, setAnonymizeConfirmText] = useState('')
  const [anonymizeCheck, setAnonymizeCheck] = useState(false)
  const [anonymizeReason, setAnonymizeReason] = useState('')
  const hardDeleteReady =
    hardDeleteConfirmText === 'DELETE' &&
    hardDeleteCheck &&
    hardDeleteReason.trim().length >= 15
  const anonymizeReady =
    anonymizeConfirmText === 'ANONYMIZE' &&
    anonymizeCheck &&
    anonymizeReason.trim().length >= 10

  const loadLimited = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch('/api/admin/users/suspended?limit=200')
      const json: unknown = await res.json()
      if (!isApiResp(json)) throw new Error('תגובה לא צפויה מהשרת')
      if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      setLimitedUsers(Array.isArray(json.users) ? json.users : [])
    } catch (e: unknown) {
      setLimitedUsers([])
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setLoading(false)
    }
  }

  const loadBanned = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch('/api/admin/users/banned?limit=200')
      const json: unknown = await res.json()
      if (!isApiResp(json)) throw new Error('תגובה לא צפויה מהשרת')
      if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      setBannedUsers(Array.isArray(json.users) ? json.users : [])
    } catch (e: unknown) {
      setBannedUsers([])
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setLoading(false)
    }
  }

  const runSearch = useCallback(async () => {
    if (!canSearch && !focusUserId) {
      setSearchUsers([])
      if (tab === 'search') setSelected(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (focusUserId) params.set('user_id', focusUserId)

      const res = await adminFetch(`/api/admin/users/search?${params.toString()}`)
      const json: unknown = await res.json()
      if (!isApiResp(json)) throw new Error('תגובה לא צפויה מהשרת')
      if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      setSearchUsers(Array.isArray(json.users) ? json.users : [])
    } catch (e: unknown) {
      setSearchUsers([])
      setSelected(null)
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setLoading(false)
    }
  }, [canSearch, focusUserId, q, tab])

  const syncSelectionUrl = useCallback((nextUser: UserRow | null, nextTab: Tab = tab) => {
    const href = buildAdminUserSearchHref({
      userId: nextUser?.id ?? null,
      displayName:
        nextTab === 'search'
          ? nextUser?.display_name ?? q
          : nextUser?.display_name ?? null,
      username:
        nextTab === 'search'
          ? nextUser?.username ?? null
          : nextUser?.username ?? null,
    })

    const nextUrl =
      nextTab === 'search'
        ? href
        : `/admin/users?tab=${encodeURIComponent(nextTab)}${nextUser ? `&focusUserId=${encodeURIComponent(nextUser.id)}` : ''}`

    if (`?${searchParams.toString()}` === nextUrl.slice('/admin/users'.length)) return
    router.replace(nextUrl, { scroll: false })
  }, [q, router, searchParams, tab])

  useEffect(() => {
    void loadBanned()
    void loadLimited()
  }, [])

  useEffect(() => {
    const nextTab: Tab =
      requestedTab === 'search' || requestedTab === 'limited' || requestedTab === 'banned'
        ? requestedTab
        : 'banned'

    setTab((prev) => (prev === nextTab ? prev : nextTab))
    setQ((prev) => (prev === requestedQuery ? prev : requestedQuery))

    if (!focusUserId) {
      appliedFocusUserIdRef.current = null
    }
  }, [focusUserId, requestedQuery, requestedTab])

  useEffect(() => {
    if (tab !== 'search') return
    const t = window.setTimeout(() => void runSearch(), 300)
    return () => window.clearTimeout(t)
  }, [runSearch, tab])

  useEffect(() => {
    setLimitedReason(selected?.moderation.reason || '')
    setBanReason(selected?.moderation.ban_reason || '')
  }, [selected])

  const list: UserRow[] = useMemo(() => {
    if (tab === 'banned') return bannedUsers
    if (tab === 'limited') return limitedUsers
    return searchUsers
  }, [bannedUsers, limitedUsers, searchUsers, tab])

  const selectUser = useCallback(async (u: UserRow) => {
    setSelected(u)
    syncSelectionUrl(u)
    try {
      const res = await adminFetch(`/api/admin/users/status?user_id=${encodeURIComponent(u.id)}`)
      const json: unknown = await res.json()
      if (!isApiResp(json) || !res.ok || !json.user) return
      setSelected(json.user)
      syncSelectionUrl(json.user)
    } catch {
      // ignore
    }
  }, [syncSelectionUrl])

  useEffect(() => {
    if (tab !== 'search' || !focusUserId || loading) return
    if (appliedFocusUserIdRef.current === focusUserId) return

    const exact = searchUsers.find((user) => user.id === focusUserId)
    if (!exact) return

    appliedFocusUserIdRef.current = focusUserId
    void selectUser(exact)
  }, [focusUserId, loading, searchUsers, selectUser, tab])

  const toggleLimited = async (next: boolean) => {
    if (!selected) return

    setSaving(true)
    setError(null)

    const prev = selected
    const optimistic: UserRow = {
      ...selected,
      moderation: {
        ...selected.moderation,
        is_suspended: next,
        reason: next ? (limitedReason.trim() || null) : null,
        suspended_at: next ? new Date().toISOString() : null,
        is_banned: next ? false : selected.moderation.is_banned,
        ban_reason: next ? null : selected.moderation.ban_reason,
        banned_at: next ? null : selected.moderation.banned_at,
      },
    }
    setSelected(optimistic)

    try {
      const res = await adminFetch('/api/admin/users/suspend', {
        method: 'POST',
        body: JSON.stringify({
          user_id: optimistic.id,
          is_suspended: next,
          reason: next ? (limitedReason.trim() || null) : null,
        }),
      })
      const json: unknown = await res.json()
      if (!isApiResp(json)) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } else {
        if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      }

      await loadLimited()
      await loadBanned()
      await runSearch()
    } catch (e: unknown) {
      setSelected(prev)
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
    }
  }

  const toggleBanned = async (next: boolean) => {
    if (!selected) return

    setSaving(true)
    setError(null)

    const prev = selected
    const optimistic: UserRow = {
      ...selected,
      moderation: {
        ...selected.moderation,
        is_banned: next,
        ban_reason: next ? (banReason.trim() || null) : null,
        banned_at: next ? new Date().toISOString() : null,
        is_suspended: next ? false : selected.moderation.is_suspended,
        reason: next ? null : selected.moderation.reason,
        suspended_at: next ? null : selected.moderation.suspended_at,
      },
    }
    setSelected(optimistic)

    try {
      const res = await adminFetch('/api/admin/users/ban', {
        method: 'POST',
        body: JSON.stringify({
          user_id: optimistic.id,
          is_banned: next,
          reason: next ? (banReason.trim() || null) : null,
        }),
      })
      const json: unknown = await res.json()
      if (!isApiResp(json)) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } else {
        if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      }

      await loadBanned()
      await runSearch()
    } catch (e: unknown) {
      setSelected(prev)
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
    }
  }

  const hideContent = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await adminFetch('/api/admin/users/takedown', {
        method: 'POST',
        body: JSON.stringify({ user_id: selected.id, reason: 'admin_takedown' }),
      })
      const json: unknown = await res.json()
      if (!isApiResp(json)) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } else {
        if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      }
      await loadLimited()
      await loadBanned()
      await runSearch()
      await selectUser(selected)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
      setConfirmAction(null)
    }
  }

  const restoreHiddenContent = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await adminFetch('/api/admin/users/restore_content', {
        method: 'POST',
        body: JSON.stringify({ user_id: selected.id }),
      })
      const json: unknown = await res.json()
      if (!isApiResp(json)) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } else {
        if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      }
      await loadLimited()
      await loadBanned()
      await runSearch()
      await selectUser(selected)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
      setConfirmAction(null)
    }
  }

  const purgePosts = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await adminFetch('/api/admin/users/purge_content', {
        method: 'POST',
        body: JSON.stringify({ user_id: selected.id, confirm: true }),
      })
      const json: unknown = await res.json()
      if (!isApiResp(json)) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } else {
        if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      }
      await loadLimited()
      await loadBanned()
      await runSearch()
      await selectUser(selected)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
      setConfirmAction(null)
    }
  }

  const anonymizeUser = async () => {
    if (!selected) return

    setSaving(true)
    setError(null)

    try {
      const res = await adminFetch('/api/admin/users/delete', {
        method: 'POST',
        body: JSON.stringify({
          user_id: selected.id,
          confirm: true,
          mode: 'anonymize',
          reason: anonymizeReason.trim(),
        }),
      })
      const json: unknown = await res.json()
      if (!isApiResp(json)) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } else {
        if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      }

      setSelected(null)
      setSearchUsers((arr) => arr.filter((x) => x.id !== selected.id))
      setLimitedUsers((arr) => arr.filter((x) => x.id !== selected.id))
      setBannedUsers((arr) => arr.filter((x) => x.id !== selected.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
      setConfirmAction(null)
      setAnonymizeConfirmText('')
      setAnonymizeCheck(false)
      setAnonymizeReason('')
    }
  }

  const hardDeleteUser = async () => {
    if (!selected || !hardDeleteReady) return

    setSaving(true)
    setError(null)

    try {
      const res = await adminFetch('/api/admin/users/delete', {
        method: 'POST',
        body: JSON.stringify({
          user_id: selected.id,
          confirm: true,
          mode: 'hard',
          reason: hardDeleteReason.trim(),
        }),
      })
      const json: unknown = await res.json()
      if (!isApiResp(json)) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } else {
        if (!res.ok) throw new Error(getAdminErrorMessage(json, `HTTP ${res.status}`))
      }

      setSelected(null)
      setSearchUsers((arr) => arr.filter((x) => x.id !== selected.id))
      setLimitedUsers((arr) => arr.filter((x) => x.id !== selected.id))
      setBannedUsers((arr) => arr.filter((x) => x.id !== selected.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
      setConfirmAction(null)
      setHardDeleteConfirmText('')
      setHardDeleteCheck(false)
      setHardDeleteReason('')
    }
  }

  function statusBadge(u: UserRow) {
    if (u.moderation.is_banned) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
          <ShieldBan size={12} /> חסום
        </span>
      )
    }
    if (u.moderation.is_suspended) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
          <ShieldAlert size={12} /> מוגבל
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
        <ShieldCheck size={12} /> רגיל
      </span>
    )
  }

  const confirmTitle =
    confirmAction === 'hide'
      ? 'הסתרת תוכן'
      : confirmAction === 'purge'
        ? 'מחיקת פוסטים לצמיתות'
        : confirmAction === 'anonymize'
          ? 'אנונימיזציה של משתמש'
          : 'מחיקה מלאה של משתמש'

  const confirmDesc =
    confirmAction === 'hide'
      ? 'הסתרת כל הפוסטים של המשתמש מהציבור (לא יופיע ב־trash). להמשיך?'
      : confirmAction === 'purge'
        ? 'מחיקה לצמיתות של כל הפוסטים ותוכן קשור של המשתמש. פעולה בלתי הפיכה.'
        : confirmAction === 'anonymize'
          ? 'הסרת פרטים מזהים מהפרופיל (שם, תמונה, ביו) וחסימת המשתמש. התוכן שלו יישאר תחת שם אנונימי.'
          : 'מחיקה מלאה של המשתמש, כל התוכן שלו, וכל האינטרקציות. פעולה בלתי הפיכה.'

  const resolvedConfirmTitle =
    confirmAction === 'restore_content' ? 'שחזור תוכן מוסתר' : confirmTitle
  const resolvedConfirmDesc =
    confirmAction === 'restore_content'
      ? 'שחזור כל הפוסטים שהוסתרו רך עבור המשתמש. פוסטים שפורסמו יחזרו לציבור, וטיוטות יישארו כטיוטות.'
      : confirmDesc

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="משתמשים"
        description="1) משתמש מוגבל (זמני) · 2) משתמש חסום (באן לצמיתות) · 3) אנונימיזציה בלתי הפיכה · 4) מחיקה מלאה"
        actions={
          <Link
            href="/admin/users/history"
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50"
          >
            <History size={14} />
            היסטוריית משתמשים
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs
          value={tab}
          onChange={(nextValue) => {
            const nextTab = nextValue as Tab
            setTab(nextTab)
            syncSelectionUrl(selected, nextTab)
          }}
          options={TAB_OPTIONS}
        />
        {tab !== 'search' && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void (tab === 'banned' ? loadBanned() : loadLimited())}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 disabled:opacity-50 dark:border-border dark:bg-card dark:text-neutral-400 dark:hover:bg-muted/50"
            aria-label="רענן"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Left — list panel */}
        <div className="rounded-xl border border-neutral-200 bg-white dark:border-border dark:bg-card">
          {tab === 'search' && (
            <div className="border-b border-neutral-100 p-3 dark:border-border">
              <div className="relative">
                <Search size={14} className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="חיפוש לפי username או display name…"
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pr-8 pl-3 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-zinc-500"
                />
              </div>
              <div className="mt-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">לפחות 2 תווים</div>
            </div>
          )}

          <div className="max-h-[65vh] overflow-y-auto">
            {loading ? (
              <div className="p-3">
                <TableSkeleton rows={4} />
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                title="אין תוצאות"
                icon={<Users size={32} strokeWidth={1.5} />}
              />
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-border">
                {list.map((u) => {
                  const label = (u.display_name || u.username || u.id.slice(0, 8)).toString()
                  const subIso = u.moderation.is_banned
                    ? u.moderation.banned_at
                    : u.moderation.suspended_at
                  const active = selected?.id === u.id

                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => void selectUser(u)}
                        className={
                          'w-full px-4 py-3 text-right transition-colors hover:bg-neutral-50 dark:hover:bg-muted/30 ' +
                          (active ? 'bg-neutral-50 border-r-2 border-r-neutral-900 dark:bg-muted/30 dark:border-r-foreground' : '')
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-neutral-900 dark:text-foreground">{label}</span>
                          {statusBadge(u)}
                        </div>
                        {subIso && (
                          <div className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">{fmt(subIso)}</div>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right — detail panel */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-border dark:bg-card">
          {!selected ? (
            <EmptyState
              title="בחר משתמש כדי לנהל סטטוס"
              icon={<Users size={36} strokeWidth={1.5} />}
            />
          ) : (
            <div className="space-y-5">
              {/* User header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-neutral-900 dark:text-foreground">
                    {(selected.display_name || selected.username || selected.id.slice(0, 8)).toString()}
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                    נרשם: {fmt(selected.created_at)} · id: <span className="font-mono">{selected.id.slice(0, 12)}…</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(selected)}
                  <Link
                    href={`/admin/users/${selected.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/50"
                  >
                    <History size={12} />
                    ציר זמן
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Limited card */}
                <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-border dark:bg-card">
                  <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-foreground">
                    <ShieldAlert size={16} className="text-amber-500" />
                    משתמש מוגבל (זמני)
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed dark:text-neutral-400">
                    מאפשר שיטוט באתר, אבל חוסם כתיבה/הגדרות/דפים מוגנים. מאפשר ״צור קשר״.
                  </p>

                  <label className="mt-3 block text-xs font-medium text-neutral-500 dark:text-neutral-400">סיבה</label>
                  <textarea
                    value={limitedReason}
                    onChange={(e) => setLimitedReason(e.target.value)}
                    readOnly={selected.moderation.is_suspended || selected.moderation.is_banned}
                    className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 read-only:bg-neutral-50 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:read-only:bg-muted/30"
                    rows={3}
                    placeholder={selected.moderation.is_suspended ? 'הסיבה נעולה (כבר הוגדר).' : 'למה המשתמש מוגבל…'}
                  />

                  <div className="mt-3">
                    {selected.moderation.is_suspended ? (
                      <button
                        type="button"
                        disabled={saving || selected.moderation.is_banned}
                        onClick={() => void toggleLimited(false)}
                        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                      >
                        שחרר הגבלה
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving || selected.moderation.is_banned}
                        onClick={() => void toggleLimited(true)}
                        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        הגבל משתמש
                      </button>
                    )}
                  </div>
                </div>

                {/* Banned card */}
                <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 dark:border-red-500/30 dark:bg-red-500/5">
                  <div className="flex items-center gap-2 text-sm font-bold text-red-900 dark:text-red-300">
                    <ShieldBan size={16} className="text-red-500" />
                    משתמש חסום (באן לצמיתות)
                  </div>
                  <p className="mt-1 text-[11px] text-red-700/70 leading-relaxed dark:text-red-400/70">
                    המשתמש נעול למסך /banned בלבד + /banned/contact. אין גישה לשום מקום אחר.
                  </p>

                  <label className="mt-3 block text-xs font-medium text-red-800 dark:text-red-300">סיבת באן</label>
                  <textarea
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    readOnly={selected.moderation.is_banned}
                    className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 read-only:bg-red-50/50 dark:border-red-500/30 dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:read-only:bg-red-500/5"
                    rows={3}
                    placeholder={selected.moderation.is_banned ? 'הסיבה נעולה (כבר הוגדר).' : 'למה המשתמש בבאן…'}
                  />

                  <div className="mt-3">
                    {selected.moderation.is_banned ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void toggleBanned(false)}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        הסר באן
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void toggleBanned(true)}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        חסום לצמיתות
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Content / Delete section */}
              <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-border dark:bg-card">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-foreground">
                  <Trash2 size={16} className="text-neutral-500" />
                  תוכן / מחיקה
                </div>
                <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed dark:text-neutral-400">
                  ״הסתר תוכן״ מסתיר מהציבור ושומר אפשרות שחזור לאדמין. ״אנונימיזציה״ מסירה זהות ואינה ניתנת לשחזור אוטומטי. ״מחיקה לצמיתות״ מוחקת פוסטים ותלויות.
                </p>
                <div className="mt-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {`תוכן מוסתר כרגע: ${selected.content_hidden_count ?? 0} פוסטים`}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setConfirmAction('hide')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50"
                  >
                    <EyeOff size={13} />
                    הסתר תוכן (רך)
                  </button>
                  {(selected.content_hidden_count ?? 0) > 0 && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void restoreHiddenContent()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
                    >
                      <RotateCcw size={13} />
                      שחזר תוכן מוסתר
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setConfirmAction('purge')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50"
                  >
                    <Trash2 size={13} />
                    מחיקת פוסטים לצמיתות
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setAnonymizeConfirmText('')
                      setAnonymizeCheck(false)
                      setAnonymizeReason('')
                      setConfirmAction('anonymize')
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    <UserX size={13} />
                    אנונימיזציה
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setHardDeleteConfirmText('')
                      setHardDeleteCheck(false)
                      setHardDeleteReason('')
                      setConfirmAction('hard_delete')
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    מחיקה מלאה
                  </button>
                </div>

                <div className="mt-3 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {selected.moderation.is_banned
                    ? `סטטוס: חסום מאז ${fmt(selected.moderation.banned_at)}`
                    : selected.moderation.is_suspended
                      ? `סטטוס: מוגבל מאז ${fmt(selected.moderation.suspended_at)}`
                      : 'סטטוס: רגיל'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmAction !== null && confirmAction !== 'hard_delete' && confirmAction !== 'anonymize'}
        title={resolvedConfirmTitle}
        description={resolvedConfirmDesc}
        confirmLabel={
          confirmAction === 'hide'
            ? 'הסתר'
            : confirmAction === 'purge'
              ? 'מחק לצמיתות'
              : 'אנונימיזציה'
        }
        destructive
        loading={saving}
        onConfirm={() => {
          if (confirmAction === 'hide') void hideContent()
          else if (confirmAction === 'purge') void purgePosts()
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'anonymize'}
        title="אנונימיזציה בלתי הפיכה"
        description="הפעולה מסירה מהחשבון פרטים מזהים, חוסמת את הגישה לחשבון, ומשאירה את התוכן תחת זהות אנונימית. אין מסלול שחזור אוטומטי אחרי האישור."
        confirmLabel="בצע אנונימיזציה"
        destructive
        loading={saving || !anonymizeReady}
        onConfirm={() => void anonymizeUser()}
        onCancel={() => {
          setConfirmAction(null)
          setAnonymizeConfirmText('')
          setAnonymizeCheck(false)
          setAnonymizeReason('')
        }}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-6 text-neutral-700 dark:border-border dark:bg-muted/30 dark:text-neutral-300">
            <div>מה יקרה:</div>
            <div>1. השם, התמונה והפרטים האישיים יוסרו.</div>
            <div>2. המשתמש ייחסם לכניסה.</div>
            <div>3. הפוסטים יישארו תחת זהות אנונימית.</div>
            <div>4. אין שחזור אוטומטי של הזהות המקורית.</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              סיבת אנונימיזציה (חובה, מינימום 10 תווים)
            </label>
            <textarea
              value={anonymizeReason}
              onChange={(e) => setAnonymizeReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-zinc-500"
              rows={3}
              placeholder="תאר למה מבוצעת אנונימיזציה על החשבון…"
            />
            {anonymizeReason.trim().length > 0 && anonymizeReason.trim().length < 10 && (
              <p className="mt-1 text-[11px] text-red-500">
                נדרשים לפחות 10 תווים ({anonymizeReason.trim().length}/10)
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              הקלד <span className="font-mono font-bold text-neutral-900 dark:text-foreground">ANONYMIZE</span> לאישור
            </label>
            <input
              value={anonymizeConfirmText}
              onChange={(e) => setAnonymizeConfirmText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-zinc-500"
              placeholder="ANONYMIZE"
              autoComplete="off"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={anonymizeCheck}
              onChange={(e) => setAnonymizeCheck(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
            />
            <span className="text-xs text-neutral-700 dark:text-neutral-300">
              אני מבין/ה שלא ניתן לשחזר אוטומטית את זהות המשתמש לאחר האנונימיזציה
            </span>
          </label>

          {!anonymizeReady && (
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              יש למלא את כל השדות כדי לאפשר אנונימיזציה.
            </p>
          )}
        </div>
      </ConfirmDialog>

      {/* Hard delete — double confirmation dialog */}
      <ConfirmDialog
        open={confirmAction === 'hard_delete'}
        title={confirmTitle}
        description={confirmDesc}
        confirmLabel="מחיקה מלאה"
        destructive
        loading={saving || !hardDeleteReady}
        onConfirm={() => void hardDeleteUser()}
        onCancel={() => {
          setConfirmAction(null)
          setHardDeleteConfirmText('')
          setHardDeleteCheck(false)
          setHardDeleteReason('')
        }}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              סיבת מחיקה (חובה, מינימום 15 תווים)
            </label>
            <textarea
              value={hardDeleteReason}
              onChange={(e) => setHardDeleteReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-red-500/50"
              rows={3}
              placeholder="תאר את הסיבה למחיקה המלאה…"
            />
            {hardDeleteReason.trim().length > 0 && hardDeleteReason.trim().length < 15 && (
              <p className="mt-1 text-[11px] text-red-500">
                נדרשים לפחות 15 תווים ({hardDeleteReason.trim().length}/15)
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              הקלד <span className="font-mono font-bold text-red-600 dark:text-red-400">DELETE</span> לאישור
            </label>
            <input
              value={hardDeleteConfirmText}
              onChange={(e) => setHardDeleteConfirmText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-red-500/50"
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hardDeleteCheck}
              onChange={(e) => setHardDeleteCheck(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-xs text-neutral-700 dark:text-neutral-300">
              אני מבין/ה שהפעולה בלתי הפיכה
            </span>
          </label>

          {!hardDeleteReady && (
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              יש למלא את כל השדות כדי לאפשר מחיקה.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  )
}
