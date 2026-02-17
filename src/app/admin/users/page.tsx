"use client"

import { useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
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

type ConfirmAction = 'hide' | 'purge' | 'anonymize' | 'hard_delete'

export default function AdminUsersPage() {
  const [tab, setTab] = useState<Tab>('banned')

  // search
  const [q, setQ] = useState('')
  const canSearch = useMemo(() => q.trim().length >= 2, [q])
  const [searchUsers, setSearchUsers] = useState<UserRow[]>([])

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
  const hardDeleteReady =
    hardDeleteConfirmText === 'DELETE' &&
    hardDeleteCheck &&
    hardDeleteReason.trim().length >= 15

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

  const runSearch = async () => {
    if (!canSearch) {
      setSearchUsers([])
      if (tab === 'search') setSelected(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}`)
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
  }

  useEffect(() => {
    void loadBanned()
    void loadLimited()
  }, [])

  useEffect(() => {
    if (tab !== 'search') return
    const t = window.setTimeout(() => void runSearch(), 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab])

  useEffect(() => {
    setLimitedReason(selected?.moderation.reason || '')
    setBanReason(selected?.moderation.ban_reason || '')
  }, [selected])

  const list: UserRow[] = useMemo(() => {
    if (tab === 'banned') return bannedUsers
    if (tab === 'limited') return limitedUsers
    return searchUsers
  }, [bannedUsers, limitedUsers, searchUsers, tab])

  const selectUser = async (u: UserRow) => {
    setSelected(u)
    try {
      const res = await adminFetch(`/api/admin/users/status?user_id=${encodeURIComponent(u.id)}`)
      const json: unknown = await res.json()
      if (!isApiResp(json) || !res.ok || !json.user) return
      setSelected(json.user)
    } catch {
      // ignore
    }
  }

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
        body: JSON.stringify({ user_id: selected.id, confirm: true, mode: 'anonymize' }),
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
        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
          <ShieldBan size={12} /> חסום
        </span>
      )
    }
    if (u.moderation.is_suspended) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          <ShieldAlert size={12} /> מוגבל
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
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

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="משתמשים"
        description="1) משתמש מוגבל (זמני) · 2) משתמש חסום (באן לצמיתות) · 3) מחיקה מלאה"
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs value={tab} onChange={setTab} options={TAB_OPTIONS} />
        {tab !== 'search' && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void (tab === 'banned' ? loadBanned() : loadLimited())}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
            aria-label="רענן"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Left — list panel */}
        <div className="rounded-xl border border-neutral-200 bg-white">
          {tab === 'search' && (
            <div className="border-b border-neutral-100 p-3">
              <div className="relative">
                <Search size={14} className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="חיפוש לפי username או display name…"
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pr-8 pl-3 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div className="mt-1.5 text-[11px] text-neutral-400">לפחות 2 תווים</div>
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
              <ul className="divide-y divide-neutral-100">
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
                          'w-full px-4 py-3 text-right transition-colors hover:bg-neutral-50 ' +
                          (active ? 'bg-neutral-50 border-r-2 border-r-neutral-900' : '')
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-neutral-900">{label}</span>
                          {statusBadge(u)}
                        </div>
                        {subIso && (
                          <div className="mt-0.5 text-[11px] text-neutral-400">{fmt(subIso)}</div>
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
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
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
                  <h2 className="text-base font-bold text-neutral-900">
                    {(selected.display_name || selected.username || selected.id.slice(0, 8)).toString()}
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    נרשם: {fmt(selected.created_at)} · id: <span className="font-mono">{selected.id.slice(0, 12)}…</span>
                  </p>
                </div>
                {statusBadge(selected)}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Limited card */}
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                    <ShieldAlert size={16} className="text-amber-500" />
                    משתמש מוגבל (זמני)
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
                    מאפשר שיטוט באתר, אבל חוסם כתיבה/הגדרות/דפים מוגנים. מאפשר ״צור קשר״.
                  </p>

                  <label className="mt-3 block text-xs font-medium text-neutral-500">סיבה</label>
                  <textarea
                    value={limitedReason}
                    onChange={(e) => setLimitedReason(e.target.value)}
                    readOnly={selected.moderation.is_suspended || selected.moderation.is_banned}
                    className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 read-only:bg-neutral-50"
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
                <div className="rounded-xl border border-red-200 bg-red-50/30 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-red-900">
                    <ShieldBan size={16} className="text-red-500" />
                    משתמש חסום (באן לצמיתות)
                  </div>
                  <p className="mt-1 text-[11px] text-red-700/70 leading-relaxed">
                    המשתמש נעול למסך /banned בלבד + /banned/contact. אין גישה לשום מקום אחר.
                  </p>

                  <label className="mt-3 block text-xs font-medium text-red-800">סיבת באן</label>
                  <textarea
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    readOnly={selected.moderation.is_banned}
                    className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 read-only:bg-red-50/50"
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
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                  <Trash2 size={16} className="text-neutral-500" />
                  תוכן / מחיקה
                </div>
                <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
                  ״הסתר תוכן״ לא שולח ל־trash (המשתמש לא יוכל לשחזר). ״מחיקה לצמיתות״ מוחקת פוסטים ותלויות.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setConfirmAction('hide')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <EyeOff size={13} />
                    הסתר תוכן (רך)
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setConfirmAction('purge')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    מחיקת פוסטים לצמיתות
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setConfirmAction('anonymize')}
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

                <div className="mt-3 text-[11px] text-neutral-400">
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
        open={confirmAction !== null && confirmAction !== 'hard_delete'}
        title={confirmTitle}
        description={confirmDesc}
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
          else if (confirmAction === 'anonymize') void anonymizeUser()
        }}
        onCancel={() => setConfirmAction(null)}
      />

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
            <label className="block text-xs font-medium text-neutral-700">
              סיבת מחיקה (חובה, מינימום 15 תווים)
            </label>
            <textarea
              value={hardDeleteReason}
              onChange={(e) => setHardDeleteReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
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
            <label className="block text-xs font-medium text-neutral-700">
              הקלד <span className="font-mono font-bold text-red-600">DELETE</span> לאישור
            </label>
            <input
              value={hardDeleteConfirmText}
              onChange={(e) => setHardDeleteConfirmText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
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
            <span className="text-xs text-neutral-700">
              אני מבין/ה שהפעולה בלתי הפיכה
            </span>
          </label>

          {!hardDeleteReady && (
            <p className="text-[11px] text-neutral-400">
              יש למלא את כל השדות כדי לאפשר מחיקה.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  )
}
