'use client'

import { useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import PageHeader from '@/components/admin/PageHeader'
import FilterTabs from '@/components/admin/FilterTabs'
import { Send } from 'lucide-react'

const MODE_OPTIONS: { value: 'user' | 'all'; label: string }[] = [
  { value: 'user', label: 'למשתמש' },
  { value: 'all', label: 'לכולם' },
]

export default function AdminSystemPage() {
  const [mode, setMode] = useState<'user' | 'all'>('user')
  const [username, setUsername] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const canSend = useMemo(() => {
    if (busy) return false
    if (title.trim().length < 2 || message.trim().length < 2) return false
    if (mode === 'user' && username.trim().length < 2) return false
    return true
  }, [busy, title, message, mode, username])

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

  return (
    <div className="space-y-5">
      <PageHeader
        title="הודעת מערכת"
        description="שליחת הודעה מערכתית דרך notifications."
      />

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <FilterTabs value={mode} onChange={setMode} options={MODE_OPTIONS} />

        <div className="mt-5 space-y-4">
          {mode === 'user' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                username יעד
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="למשל: lior"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">
              כותרת
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת קצרה..."
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">
              הודעה
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="מה תרצה שהמערכת תשלח..."
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
              rows={6}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs text-neutral-400">
            טיפ: כדי שזה יראה יפה למשתמשים, אנחנו מרנדרים "מערכת האתר" וכוללים את הכותרת/הטקסט מתוך payload.
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className={
              'inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white ' +
              (canSend
                ? 'bg-neutral-900 hover:bg-neutral-800'
                : 'cursor-not-allowed bg-neutral-300')
            }
          >
            <Send size={14} />
            שלח
          </button>
        </div>
      </div>
    </div>
  )
}
