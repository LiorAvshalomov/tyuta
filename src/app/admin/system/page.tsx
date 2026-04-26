'use client'

import { useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import PageHeader from '@/components/admin/PageHeader'
import FilterTabs from '@/components/admin/FilterTabs'
import UserAutocompleteInput from '@/components/admin/UserAutocompleteInput'
import { Send, Radio, AlertTriangle } from 'lucide-react'

const MODE_OPTIONS: { value: 'user' | 'all'; label: string }[] = [
  { value: 'user', label: 'למשתמש' },
  { value: 'all', label: 'לכולם' },
]

const MAX_BROADCAST = 4000

export default function AdminSystemPage() {
  // ── Notification form state ──────────────────────────────────────────────
  const [mode, setMode] = useState<'user' | 'all'>('user')
  const [username, setUsername] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // ── Broadcast form state ─────────────────────────────────────────────────
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcastBusy, setBroadcastBusy] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null)
  const [broadcastErr, setBroadcastErr] = useState<string | null>(null)

  const canSend = useMemo(() => {
    if (busy) return false
    if (title.trim().length < 2 || message.trim().length < 2) return false
    if (mode === 'user' && username.trim().length < 2) return false
    return true
  }, [busy, title, message, mode, username])

  const canBroadcast = !broadcastBusy && broadcastBody.trim().length >= 1 && broadcastBody.length <= MAX_BROADCAST

  async function send() {
    if (!canSend) return
    const ok = mode === 'all' ? confirm('לשלוח הודעה לכל המשתמשים?') : true
    if (!ok) return
    setBusy(true)
    try {
      const r = await adminFetch('/api/admin/system/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, username: username.trim(), title: title.trim(), message: message.trim() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה'))
      alert(`נשלח (סה"כ: ${(j as Record<string, unknown>)?.sent ?? 1})`)
      setTitle('')
      setMessage('')
      if (mode === 'user') setUsername('')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function sendBroadcast() {
    if (!canBroadcast) return
    const confirmed = confirm(
      `לשלוח הודעת שידור לכל המשתמשים (עד 5,000)?\n\nזה ישלח הודעה לתיבת הדואר של כל משתמש פעיל.\nניתן לשלוח עד 2 שידורים בכל 10 דקות.`
    )
    if (!confirmed) return
    setBroadcastBusy(true)
    setBroadcastErr(null)
    setBroadcastResult(null)
    try {
      const r = await adminFetch('/api/admin/inbox/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: broadcastBody.trim() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה'))
      const sent = typeof (j as Record<string, unknown>).sent === 'number' ? (j as Record<string, unknown>).sent : '?'
      setBroadcastResult(`נשלח בהצלחה ל־${sent as string} משתמשים`)
      setBroadcastBody('')
    } catch (e: unknown) {
      setBroadcastErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBroadcastBusy(false)
    }
  }

  const remaining = MAX_BROADCAST - broadcastBody.length
  const isOverLimit = broadcastBody.length > MAX_BROADCAST

  return (
    <div className="space-y-6">
      <PageHeader
        title="הודעות מערכת"
        description="שליחת התראות ושידורים לתיבת הדואר."
      />

      {/* ── Notification form ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          התראה (notifications)
        </p>
        <FilterTabs value={mode} onChange={setMode} options={MODE_OPTIONS} />

        <div className="mt-5 space-y-4">
          {mode === 'user' && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                משתמש יעד
              </label>
              <UserAutocompleteInput
                value={username}
                onChange={setUsername}
                onSelect={u => setUsername(u.username ?? '')}
                placeholder="שם / @username…"
                width="w-full"
                inputClassName="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2.5 pr-7 pl-3 text-sm outline-none transition-colors focus:border-neutral-400 focus:bg-white focus:ring-1 focus:ring-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600"
              />
              <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">תשלח לפי username</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              כותרת
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת קצרה..."
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-neutral-400 focus:bg-white focus:ring-1 focus:ring-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              הודעה
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="מה תרצה שהמערכת תשלח..."
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-neutral-400 focus:bg-white focus:ring-1 focus:ring-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-600"
              rows={6}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs text-neutral-400 dark:text-neutral-500">
            טיפ: כדי שזה יראה יפה למשתמשים, אנחנו מרנדרים &quot;מערכת האתר&quot; וכוללים את הכותרת/הטקסט מתוך payload.
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className={
              'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all ' +
              (canSend
                ? 'bg-[#1a1a18] hover:bg-neutral-700 shadow-sm hover:shadow-md'
                : 'cursor-not-allowed bg-neutral-300 dark:bg-zinc-700')
            }
          >
            <Send size={14} />
            שלח
          </button>
        </div>
      </div>

      {/* ── Inbox broadcast ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <Radio size={15} className="text-neutral-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            שידור לתיבת הדואר
          </p>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            הודעה זו תישלח לתיבת הדואר של <strong>כל המשתמשים</strong> (עד 5,000) כהודעה מ״מערכת האתר״.
            מגבלה: 2 שידורים בכל 10 דקות.
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              גוף ההודעה
            </label>
            <textarea
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="תוכן ההודעה שתישלח לכל המשתמשים..."
              className={
                'w-full rounded-lg border bg-neutral-50 px-3 py-2.5 text-sm outline-none transition-colors focus:bg-white focus:ring-1 dark:bg-neutral-800/60 dark:text-neutral-100 dark:placeholder:text-neutral-600 ' +
                (isOverLimit
                  ? 'border-red-400 focus:border-red-400 focus:ring-red-300 dark:border-red-500'
                  : 'border-neutral-200 focus:border-neutral-400 focus:ring-neutral-300 dark:border-neutral-700 dark:focus:border-neutral-600')
              }
              rows={5}
            />
            <div className={`mt-1 text-right text-[11px] ${isOverLimit ? 'text-red-500' : 'text-neutral-400 dark:text-neutral-500'}`}>
              {isOverLimit ? `חריגה ב־${-remaining} תווים` : `${remaining} תווים נותרו`}
            </div>
          </div>

          {broadcastResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
              {broadcastResult}
            </div>
          )}

          {broadcastErr && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {broadcastErr}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={sendBroadcast}
              disabled={!canBroadcast}
              className={
                'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all ' +
                (canBroadcast
                  ? 'bg-[#1a1a18] hover:bg-neutral-700 shadow-sm hover:shadow-md'
                  : 'cursor-not-allowed bg-neutral-300 dark:bg-zinc-700')
              }
            >
              <Radio size={14} />
              {broadcastBusy ? 'שולח…' : 'שדר לכולם'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
