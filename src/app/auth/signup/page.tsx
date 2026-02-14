'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AuthLayout from '@/components/AuthLayout'
import { isUsernameTaken, signUp, slugifyUsername } from '@/lib/auth'
import { PASSWORD_HINT_HE, validatePassword } from '@/lib/password'

const WITTY = [
  'פותחים דף חדש.',
  'ברגע אחד קטן מתחילים.',
  'מחברת אחת. אמת אחת.',
  'לפעמים מספיק רק שורה אחת.',
  'גם טיוטה היא התחלה.',
  'היום זה יום טוב להתחיל.',
  'אם לא עכשיו, אז מתי?',
  'מה שלא נאמר מקומו להיכתב.'
]

export default function SignupPage() {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const normalizedUsername = useMemo(() => slugifyUsername(username), [username])

  const [lineIdx, setLineIdx] = useState(() => Math.floor(Math.random() * WITTY.length))
  useEffect(() => {
    const t = window.setInterval(() => setLineIdx(i => (i + 1) % WITTY.length), 4200)
    return () => window.clearInterval(t)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)

    const dn = displayName.trim()
    const un = normalizedUsername

    if (!dn) return setErr('אנא הזן/י שם תצוגה')
    if (!un || un.length < 3) return setErr('שם משתמש חייב להיות לפחות 3 תווים (a-z, 0-9, _)')
    if (!email.trim() || !password) return setErr('אנא מלא/י אימייל וסיסמה')

    const pwCheck = validatePassword(password)
    if (!pwCheck.ok) return setErr(pwCheck.message)

    setLoading(true)
    try {
      const taken = await isUsernameTaken(un)
      if (taken) return setErr('שם המשתמש כבר תפוס. נסה/י משהו אחר.')

      const { error } = await signUp({
        email: email.trim(),
        password,
        username: un,
        display_name: dn,
      })

      if (error) {
        setErr(error.message)
        return
      }

      setMsg('נרשמת בהצלחה 🎉 אם יש אימות מייל – בדוק/י את המייל ואז אפשר להתחבר.')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'שגיאה לא צפויה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout mode="signup">
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="pd-auth-title text-2xl font-extrabold">הרשמה</h2>
          <p className="pd-auth-subtitle text-sm">
            <span key={lineIdx} className="pd-witty inline-block">{WITTY[lineIdx]}</span>
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">שם תצוגה</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="למשל: ליאור / אנונימי"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">שם משתמש (באנגלית)</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="pen_writer_12"
              required
            />
            <div className="text-xs text-black/55">
              נשמר כ: <b className="text-black/70">{normalizedUsername || '—'}</b>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">אימייל</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              type="email"
              autoComplete="email"
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
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <div className="text-xs text-black/55">{PASSWORD_HINT_HE}</div>
          </div>

          {err ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : null}

          {msg ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>
          ) : null}

          <p className="text-xs leading-5 text-black/60">
            בלחיצה על <span className="font-semibold text-black/75">"יצירת משתמש"</span> את/ה מאשר/ת שקראת והסכמת ל־{' '}
            <Link href="/terms" className="font-semibold text-blue-700 hover:underline">
              תנאי השימוש
            </Link>{' '}
            ול־{' '}
            <Link href="/privacy" className="font-semibold text-blue-700 hover:underline">
              מדיניות הפרטיות
            </Link>
            .
          </p>

          <button
            className="pd-auth-btn w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
            disabled={loading}
            type="submit"
          >
            {loading ? 'נרשמים…' : 'יצירת משתמש'}
          </button>
        </form>

        <div className="text-sm text-black/70">
          כבר יש לך משתמש?{' '}
          <Link href="/auth/login" className="font-semibold text-blue-700 hover:underline">כניסה</Link>
        </div>
      </div>
    </AuthLayout>
  )
}
