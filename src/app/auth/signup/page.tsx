'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthLayout from '@/components/AuthLayout'
import { isUsernameTaken, signUp, slugifyUsername } from '@/lib/auth'
import { PASSWORD_HINT_HE, validatePassword } from '@/lib/password'
import { USERNAME_MAX, DISPLAY_NAME_MAX } from '@/lib/validation'
import { event as gaEvent } from '@/lib/gtag'
import { supabase } from '@/lib/supabaseClient'
import { mapUserFacingError } from '@/lib/mapSupabaseError'

const WITTY = [
  'פותחים דף חדש.',
  'ברגע אחד קטן מתחילים.',
  'לפעמים מספיק רק שורה אחת.',
  'גם טיוטה היא התחלה.',
  'היום זה יום טוב להתחיל.',
  'אם לא עכשיו, אז מתי?',
  'מה שלא נאמר מקומו להיכתב.'
]

export default function SignupPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const normalizedUsername = useMemo(() => slugifyUsername(username).slice(0, USERNAME_MAX), [username])

  // After successful signup, poll for session (email confirmation in another tab) and redirect
  useEffect(() => {
    if (!msg) return
    let cancelled = false
    const t = window.setInterval(async () => {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (cancelled) return
      if (session?.user?.id) {
        router.replace('/')
      }
    }, 2000)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [msg, router])

  // NOTE: must be deterministic on the first render to avoid SSR hydration mismatch.
  const [lineIdx, setLineIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // Start from a random line, but only after mount (client-side).
    setMounted(true)
    setLineIdx(Math.floor(Math.random() * WITTY.length))
    const t = window.setInterval(() => setLineIdx(i => (i + 1) % WITTY.length), 4200)
    return () => window.clearInterval(t)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading || msg) return
    setErr(null)
    setMsg(null)

    const dn = displayName.trim()
    const un = normalizedUsername

    if (!dn) return setErr('אנא הזן/י שם תצוגה')
    if (dn.length > DISPLAY_NAME_MAX) return setErr(`שם תצוגה יכול להיות עד ${DISPLAY_NAME_MAX} תווים`)
    if (!un || un.length < 3) return setErr('שם משתמש חייב להיות לפחות 3 תווים (a-z, 0-9, _)')
    if (un.length > USERNAME_MAX) return setErr(`שם משתמש יכול להיות עד ${USERNAME_MAX} תווים`)
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

      gaEvent('signup_success')
      setMsg(`ההרשמה עברה בהצלחה! 🎉
שלחנו מייל לאימות החשבון (כדאי לבדוק גם בתיקיית הספאם או בקידומי מכירות).
מיד לאחר האישור אפשר להתחבר.`)
    } catch (e: unknown) {
      setErr(mapUserFacingError(e, 'לא הצלחנו להשלים את ההרשמה. נסו שוב.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout mode="signup">
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="pd-auth-title text-3xl font-black tracking-tight">הרשמה</h2>
          <p className="pd-auth-subtitle text-sm">
            {/* Render a deterministic line on the server / first paint, then rotate after mount */}
            <span className="pd-witty inline-block">{mounted ? WITTY[lineIdx] : WITTY[0]}</span>
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">שם תצוגה</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="למשל: lior / ליאור / אנונימי"
              maxLength={DISPLAY_NAME_MAX}
              required
            />

          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">שם משתמש (באנגלית)</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="book_writer_12"
              maxLength={USERNAME_MAX}
              required
            />
            
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-black/80">אימייל</label>
            <input
              className="pd-auth-input w-full rounded-2xl px-4 py-3 text-sm"
              type="email"
              autoComplete="email"
              placeholder='example@gmail.com'
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
              placeholder='( a-z, 0-9, _ )'
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
            בלחיצה על <span className="font-semibold text-black/75">&quot;יצירת משתמש&quot;</span> את/ה מאשר/ת שקראת והסכמת ל־{' '}
            <Link href="/terms" className="pd-auth-link">
              תנאי השימוש
            </Link>{' '}
            ול־{' '}
            <Link href="/privacy" className="pd-auth-link">
              מדיניות הפרטיות
            </Link>
            .
          </p>

          <button
            className="pd-auth-btn w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
            disabled={loading || !!msg}
            type="submit"
          >
            {loading ? 'נרשמים…' : 'יצירת משתמש'}
          </button>
        </form>

        <div className="text-sm text-black/70">
          כבר יש לך משתמש?{' '}
          <Link href="/auth/login" className="pd-auth-link">כניסה</Link>
        </div>
      </div>
    </AuthLayout>
  )
}
