'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import AuthLayout from '@/components/AuthLayout'
import { updatePassword } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { PASSWORD_HINT_HE, validatePassword } from '@/lib/password'

type Status = 'idle' | 'consuming' | 'ready' | 'done' | 'error'

function parseHashParams(hash: string): Record<string, string> {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const sp = new URLSearchParams(raw)
  const out: Record<string, string> = {}
  sp.forEach((v, k) => {
    out[k] = v
  })
  return out
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const code = searchParams.get('code')
  const [status, setStatus] = useState<Status>('idle')
  const [err, setErr] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [saving, setSaving] = useState(false)

  const canSubmit = useMemo(() => status === 'ready' && !saving, [status, saving])

  useEffect(() => {
    let cancelled = false

    async function consumeLink(): Promise<void> {
      setErr(null)
      setStatus('consuming')

      try {
        // Supabase can arrive either as PKCE (?code=...) or as implicit (#access_token=...).
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else if (typeof window !== 'undefined' && window.location.hash) {
          const p = parseHashParams(window.location.hash)
          const access_token = p['access_token']
          const refresh_token = p['refresh_token']

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token })
            if (error) throw error
          }
        }

        // Clean URL (remove tokens / code) after consuming.
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, '/auth/reset-password')
        }

        if (!cancelled) setStatus('ready')
      } catch (e: unknown) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : 'שגיאה לא צפויה'
        setErr(message)
        setStatus('error')
      }
    }

    void consumeLink()
    return () => {
      cancelled = true
    }
  }, [code])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)

    const pwCheck = validatePassword(password)
    if (!pwCheck.ok) {
      setErr(pwCheck.message)
      return
    }
    if (password !== password2) {
      setErr('הסיסמאות לא תואמות')
      return
    }

    setSaving(true)
    try {
      const { error } = await updatePassword(password)
      if (error) {
        setErr(error.message)
        return
      }
      setStatus('done')
      router.replace('/')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthLayout mode="reset">
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="pd-auth-title text-2xl font-extrabold">איפוס סיסמה</h2>
          <p className="pd-auth-subtitle text-sm">
            {status === 'consuming'
              ? 'טוענים קישור…'
              : status === 'ready'
                ? 'בחר/י סיסמה חדשה.'
                : status === 'error'
                  ? 'הקישור לא תקין או פג תוקף.'
                  : 'מכינים את העמוד…'}
          </p>
        </div>

        {err ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
        ) : null}

        {status === 'ready' ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-black/80">סיסמה חדשה</label>
              <input
                className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <div className="text-xs text-black/55">{PASSWORD_HINT_HE}</div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-black/80">אימות סיסמה</label>
              <input
                className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                required
              />
            </div>

            <button
              className="pd-auth-btn w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
              disabled={!canSubmit}
              type="submit"
            >
              {saving ? 'שומרים…' : 'שמירת סיסמה חדשה'}
            </button>
          </form>
        ) : null}

        <div className="text-sm text-black/70">
          <Link href="/auth/login" className="font-semibold text-blue-700 hover:underline">חזרה לכניסה</Link>
        </div>
      </div>
    </AuthLayout>
  )
}
