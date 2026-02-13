'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import AuthLayout from '@/components/AuthLayout'
import { supabase } from '@/lib/supabaseClient'
import { updatePassword } from '@/lib/auth'
import { PASSWORD_HINT_HE, validatePassword } from '@/lib/password'

type PageState = 'loading' | 'ready' | 'error' | 'done'

const RESET_GATE_STORAGE_KEY = 'tyuta:password_reset_required'
const RESET_GATE_COOKIE = 'tyuta_reset_required'

function setResetGateCookie(): void {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 15
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${RESET_GATE_COOKIE}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

function clearResetGateCookie(): void {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${RESET_GATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

function clearResetGate(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(RESET_GATE_STORAGE_KEY)
  clearResetGateCookie()
}

function setResetGate(): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RESET_GATE_STORAGE_KEY, String(Date.now()))
  setResetGateCookie()
}

function parseHashParams(hash: string): Record<string, string> {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const out: Record<string, string> = {}
  const sp = new URLSearchParams(raw)
  for (const [k, v] of sp.entries()) out[k] = v
  return out
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>('loading')
  const [err, setErr] = useState<string | null>(null)

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)

  const hashError = useMemo(() => {
    if (typeof window === 'undefined') return null
    if (!window.location.hash) return null
    const h = parseHashParams(window.location.hash)
    if (h['error_description']) return decodeURIComponent(h['error_description'])
    if (h['error']) return decodeURIComponent(h['error'])
    return null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function initSessionFromUrl() {
      setErr(null)

      // If user landed here via a recovery link, make sure the gate is enabled.
      setResetGate()

      // If Supabase sent an error in the hash, show it nicely.
      if (hashError) {
        setErr(hashError)
        setState('error')
        clearResetGate()
        return
      }

      // PKCE flow: ?code=...
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        // Clean URL to avoid reusing code by accident.
        url.searchParams.delete('code')
        window.history.replaceState({}, document.title, url.toString())
        if (cancelled) return
        if (error) {
          setErr(error.message)
          setState('error')
          clearResetGate()
          return
        }
        setResetGate()
        setState('ready')
        return
      }

      // Implicit flow: #access_token=...&refresh_token=...
      if (window.location.hash) {
        const h = parseHashParams(window.location.hash)
        const access_token = h['access_token']
        const refresh_token = h['refresh_token']
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          // Clean hash once we consumed it.
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
          if (cancelled) return
          if (error) {
            setErr(error.message)
            setState('error')
            clearResetGate()
            return
          }
          setResetGate()
          setState('ready')
          return
        }
      }

      // If we got here, we don't have a usable token.
      setErr('הקישור לא תקין או פג תוקף. בקש/י איפוס מחדש.')
      setState('error')
      clearResetGate()
    }

    void initSessionFromUrl()
    return () => {
      cancelled = true
    }
  }, [hashError])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)

    const pwCheck = validatePassword(pw1)
    if (!pwCheck.ok) {
      setErr(pwCheck.message)
      return
    }
    if (pw1 !== pw2) {
      setErr('הסיסמאות לא תואמות')
      return
    }

    setSaving(true)
    try {
      const { error } = await updatePassword(pw1)
      if (error) {
        setErr(error.message)
        return
      }

      // Password was updated. Clear gate and sign out the recovery session.
      // This avoids "free access" via recovery link and forces a clean login with the new password.
      clearResetGate()
      await supabase.auth.signOut()

      setState('done')
      window.setTimeout(() => {
        router.replace('/auth/login?reset=1')
        router.refresh()
      }, 900)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthLayout mode="reset">
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="pd-auth-title text-2xl font-extrabold">בחירת סיסמה חדשה</h2>
          <p className="pd-auth-subtitle text-sm">{PASSWORD_HINT_HE}</p>
        </div>

        {state === 'loading' ? (
          <div className="rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black/70">
            טוענים…
          </div>
        ) : null}

        {state === 'error' ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {err ?? 'שגיאה לא צפויה'}
            <div className="mt-2">
              <Link href="/auth/forgot-password" className="font-semibold text-blue-700 hover:underline">
                בקש/י קישור איפוס חדש
              </Link>
            </div>
          </div>
        ) : null}

        {state === 'done' ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            הסיסמה עודכנה ✅ מעבירים אותך…
          </div>
        ) : null}

        {state === 'ready' ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-black/80">סיסמה חדשה</label>
              <input
                className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
                type="password"
                autoComplete="new-password"
                value={pw1}
                onChange={e => setPw1(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-black/80">אימות סיסמה</label>
              <input
                className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                required
              />
            </div>

            {err ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
            ) : null}

            <button
              className="pd-auth-btn w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? 'מעדכנים…' : 'עדכון סיסמה'}
            </button>
          </form>
        ) : null}
      </div>
    </AuthLayout>
  )
}
