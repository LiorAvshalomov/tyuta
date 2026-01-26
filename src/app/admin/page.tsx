'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/admin/adminFetch'

function getErr(j: any, fallback: string) {
  return j?.error?.message ?? j?.error ?? fallback
}

export default function AdminHome() {
  const [openReports, setOpenReports] = useState<number | null>(null)
  const [openContact, setOpenContact] = useState<number | null>(null)
  const [stats, setStats] = useState<any | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [r1, r2] = await Promise.all([
          adminFetch('/api/admin/reports?status=open&limit=200'),
          adminFetch('/api/admin/contact?status=open&limit=200'),
        ])
        const r3 = await adminFetch('/api/admin/stats')
        const j1 = await r1.json()
        const j2 = await r2.json()
        const j3 = await r3.json().catch(() => ({}))

        if (!alive) return
        if (!r1.ok) throw new Error(getErr(j1, 'Failed to load reports'))
        if (!r2.ok) throw new Error(getErr(j2, 'Failed to load contact'))
        if (r3.ok) setStats(j3?.stats ?? null)
        setOpenReports((j1?.reports ?? []).length)
        setOpenContact((j2?.messages ?? []).length)
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message ?? 'שגיאה')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div>
      <div className="text-lg font-black">סקירה</div>
      <div className="mt-1 text-sm text-muted-foreground">נקודת התחלה מהירה לניהול האתר.</div>

      {err && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/reports"
          className="rounded-3xl border border-black/5 bg-[#FAF9F6] p-4 shadow-sm hover:bg-white"
        >
          <div className="text-sm font-black">דיווחים פתוחים</div>
          <div className="mt-1 text-3xl font-black">{openReports ?? '—'}</div>
          <div className="mt-2 text-xs text-muted-foreground">הטרדה / ספאם / אחר</div>
        </Link>

        <Link
          href="/admin/contact"
          className="rounded-3xl border border-black/5 bg-[#FAF9F6] p-4 shadow-sm hover:bg-white"
        >
          <div className="text-sm font-black">פניות “צור קשר” פתוחות</div>
          <div className="mt-1 text-3xl font-black">{openContact ?? '—'}</div>
          <div className="mt-2 text-xs text-muted-foreground">בקשות / פידבק / בעיות</div>
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-3xl border border-black/5 bg-white/60 p-4 shadow-sm">
          <div className="text-xs font-bold text-muted-foreground">משתמשים</div>
          <div className="mt-1 text-3xl font-black">{stats?.users_total ?? '—'}</div>
        </div>
        <div className="rounded-3xl border border-black/5 bg-white/60 p-4 shadow-sm">
          <div className="text-xs font-bold text-muted-foreground">פוסטים (סה״כ)</div>
          <div className="mt-1 text-3xl font-black">{stats?.posts_total ?? '—'}</div>
        </div>
        <div className="rounded-3xl border border-black/5 bg-white/60 p-4 shadow-sm">
          <div className="text-xs font-bold text-muted-foreground">פורסמו</div>
          <div className="mt-1 text-3xl font-black">{stats?.posts_published ?? '—'}</div>
        </div>
        <div className="rounded-3xl border border-black/5 bg-white/60 p-4 shadow-sm">
          <div className="text-xs font-bold text-muted-foreground">נמחקו (soft)</div>
          <div className="mt-1 text-3xl font-black">{stats?.posts_deleted ?? '—'}</div>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-black/5 bg-white/60 p-4 text-sm text-muted-foreground">
        סטטיסטיקות “כניסות” אמיתיות מומלץ לחבר ל‑Vercel Analytics / Plausible. כרגע יש לנו ספירה בסיסית דרך DB.
      </div>
    </div>
  )
}
