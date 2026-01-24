'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import FloatingStationery from '@/components/auth/FloatingStationery'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const title = mode === 'login' ? 'התחברות' : 'הרשמה'
  const subtitle = mode === 'login'
    ? 'נעים לראות אותך שוב.'
    : 'עוד רגע ומתחילים לכתוב.'

  const hint = useMemo(() => {
    return mode === 'login'
      ? 'כאן לא מודדים לייקים. רק מחשבות.'
      : 'אחת ולתמיד: מילים הן כוח.'
  }, [mode])

  return (
    <main className="relative min-h-[calc(100vh-72px)] bg-[#fafaf8]">
      {/* background */}
      <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_40%,rgba(2,132,199,0.08),transparent_55%),radial-gradient(900px_500px_at_15%_55%,rgba(16,185,129,0.08),transparent_60%),radial-gradient(900px_500px_at_85%_60%,rgba(245,158,11,0.06),transparent_62%)]" />
      <FloatingStationery />

      {/* content grid */}
      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 py-16 md:grid-cols-2 md:items-center">
        {/* form card */}
        <section className="order-2 md:order-1">
          <div className="w-full max-w-md rounded-3xl border bg-white/85 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">{title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              </div>

              <div className="flex items-center rounded-full bg-muted p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={[
                    'rounded-full px-3 py-1.5 transition',
                    mode === 'login' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  התחברות
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={[
                    'rounded-full px-3 py-1.5 transition',
                    mode === 'signup' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  הרשמה
                </button>
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-2">
                <label className="text-sm font-medium">אימייל</label>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@email.com"
                  className="h-11 w-full rounded-full border bg-white px-4 outline-none transition focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">סיסמה</label>
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-full border bg-white px-4 outline-none transition focus:ring-2 focus:ring-black/10"
                />
              </div>

              <button
                type="submit"
                className="h-11 w-full rounded-full bg-black text-white shadow-sm transition hover:opacity-95 active:translate-y-[1px]"
              >
                {mode === 'login' ? 'להיכנס לכתוב' : 'לפתוח מחברת חדשה'}
              </button>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Link href="/forgot" className="underline underline-offset-4 hover:text-foreground">
                  שכחת סיסמה?
                </Link>
                <span className="text-[11px]">{hint}</span>
              </div>

              <p className="pt-2 text-[11px] leading-5 text-muted-foreground">
                בהמשך נוסיף גם “התחברות מהירה”. כרגע, אם נתקעת — דבר איתנו.
              </p>
            </form>
          </div>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            חוזר לדף הבית?{' '}
            <Link href="/" className="underline underline-offset-4 hover:text-foreground">
              כן, תודה
            </Link>
          </div>
        </section>

        {/* copy */}
        <section className="order-1 md:order-2">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              ✍️ <span>PenDemic</span>
              <span className="opacity-60">—</span>
              <span>מקום לכתוב, בשקט</span>
            </div>

            <h2 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
              ברוך/ה שוב.
            </h2>
            <p className="mt-3 max-w-lg text-base leading-7 text-muted-foreground">
              כאן לא מודדים לייקים. רק מחשבות. לפעמים מילה אחת מספיקה כדי להתחיל.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-2 text-sm shadow-sm backdrop-blur">
                📚 <span>פריקה · סיפורים · מגזין</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-2 text-sm shadow-sm backdrop-blur">
                🔒 <span>המילים שלך נשארות שלך</span>
              </span>
            </div>

            <p className="mt-10 text-xs text-muted-foreground">
              טיפ: אם אתה/את על מחשב, נסה/י להקטין מעט את הזום — ואז לראות את החפצים “צפים” ברקע.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
