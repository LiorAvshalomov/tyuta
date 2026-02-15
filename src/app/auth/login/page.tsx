'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import AuthLayout from '@/components/AuthLayout'
import { signIn } from '@/lib/auth'
import { PASSWORD_HINT_HE, validatePassword } from '@/lib/password'
import { event as gaEvent } from '@/lib/gtag'

const WITTY = [
  'תן/י לזה לצאת בעדינות.',
  'שורה אחת יכולה לשנות יום.',
  'פותחים דף חדש.',
  'ברגע אחד קטן מתחילים.',
  'מחברת אחת. אמת אחת.',
  'לפעמים מספיק רק שורה אחת.',
  'גם טיוטה היא התחלה.',
  'היום זה יום טוב להתחיל.',
  'אם לא עכשיו, אז מתי?',
  'מה שלא נאמר מקומו להיכתב.'
]

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [lineIdx, setLineIdx] = useState(0)

  useEffect(() => {
    // Avoid hydration mismatch: choose the first line on the server, then randomize on the client.
    setLineIdx(Math.floor(Math.random() * WITTY.length))
    const t = window.setInterval(() => setLineIdx(i => (i + 1) % WITTY.length), 4200)
    return () => window.clearInterval(t)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)

    const pwCheck = validatePassword(password)
    if (!pwCheck.ok) {
      setErr(pwCheck.message)
      return
    }

    setLoading(true)
    try {
      const { error } = await signIn(email.trim(), password)
      if (error) {
        setErr(error.message)
        return
      }
      gaEvent('login_success')
      const next = searchParams.get('next')
      const safeNext = next && next.startsWith('/') ? next : '/'
      router.replace(safeNext)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout mode="login">
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="pd-auth-title text-2xl font-extrabold">כניסה</h2>
          <p className="pd-auth-subtitle text-sm">
            <span key={lineIdx} className="pd-witty inline-block">{WITTY[lineIdx]}</span>
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">אימייל</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              type="email"
              autoComplete="email"
              placeholder='הזן מייל'
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">סיסמה</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              type="password"
              autoComplete="current-password"
              placeholder='הזן סיסמא'
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <div className="text-xs text-black/55">{PASSWORD_HINT_HE}</div>
          </div>

          {err ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : null}

          <button
            className="pd-auth-btn w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
            disabled={loading}
            type="submit"
          >
            {loading ? 'נכנסים…' : 'כניסה'}
          </button>
        </form>

        <div className="text-sm text-black/70">
          <Link href="/auth/forgot-password" className="font-semibold text-blue-700 hover:underline">
            שכחת סיסמה?
          </Link>
        </div>

        <div className="text-sm text-black/70">
          אין לך משתמש?{' '}
          <Link href="/auth/signup" className="font-semibold text-blue-700 hover:underline">הרשמה</Link>
        </div>
      </div>
    </AuthLayout>
  )
}
