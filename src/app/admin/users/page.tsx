"use client"

import { useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'

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
        // Limited is a separate mode; do not keep banned together
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
        // Banned is exclusive: clear suspended
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
    const ok = window.confirm('הסתרת כל הפוסטים של המשתמש מהציבור (לא יופיע ב־trash).\nלהמשיך?')
    if (!ok) return

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
    }
  }

  const purgePosts = async () => {
    if (!selected) return
    const ok = window.confirm('מחיקה לצמיתות של כל הפוסטים ותוכן קשור של המשתמש. פעולה בלתי הפיכה.\nלהמשיך?')
    if (!ok) return

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
    }
  }

  const deleteUser = async () => {
    if (!selected) return

    if (!selected.moderation.is_banned) {
      setError('מחיקה מלאה מותרת רק אחרי "משתמש חסום" (Ban לצמיתות).')
      return
    }

    const ok = window.confirm('מחיקה מלאה של המשתמש וכל התוכן שלו. פעולה בלתי הפיכה.\n\nלהמשיך?')
    if (!ok) return

    setSaving(true)
    setError(null)

    try {
      const res = await adminFetch('/api/admin/users/delete', {
        method: 'POST',
        body: JSON.stringify({ user_id: selected.id, confirm: true }),
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
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-2 sm:p-4" dir="rtl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">משתמשים</h1>
          <p className="mt-1 text-sm text-neutral-600">
            1) משתמש מוגבל (זמני) · 2) משתמש חסום (באן לצמיתות) · 3) מחיקה מלאה
          </p>
        </div>

        <div className="inline-flex rounded-full border border-black/10 bg-white p-1 text-sm font-bold">
          <button
            type="button"
            onClick={() => setTab('banned')}
            className={'rounded-full px-4 py-2 ' + (tab === 'banned' ? 'bg-black text-white' : 'text-neutral-800 hover:bg-neutral-50')}
          >
            חסומים
          </button>
          <button
            type="button"
            onClick={() => setTab('limited')}
            className={'rounded-full px-4 py-2 ' + (tab === 'limited' ? 'bg-black text-white' : 'text-neutral-800 hover:bg-neutral-50')}
          >
            מוגבלים
          </button>
          <button
            type="button"
            onClick={() => setTab('search')}
            className={'rounded-full px-4 py-2 ' + (tab === 'search' ? 'bg-black text-white' : 'text-neutral-800 hover:bg-neutral-50')}
          >
            חיפוש
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[360px_1fr]">
        {/* Left */}
        <div className="rounded-3xl border border-black/5 bg-white/70 p-3 shadow-sm">
          {tab === 'search' ? (
            <>
              <label className="text-sm font-bold">חיפוש משתמש</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חיפוש לפי username או display name…"
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20"
              />
              <div className="mt-2 text-xs text-neutral-500">לפחות 2 תווים</div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">{tab === 'banned' ? 'רשימת חסומים' : 'רשימת מוגבלים'}</div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void (tab === 'banned' ? loadBanned() : loadLimited())}
                className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-bold hover:bg-neutral-50 disabled:opacity-60"
              >
                רענן
              </button>
            </div>
          )}

          <div className="mt-3 max-h-[70vh] overflow-auto rounded-2xl border border-black/5 bg-white">
            {loading ? (
              <div className="p-3 text-sm text-neutral-600">טוען…</div>
            ) : list.length === 0 ? (
              <div className="p-3 text-sm text-neutral-600">אין תוצאות.</div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {list.map((u) => {
                  const label = (u.display_name || u.username || u.id.slice(0, 8)).toString()
                  const sub =
                    u.moderation.is_banned
                      ? 'חסום'
                      : u.moderation.is_suspended
                        ? 'מוגבל'
                        : 'רגיל'
                  const subIso = u.moderation.is_banned ? u.moderation.banned_at : u.moderation.suspended_at

                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => void selectUser(u)}
                        className={
                          'w-full text-right px-3 py-2 hover:bg-neutral-50 ' +
                          (selected?.id === u.id ? 'bg-neutral-50' : '')
                        }
                      >
                        <div className="font-bold text-sm text-neutral-900 truncate">{label}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {sub}
                          {subIso ? ` · ${fmt(subIso)}` : ''}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="rounded-3xl border border-black/5 bg-white/70 p-4 shadow-sm">
          {!selected ? (
            <div className="text-sm text-neutral-600">בחר משתמש כדי לנהל סטטוס.</div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="text-lg font-black">
                  {(selected.display_name || selected.username || selected.id.slice(0, 8)).toString()}
                </div>
                <div className="mt-1 text-sm text-neutral-600">
                  נרשם: {fmt(selected.created_at)} · id: {selected.id}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Limited */}
                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <div className="font-black">משתמש מוגבל (זמני)</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    מאפשר שיטוט באתר, אבל חוסם כתיבה/הגדרות/דפים מוגנים. מאפשר “צור קשר”.
                  </div>

                  <label className="mt-3 block text-xs font-bold text-neutral-700">סיבה</label>
                  <textarea
                    value={limitedReason}
                    onChange={(e) => setLimitedReason(e.target.value)}
                    readOnly={selected.moderation.is_suspended || selected.moderation.is_banned}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-60"
                    rows={3}
                    placeholder={selected.moderation.is_suspended ? "הסיבה נעולה (כבר הוגדר)." : "למה המשתמש מוגבל…"}
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.moderation.is_suspended ? (
                      <button
                        type="button"
                        disabled={saving || selected.moderation.is_banned}
                        onClick={() => void toggleLimited(false)}
                        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-black text-white hover:bg-black disabled:opacity-60"
                      >
                        שחרר הגבלה
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving || selected.moderation.is_banned}
                        onClick={() => void toggleLimited(true)}
                        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-black text-white hover:bg-black disabled:opacity-60"
                      >
                        הגבל משתמש
                      </button>
                    )}
                  </div>
                </div>

                {/* Banned */}
                <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
                  <div className="font-black text-red-900">משתמש חסום (באן לצמיתות)</div>
                  <div className="mt-1 text-xs text-red-800/80">
                    המשתמש נעול למסך /banned בלבד + /banned/contact. אין גישה לשום מקום אחר.
                  </div>

                  <label className="mt-3 block text-xs font-bold text-red-900">סיבת באן</label>
                  <textarea
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    readOnly={selected.moderation.is_banned}
                    className="mt-1 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60"
                    rows={3}
                    placeholder={selected.moderation.is_banned ? "הסיבה נעולה (כבר הוגדר)." : "למה המשתמש בבאן…"}
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.moderation.is_banned ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void toggleBanned(false)}
                        className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        הסר באן
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void toggleBanned(true)}
                        className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        חסום לצמיתות
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <div className="font-black">תוכן / מחיקה</div>
                <div className="mt-1 text-xs text-neutral-600">
                  “הסתר תוכן” לא שולח ל־trash (המשתמש לא יוכל לשחזר). “מחיקה לצמיתות” מוחקת פוסטים ותלויות.
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void hideContent()}
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-black hover:bg-neutral-50 disabled:opacity-60"
                  >
                    הסתר תוכן (רך)
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void purgePosts()}
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-black hover:bg-neutral-50 disabled:opacity-60"
                  >
                    מחיקת פוסטים לצמיתות
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void deleteUser()}
                    className="rounded-full bg-black px-4 py-2 text-sm font-black text-white hover:bg-neutral-900 disabled:opacity-60"
                  >
                    מחיקה מלאה (משתמש)
                  </button>
                </div>

                {selected.moderation.is_banned ? (
                  <div className="mt-2 text-xs text-neutral-600">
                    סטטוס: חסום מאז {fmt(selected.moderation.banned_at)}
                  </div>
                ) : selected.moderation.is_suspended ? (
                  <div className="mt-2 text-xs text-neutral-600">
                    סטטוס: מוגבל מאז {fmt(selected.moderation.suspended_at)}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-neutral-600">סטטוס: רגיל</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}