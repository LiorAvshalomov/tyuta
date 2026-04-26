'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import FeedIntentLink from '@/components/FeedIntentLink'
import { useAdminToken } from '@/lib/admin/adminFetch'
import {
  LayoutDashboard,
  Flag,
  Mail,
  FileText,
  Users,
  Inbox,
  Megaphone,
  Shield,
  Lock,
  Menu,
  X,
  ArrowLeft,
  Sun,
  Moon,
} from 'lucide-react'
import { setStoredTheme, resolveTheme, applyTheme } from '@/lib/theme'
import { AdminBadgesContext, EMPTY_ADMIN_BADGES, type AdminBadgeCounts } from '@/lib/admin/AdminBadgesContext'

type BadgeKey = 'reports' | 'contact' | 'failedLogins' | 'inbox'

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  badgeKey?: BadgeKey
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'סקירה',
    items: [
      { href: '/admin', label: 'סקירה', icon: <LayoutDashboard size={17} /> },
    ],
  },
  {
    label: 'תוכן ומשתמשים',
    items: [
      { href: '/admin/reports',    label: 'דיווחים',     icon: <Flag size={17} />,     badgeKey: 'reports' },
      { href: '/admin/contact',    label: 'צור קשר',     icon: <Mail size={17} />,     badgeKey: 'contact' },
      { href: '/admin/posts',      label: 'פוסטים',      icon: <FileText size={17} /> },
      { href: '/admin/moderation', label: 'מודרציה',     icon: <Shield size={17} /> },
      { href: '/admin/users',      label: 'משתמשים',     icon: <Users size={17} /> },
    ],
  },
  {
    label: 'מערכת',
    items: [
      { href: '/admin/inbox',    label: 'אינבוקס',     icon: <Inbox size={17} />,    badgeKey: 'inbox' },
      { href: '/admin/system',   label: 'הודעת מערכת', icon: <Megaphone size={17} /> },
      { href: '/admin/security', label: 'אבטחה',       icon: <Lock size={17} />,     badgeKey: 'failedLogins' },
    ],
  },
]

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="mr-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavLink({
  item,
  active,
  badges,
  onClick,
}: {
  item: NavItem
  active: boolean
  badges: AdminBadgeCounts
  onClick?: () => void
}) {
  const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={
        'flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-sm font-medium transition-colors duration-100 ' +
        (active
          ? 'border-r-2 border-neutral-900 dark:border-neutral-100 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-semibold'
          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100')
      }
    >
      <span className={
        active
          ? 'shrink-0 text-neutral-700 dark:text-neutral-200'
          : 'shrink-0 text-neutral-400 dark:text-neutral-500'
      }>
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
      <Badge count={badgeCount} />
    </Link>
  )
}

function NavSection({
  group,
  isActive,
  badges,
  onItemClick,
}: {
  group: NavGroup
  isActive: (href: string) => boolean
  badges: AdminBadgeCounts
  onItemClick?: () => void
}) {
  return (
    <div className="mb-0.5">
      <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-600">
        {group.label}
      </div>
      <div className="grid gap-0.5">
        {group.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            badges={badges}
            onClick={onItemClick}
          />
        ))}
      </div>
    </div>
  )
}

function getPageTitle(pathname: string): string {
  if (pathname === '/admin') return 'סקירה'
  const match = ALL_NAV_ITEMS.find((n) => n.href !== '/admin' && pathname.startsWith(n.href))
  return match?.label ?? 'ניהול'
}

const EMPTY_BADGES = EMPTY_ADMIN_BADGES
const POLL_MS = 30_000

function LogoMark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1a1a18] dark:bg-white text-[13px] font-black text-white dark:text-neutral-900 select-none ${className}`}>
      ט
    </div>
  )
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname()
  const getToken  = useAdminToken()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [badges, setBadges]         = useState<AdminBadgeCounts>(EMPTY_BADGES)
  const [isDark, setIsDark]         = useState(false)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Sync dark-state from live DOM on mount (theme may have been set by the
  // inline bootstrap script before React hydrated). The synchronous setState
  // is intentional — this is a hydration-safe pattern used throughout the app.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggleTheme() {
    const next = isDark ? 'light' : 'dark'
    setStoredTheme(next)
    applyTheme(resolveTheme(next))
    setIsDark(!isDark)
  }

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  // Poll badge counts — lightweight, no WebSocket needed at this scale
  useEffect(() => {
    let cancelled = false

    async function fetchBadges() {
      try {
        const token = await getToken()
        if (!token || cancelled) return
        const res = await fetch('/api/admin/badges', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return
        const data = await res.json() as Omit<AdminBadgeCounts, 'loaded'>
        if (!cancelled) setBadges({ ...data, loaded: true })
      } catch { /* best-effort — badge failure must never crash the shell */ }
    }

    void fetchBadges()
    const id = setInterval(fetchBadges, POLL_MS)

    // Refresh immediately when the admin returns to this tab
    function onVisible() {
      if (!document.hidden) void fetchBadges()
    }
    function onFocus() { void fetchBadges() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [getToken])

  const pageTitle = getPageTitle(pathname)

  const sidebarNav = (onItemClick?: () => void) => (
    <>
      {NAV_GROUPS.map((group) => (
        <NavSection
          key={group.label}
          group={group}
          isActive={isActive}
          badges={badges}
          onItemClick={onItemClick}
        />
      ))}
    </>
  )

  return (
    <AdminBadgesContext.Provider value={badges}>
    <div className="flex h-[100dvh] overflow-hidden bg-[#f7f6f3] dark:bg-neutral-950" dir="rtl">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden w-[248px] shrink-0 flex-col border-l border-neutral-200 dark:border-neutral-800 bg-[#faf9f7] dark:bg-neutral-900 md:flex">

        {/* Brand */}
        <div className="flex h-14 items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 px-4">
          <LogoMark />
          <div className="min-w-0">
            <div className="text-[13px] font-bold leading-tight text-neutral-900 dark:text-neutral-100">Tyuta</div>
            <div className="text-[10px] leading-none text-neutral-400 dark:text-neutral-500 font-medium tracking-widest">מרחב ניהול</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sidebarNav()}
        </nav>

        {/* Footer */}
        <div className="border-t border-neutral-200 dark:border-neutral-800 px-2 py-2.5">
          <FeedIntentLink
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            <ArrowLeft size={15} />
            <span>חזרה לאתר</span>
          </FeedIntentLink>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-[#faf9f7] dark:bg-neutral-900 px-4 md:px-5">

          {/* Mobile: hamburger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors md:hidden"
            aria-label="פתח תפריט"
          >
            <Menu size={19} />
            {(badges.reports > 0 || badges.failedLogins > 0) && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
            )}
          </button>

          <h1 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{pageTitle}</h1>

          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label={isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
            title={isDark ? 'מצב בהיר' : 'מצב כהה'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Mobile: back to site */}
          <FeedIntentLink
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 md:hidden transition-colors"
          >
            <ArrowLeft size={13} />
            <span>לאתר</span>
          </FeedIntentLink>
        </header>

        {/* Content */}
        <main className={pathname === '/admin/inbox' ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto overflow-x-hidden'}>
          <div className={
            pathname === '/admin/inbox'
              ? 'flex h-full min-h-0 flex-col overflow-hidden px-4 py-4 md:px-5'
              : 'mx-auto max-w-7xl px-4 py-6 md:px-6'
          }>{children}</div>
        </main>
      </div>

      {/* ── Mobile Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-[2px]"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <aside className="absolute top-0 right-0 bottom-0 flex w-[268px] flex-col overflow-hidden bg-[#faf9f7] dark:bg-neutral-900 shadow-2xl">

            {/* Drawer brand + close */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-4">
              <div className="flex items-center gap-3">
                <LogoMark />
                <div className="min-w-0">
                  <div className="text-[13px] font-bold leading-tight text-neutral-900 dark:text-neutral-100">Tyuta</div>
                  <div className="text-[10px] leading-none text-neutral-400 dark:text-neutral-500 font-medium tracking-widest">מרחב ניהול</div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                aria-label="סגור תפריט"
              >
                <X size={19} />
              </button>
            </div>

            {/* Drawer nav */}
            <nav className="flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sidebarNav(closeDrawer)}
            </nav>

            {/* Drawer footer */}
            <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 px-2 py-2.5">
              <FeedIntentLink
                href="/"
                onClick={closeDrawer}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                <ArrowLeft size={15} />
                <span>חזרה לאתר</span>
              </FeedIntentLink>
            </div>
          </aside>
        </div>
      )}
    </div>
    </AdminBadgesContext.Provider>
  )
}
