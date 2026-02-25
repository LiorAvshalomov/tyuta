"use client"

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const STORAGE_PREFIX = 'tyuta:beta_notice:dismissed:'

function storageKeyForUser(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

export default function BetaWelcomeModal() {
  const [open, setOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const storageKey = useMemo(() => (userId ? storageKeyForUser(userId) : null), [userId])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id ?? null
      if (cancelled) return

      setUserId(uid)
      if (!uid) {
        setOpen(false)
        return
      }

      const key = storageKeyForUser(uid)
      const dismissed = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
      setOpen(!dismissed)
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [])

  const close = () => {
    if (dontShowAgain && storageKey) {
      window.localStorage.setItem(storageKey, String(Date.now()))
    }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      {/* No blur per project rules */}
      <button
        type="button"
        aria-label="סגור"
        onClick={close}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative w-full max-w-sm rounded-2xl border bg-white p-5 shadow-xl" dir="rtl">
        <div className="space-y-2">
          <div className="text-lg font-bold">Tyuta בהרצה ✨</div>
          <p className="text-sm text-black/70 leading-6">
            האתר עדיין מתפתח ומשתפר 
ואת/ה כבר חלק מההתחלה שלו.  האתר פתוח, עובד, ומחכה למילים שלך. <br />
            תרגיש/י חופשי להנות מהפיצ׳רים, לכתוב, לגלות, ולהתנסות.
          </p>
          <p className="text-sm text-black/70 leading-6">
            אם גילית/ה מקום לשיפור או באג נשמח אם תכתבו לנו דרך{' '}
            
            <Link href="/contact" className="font-semibold text-blue-700 hover:underline">צור קשר</Link>
              {" או  "}
            
            <Link href="https://www.facebook.com/groups/935130912366040" className="font-semibold text-blue-700 hover:underline">קבוצת הפייסבוק שלנו</Link>
            , ונטפל בהקדם.
          </p>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-black/70 select-none">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4"
          />
          לא להציג שוב
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}
