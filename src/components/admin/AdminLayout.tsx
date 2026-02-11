'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AdminGuard from './AdminGuard'

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = pathname === href
  return (
    <Link
      href={href}
      className={
        'rounded-2xl px-3 py-2 text-sm font-bold transition ' +
        (active
          ? 'bg-black text-white shadow-sm'
          : 'border border-black/5 bg-white/60 hover:bg-white')
      }
    >
      {label}
    </Link>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="min-h-[calc(100dvh-120px)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-2xl font-black">פאנל ניהול</div>
              <div className="mt-1 text-sm text-muted-foreground">דיווחים · צור קשר · ועוד</div>
            </div>
            <Link
              href="/"
              className="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-sm font-bold shadow-sm backdrop-blur hover:bg-white"
            >
              חזרה לאתר
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <aside className="rounded-3xl border border-black/5 bg-white/70 p-3 shadow-sm backdrop-blur">
              <div className="grid gap-1">
                <NavLink href="/admin" label="סקירה" />
                <NavLink href="/admin/reports" label="דיווחים" />
                <NavLink href="/admin/contact" label="צור קשר" />
                <NavLink href="/admin/posts" label="פוסטים" />
                <NavLink href="/admin/users" label="משתמשים" />
                <NavLink href="/admin/inbox" label="אינבוקס" />
                <NavLink href="/admin/system" label="הודעת מערכת" />
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-[#FAF9F6] p-3 text-xs text-muted-foreground">
                פאנל אדמין (מינימלי אבל חזק): דיווחים + צור קשר + ניהול פוסטים + הודעות מערכת. בהמשך נוסיף סטטיסטיקות ופעולות מתקדמות.
              </div>
            </aside>

            <main className="min-w-0 rounded-3xl border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur">
              {children}
            </main>
          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
