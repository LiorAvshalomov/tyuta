'use client'

import Link from 'next/link'
import { useState } from 'react'
import AuthLayout from '@/components/AuthLayout'
import { sendPasswordResetEmail } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'


export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)

    const em = email.trim()
    if (!em) {
      setErr('אנא הזן/י אימייל')
      return
    }

    setLoading(true)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tyuta.net'
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const redirectTo = `${baseUrl}/auth/reset-password`;
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      const { error } = await sendPasswordResetEmail(em, redirectTo)
      if (error) {
        setErr(error.message)
        return
      }
      setMsg('אם קיים משתמש עם האימייל הזה — נשלח אליו קישור לאיפוס סיסמה. בדוק/י את המייל.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout mode="forgot">
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="pd-auth-title text-2xl font-extrabold">שכחת סיסמה?</h2>
          <p className="pd-auth-subtitle text-sm">נשלח לך מייל עם קישור לאיפוס.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
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

          {err ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : null}

          {msg ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {msg}
            </div>
          ) : null}

          <button
            className="pd-auth-btn w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
            disabled={loading}
            type="submit"
          >
            {loading ? 'שולחים…' : 'שליחת קישור לאיפוס'}
          </button>
        </form>

        <div className="text-sm text-black/70">
          <Link href="/auth/login" className="font-semibold text-blue-700 hover:underline">חזרה לכניסה</Link>
        </div>
      </div>
    </AuthLayout>
  )
}
