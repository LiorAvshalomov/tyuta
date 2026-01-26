'use client'

import { useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin/adminFetch'

function getErr(j: any, fallback: string) {
  return j?.error?.message ?? j?.error ?? fallback
}

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
      if (!r.ok) throw new Error(getErr(j, 'שגיאה'))
      alert(`נשלח ✅ (סה״כ: ${j?.sent ?? 1})`)
      setTitle('')
      setMessage('')
      if (mode === 'user') setUsername('')
    } catch (e: any) {
      alert(e?.message ?? 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="text-lg font-black">הודעת מערכת</div>
      <div className="mt-1 text-sm text-muted-foreground">שליחת הודעה מערכתית דרך notifications.</div>

      <div className="mt-4 rounded-3xl border border-black/5 bg-white/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setMode('user')}
            className={
              'rounded-full px-3 py-1.5 text-sm font-bold transition ' +
              (mode === 'user' ? 'bg-black text-white' : 'border border-black/10 bg-white/60 hover:bg-white')
            }
          >
            למשתמש
          </button>
          <button
            onClick={() => setMode('all')}
            className={
              'rounded-full px-3 py-1.5 text-sm font-bold transition ' +
              (mode === 'all' ? 'bg-black text-white' : 'border border-black/10 bg-white/60 hover:bg-white')
            }
          >
            לכולם
          </button>
        </div>

        {mode === 'user' && (
          <div className="mt-3">
            <div className="text-xs font-bold text-muted-foreground">username יעד</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="למשל: lior"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm outline-none"
            />
          </div>
        )}

        <div className="mt-3">
          <div className="text-xs font-bold text-muted-foreground">כותרת</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת קצרה…"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm outline-none"
          />
        </div>

        <div className="mt-3">
          <div className="text-xs font-bold text-muted-foreground">הודעה</div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="מה תרצה שהמערכת תשלח…"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm outline-none"
            rows={6}
          />
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button
            onClick={send}
            disabled={!canSend}
            className={
              'rounded-full px-5 py-2 text-sm font-bold text-white ' +
              (canSend ? 'bg-black hover:opacity-90' : 'bg-black/30 cursor-not-allowed')
            }
          >
            שלח
          </button>
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          טיפ: כדי שזה יראה יפה למשתמשים, אנחנו מרנדרים “מערכת האתר” וכוללים את הכותרת/הטקסט מתוך payload.
        </div>
      </div>
    </div>
  )
}
