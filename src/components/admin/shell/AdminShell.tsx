'use client'

import { useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Flag,
  Mail,
  FileText,
  Users,
  Inbox,
  Megaphone,
  Shield,
  Menu,
  X,
  ArrowLeft,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'סקירה', icon: <LayoutDashboard size={18} /> },
  { href: '/admin/reports', label: 'דיווחים', icon: <Flag size={18} /> },
  { href: '/admin/contact', label: 'צור קשר', icon: <Mail size={18} /> },
  { href: '/admin/posts', label: 'פוסטים', icon: <FileText size={18} /> },
  { href: '/admin/moderation', label: 'מודרציה',     icon: <Shield size={18} /> },
  { href: '/admin/users', label: 'משתמשים', icon: <Users size={18} /> },
  { href: '/admin/inbox', label: 'אינבוקס', icon: <Inbox size={18} /> },
  { href: '/admin/system',     label: 'הודעת מערכת', icon: <Megaphone size={18} /> },
]

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem
  active: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'bg-neutral-900 text-white'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')
      }
    >
      <span className={active ? 'text-white' : 'text-neutral-400'}>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  )
}

function getPageTitle(pathname: string): string {
  if (pathname === '/admin') return 'סקירה'
  const match = NAV_ITEMS.find((n) => n.href !== '/admin' && pathname.startsWith(n.href))
  return match?.label ?? 'ניהול'
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const pageTitle = getPageTitle(pathname)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-neutral-50" dir="rtl">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-l border-neutral-200 bg-white md:flex">
        {/* Logo / Brand */}
        <div className="flex h-14 items-center gap-2 border-b border-neutral-200 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-xs font-black text-white">
            T
          </div>
          <span className="text-sm font-bold text-neutral-900">Tyuta Admin</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="grid gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </div>
        </nav>

        {/* Bottom */}
        <div className="border-t border-neutral-200 px-3 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <ArrowLeft size={16} />
            <span>חזרה לאתר</span>
          </Link>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 md:px-6">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 md:hidden"
            aria-label="פתח תפריט"
          >
            <Menu size={20} />
          </button>

          <h1 className="text-sm font-bold text-neutral-900">{pageTitle}</h1>

          <div className="flex-1" />

          {/* Topbar right - back to site on mobile */}
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 md:hidden"
          >
            <ArrowLeft size={14} />
            <span>לאתר</span>
          </Link>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className={
            pathname === '/admin/inbox'
              ? 'flex h-full flex-col px-4 py-4 md:px-5'
              : 'mx-auto max-w-7xl px-4 py-6 md:px-6'
          }>{children}</div>
        </main>
      </div>

      {/* ── Mobile Drawer Overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 transition-opacity"
            onClick={closeDrawer}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <aside className="absolute top-0 right-0 bottom-0 w-[280px] bg-white shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-xs font-black text-white">
                  P
                </div>
                <span className="text-sm font-bold text-neutral-900">Tyuta Admin</span>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100"
                aria-label="סגור תפריט"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="px-3 py-3">
              <div className="grid gap-0.5">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActive(item.href)}
                    onClick={closeDrawer}
                  />
                ))}
              </div>
            </nav>

            <div className="border-t border-neutral-200 px-3 py-3">
              <Link
                href="/"
                onClick={closeDrawer}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <ArrowLeft size={16} />
                <span>חזרה לאתר</span>
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
