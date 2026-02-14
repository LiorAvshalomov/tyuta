'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import AuthLayout from '@/components/AuthLayout'
import { sendPasswordResetEmail } from '@/lib/auth'


const COOLDOWN_SECONDS = 60

function getBaseUrlFromBrowser(): string {
  // Prefer the actual domain the user is currently on (prod / preview / localhost).
  if (typeof window !== 'undefined') return window.location.origin
  return 'https://tyuta.net'
}

function toSecondsLeft(untilTs: number): number {
  const diffMs = untilTs - Date.now()
  return Math.max(0, Math.ceil(diffMs / 1000))
}

function isRateLimitMessage(msg: string): boolean {
  const m = msg.toLowerCase()
  return (
    m.includes('for security purposes') ||
    m.includes('only request this after') ||
    m.includes('rate limit') ||
    m.includes('too many requests')
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sentMsg, setSentMsg] = useState<string | null>(null)

  // timestamp (ms) until next attempt is allowed
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  // local tick to force re-render while cooldown is active
  const [cooldownTick, setCooldownTick] = useState(0)
  const secondsLeft = cooldownUntil ? toSecondsLeft(cooldownUntil) : 0

  useEffect(() => {
    if (!cooldownUntil) return
    const id = window.setInterval(() => setCooldownTick(t => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [cooldownUntil])

  useEffect(() => {
    // stop cooldown when it expires
    if (!cooldownUntil) return
    if (secondsLeft <= 0) setCooldownUntil(null)
  }, [cooldownUntil, secondsLeft, cooldownTick])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setSentMsg(null)

    const normalizedEmail = email.trim()
    if (!normalizedEmail) return

    if (cooldownUntil && secondsLeft > 0) {
      setErr(`אפשר לבקש שוב בעוד ${secondsLeft} שניות`)
      return
    }

    setLoading(true)
    try {
      const baseUrl = getBaseUrlFromBrowser()
      const redirectTo = `${baseUrl}/auth/reset-password`

      const { error } = await sendPasswordResetEmail(normalizedEmail, redirectTo)
      if (error) {
        const msg = error.message || 'שגיאה בשליחת המייל'

        // Supabase rate limit message: make it UX-friendly and enforce cooldown locally.
        if (isRateLimitMessage(msg)) {
          setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000)
          setSentMsg('אם האימייל קיים אצלנו—נשלח קישור לאיפוס. אפשר לבקש שוב בעוד כדקה.')
          return
        }

        setErr(msg)
        return
      }

      setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000)
      setSentMsg('אם האימייל קיים אצלנו—נשלח קישור לאיפוס סיסמה. בדוק/י את תיבת הדואר (וגם ספאם).')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout mode="forgot">
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="pd-auth-title text-2xl font-extrabold">איפוס סיסמה</h2>
          <p className="pd-auth-subtitle text-sm">נשלח לך קישור במייל להגדרת סיסמה חדשה.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">אימייל</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              type="email"
              autoComplete="email"
              placeholder='example@email.com'
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          {err ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : null}

          {sentMsg ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {sentMsg}
            </div>
          ) : null}

          <button
            className="pd-auth-btn w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || !email.trim() || (!!cooldownUntil && secondsLeft > 0)}
            type="submit"
          >
            {loading
              ? 'שולחים…'
              : cooldownUntil && secondsLeft > 0
                ? `אפשר שוב בעוד ${secondsLeft}s`
                : 'שליחת קישור איפוס'}
          </button>
        </form>

        <div className="text-sm text-black/70">
          חזרה ל־{' '}
          <Link href="/auth/login" className="font-semibold text-blue-700 hover:underline">כניסה</Link>
        </div>
      </div>
    </AuthLayout>
  )
}
