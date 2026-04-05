'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

const MAX_FILES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export default function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const session = data.session
      setUserId(session?.user?.id ?? null)
      setToken(session?.access_token ?? null)
      setEmail(session?.user?.email ?? '')
    })
    return () => { mounted = false }
  }, [])

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    const next: File[] = [...files]
    const nextPreviews: string[] = [...previews]
    for (const f of Array.from(selected)) {
      if (next.length >= MAX_FILES) break
      if (!ALLOWED_MIME.has(f.type) || f.size > MAX_FILE_SIZE) continue
      next.push(f)
      nextPreviews.push(URL.createObjectURL(f))
    }
    setFiles(next)
    setPreviews(nextPreviews)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeFile(i: number) {
    URL.revokeObjectURL(previews[i])
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
    setPreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const canSubmit = useMemo(() => {
    if (!userId) return false
    if (subject.trim().length < 2) return false
    if (message.trim().length < 10) return false
    return true
  }, [userId, subject, message])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setOkMsg(null)
    setErrMsg(null)
    if (!canSubmit || !token) return

    try {
      setLoading(true)
      const fd = new FormData()
      fd.append('subject', subject.trim())
      fd.append('message', message.trim())
      if (email.trim()) fd.append('email', email.trim())
      for (const f of files) fd.append('files', f)

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? 'משהו השתבש בשליחה')
      }

      setOkMsg('נשלח! נחזור אליך כשנוכל 🙏')
      setSubject('')
      setMessage('')
      previews.forEach((p) => URL.revokeObjectURL(p))
      setFiles([])
      setPreviews([])
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'משהו השתבש בשליחה')
    } finally {
      setLoading(false)
    }
  }

  if (!userId) {
    return (
      <div className="rounded-2xl border bg-white/60 p-4 dark:bg-muted/60">
        <div className="text-sm text-neutral-700 dark:text-foreground">
          כדי לשלוח הודעה דרך הטופס צריך להתחבר.
        </div>
        <div className="mt-3 flex gap-2">
          <Link href="/auth/login" className="rounded-full bg-black px-4 py-2 text-sm font-bold text-white">
            התחבר/י
          </Link>
          <Link href="/register" className="rounded-full border px-4 py-2 text-sm font-bold dark:border-border dark:text-foreground dark:hover:bg-muted">
            הרשמה
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs font-bold text-neutral-700 dark:text-foreground">נושא</div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            className="w-full rounded-2xl border bg-white/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:bg-muted/80 dark:text-foreground dark:placeholder:text-muted-foreground dark:border-border dark:focus:ring-white/10"
            placeholder="במה מדובר?"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-bold text-neutral-700 dark:text-foreground">אימייל (אופציונלי)</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border bg-white/80 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:bg-muted/80 dark:text-foreground dark:placeholder:text-muted-foreground dark:border-border dark:focus:ring-white/10"
            placeholder="כדי לחזור אליך אם צריך"
          />
        </label>
      </div>

      <label className="block">
        <div className="mb-1 text-xs font-bold text-neutral-700 dark:text-foreground">הודעה</div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={5000}
          className="w-full resize-none rounded-2xl border bg-white/80 px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-black/10 whitespace-pre-wrap dark:bg-muted/80 dark:text-foreground dark:placeholder:text-muted-foreground dark:border-border dark:focus:ring-white/10"
          placeholder="כתוב/י לנו כאן…"
        />
        <div className="mt-1 text-xs text-neutral-500 dark:text-muted-foreground">{message.length}/5000</div>
      </label>

      {/* File attachments */}
      <div>
        <div className="mb-1 text-xs font-bold text-neutral-700 dark:text-foreground">
          צרף/י תמונות (אופציונלי, עד {MAX_FILES})
        </div>

        {files.length < MAX_FILES && (
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed bg-white/80 px-4 py-2.5 text-sm text-neutral-500 hover:bg-neutral-50 dark:bg-muted/80 dark:border-border dark:text-muted-foreground dark:hover:bg-muted">
            <span>+ הוסף תמונה</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        )}

        {previews.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`תמונה ${i + 1}`}
                  className="h-16 w-16 rounded-xl border border-neutral-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-800 text-[9px] font-bold text-white hover:bg-red-600"
                  aria-label="הסר תמונה"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-1 text-xs text-neutral-400 dark:text-muted-foreground">
          עד {MAX_FILES} תמונות, מקסימום 5MB כל אחת. JPEG, PNG, GIF, WebP.
        </div>
      </div>

      {errMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400">
          {errMsg}
        </div>
      )}
      {okMsg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400">
          {okMsg}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-neutral-500 dark:text-muted-foreground">
          אל תכלול/י פרטים רגישים. אם זה מקרה דחוף — פנה/י לגורמי חירום.
        </div>
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className={[
            'rounded-full px-5 py-2 text-sm font-black shadow-sm whitespace-nowrap min-w-[96px]',
            !canSubmit || loading ? 'bg-black/30 text-white' : 'bg-black text-white hover:bg-black/90',
          ].join(' ')}
        >
          {loading ? 'שולח…' : 'שלח/י'}
        </button>
        {!canSubmit && !loading && (
          <div className="mt-1 text-[11px] text-neutral-500 dark:text-muted-foreground">
            כדי לשלוח: נושא לפחות 2 תווים, הודעה לפחות 10 תווים.
          </div>
        )}
      </div>
    </form>
  )
}
