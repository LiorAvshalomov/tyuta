'use client'

import Link from 'next/link'
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { resolveUserIdentity } from '@/lib/systemIdentity'
import SearchPostsBar from '@/components/SearchPostsBar'
import { supabase } from '@/lib/supabaseClient'
import { getModerationStatus } from '@/lib/moderation'
import {
  Menu,
  Search,
  Home,
  Edit,
  User,
  LogOut,
  Settings,
  Trash2,
  BookOpen,
  PenTool,
  FileText,
  Newspaper,
  ChevronDown,
  NotebookPen,
  MessageCircle,
} from 'lucide-react'
import NotificationsBell from "@/components/NotificationsBell"
import { broadcastAuthEvent, setAuthState } from '@/lib/auth/authEvents'
import { truncateText } from '@/lib/validation'
import ThemeToggle from '@/components/ThemeToggle'


type MiniUser = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

type ThreadRow = {
  conversation_id: string
  other_user_id: string
  other_username: string
  other_display_name: string
  other_avatar_url: string | null
  last_created_at: string | null
  last_body: string | null
  unread_count: number | null
}

function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onOutside: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return
    function onDown(e: MouseEvent) {
      const el = ref.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [enabled, onOutside, ref])
}

function ChannelsInline({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) {
  const items = [
    {
      label: 'פריקה',
      href: '/c/release',
      icon: PenTool,
      colorClass: 'text-stone-500',
      hoverClass: 'hover:bg-stone-50',
      borderClass: 'border-stone-200',
    },
    {
      label: 'סיפורים',
      href: '/c/stories',
      icon: FileText,
      colorClass: 'text-slate-500',
      hoverClass: 'hover:bg-slate-50',
      borderClass: 'border-slate-200',
    },
    {
      label: 'כתבות',
      href: '/c/magazine',
      icon: Newspaper,
      colorClass: 'text-neutral-500',
      hoverClass: 'hover:bg-neutral-50',
      borderClass: 'border-neutral-200',
    },
  ]

  return (
    <nav
      className={`flex items-center ${mobile ? 'flex-col w-full' : 'justify-center'} gap-2.5`}
      dir="rtl"
      aria-label="קטגוריות"
    >
      {items.map(it => {
        const Icon = it.icon
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            className={`group inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold bg-white dark:bg-card border ${it.borderClass} dark:border-border ${it.hoverClass} dark:hover:bg-muted hover:shadow-sm transition-all duration-200 whitespace-nowrap ${mobile ? 'w-full justify-start' : ''}`}
          >
            <Icon size={17} strokeWidth={2.5} className={`${it.colorClass} group-hover:scale-110 transition-transform`} />
            <span className="text-neutral-700 dark:text-foreground group-hover:text-neutral-900 dark:group-hover:text-foreground transition-colors">{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function formatDateTime(dt: string) {
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mi} · ${dd}.${mm}.${yy}`
}

export default function SiteHeader() {
  const router = useRouter()
  const pathname = usePathname()

  // Used for UI overrides (showing "מערכת האתר" instead of the system user's profile).
  // Not a secret; it is safe as NEXT_PUBLIC.
  const isAuthPage =
    (pathname ?? '').startsWith('/auth/login') ||
    (pathname ?? '').startsWith('/auth/register') ||
    (pathname ?? '').startsWith('/auth/signup') ||
    (pathname ?? '').startsWith('/auth/forgot-password') ||
    (pathname ?? '').startsWith('/auth/reset-password') ||
    pathname === '/login' ||
    pathname === '/register'
  const [user, setUser] = useState<MiniUser | null>(null)

  // dropdown states
  const [writeOpen, setWriteOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const [mobileSearch, setMobileSearch] = useState('')

  // mobile accordions
  const [mobileWriteOpen, setMobileWriteOpen] = useState(false)
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false)

  const writeRef = useRef<HTMLDivElement | null>(null)
  const profileRef = useRef<HTMLDivElement | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const mobileMenuRef = useRef<HTMLDivElement | null>(null)

  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [msgUnread, setMsgUnread] = useState(0)

  const anyOpen = useMemo(
    () => writeOpen || profileOpen || messagesOpen,
    [writeOpen, profileOpen, messagesOpen]
  )

  const closeAll = useCallback(() => {
    setWriteOpen(false)
    setProfileOpen(false)
    setMessagesOpen(false)
    setMobileMenuOpen(false)
    setMobileWriteOpen(false)
    setMobileProfileOpen(false)
    // Also close notifications overlay if open.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tyuta:close-notifications'))
    }
  }, [])

  useClickOutside(writeRef, () => setWriteOpen(false), writeOpen)
  useClickOutside(profileRef, () => setProfileOpen(false), profileOpen)
  useClickOutside(messagesRef, () => setMessagesOpen(false), messagesOpen)

  // Allow other components (NotificationsBell, etc.) to request closing header menus.
  useEffect(() => {
    const onCloseMobile = () => setMobileMenuOpen(false)
    const onCloseDropdowns = () => {
      setWriteOpen(false)
      setProfileOpen(false)
      setMessagesOpen(false)
    }

    window.addEventListener('tyuta:close-mobile-menu', onCloseMobile as EventListener)
    window.addEventListener('tyuta:close-header-dropdowns', onCloseDropdowns as EventListener)
    return () => {
      window.removeEventListener('tyuta:close-mobile-menu', onCloseMobile as EventListener)
      window.removeEventListener('tyuta:close-header-dropdowns', onCloseDropdowns as EventListener)
    }
  }, [])

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (!mobileMenuOpen) return

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const menuButton = document.querySelector('button[aria-label="תפריט"]')
      const mobileMenu = mobileMenuRef.current

      if (
        mobileMenu &&
        !mobileMenu.contains(e.target as Node) &&
        menuButton &&
        !menuButton.contains(e.target as Node)
      ) {
        closeAll()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [mobileMenuOpen, closeAll])

  useEffect(() => {
    if (!anyOpen && !mobileMenuOpen) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAll()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyOpen, mobileMenuOpen, closeAll])

  const loadUser = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const session = data.session

    if (!session?.user?.id) {
      setUser(null)
      return
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', session.user.id)
      .single()

    if (prof?.id && prof?.username) {
      setUser({
        id: prof.id,
        username: prof.username,
        displayName: (prof.display_name ?? '').trim() || prof.username || 'אנונימי',
        avatarUrl: prof.avatar_url ?? null,
      })
    } else {
      setUser(null)
    }
  }, [])

  const loadThreads = useCallback(async (): Promise<ThreadRow[]> => {
    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id
    if (!uid) {
      setThreads([])
      setMsgUnread(0)
      return []
    }

    const { data: rows, error } = await supabase
      .from('inbox_threads')
      .select(
        'conversation_id,other_user_id,other_username,other_display_name,other_avatar_url,last_body,last_created_at,unread_count'
      )
      .order('last_created_at', { ascending: false })
      .limit(20)

    if (error) {
      setThreads([])
      setMsgUnread(0)
      return []
    }

    // Exclude conversations with no messages (last_created_at is NULL)
    const safe = ((rows ?? []) as unknown as ThreadRow[]).filter(r => r.last_created_at != null)
    setThreads(safe)
    setMsgUnread(safe.reduce((acc, r) => acc + (r.unread_count ?? 0), 0))
    return safe
  }, [])

  // Load user initially + whenever route changes
  useEffect(() => {
    void loadUser() // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [loadUser, pathname])

  // Reload when auth state changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void loadUser()
      void loadThreads()
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [loadUser, loadThreads])

  // Live updates (realtime)
  useEffect(() => {
    if (!user?.id) return
    let active = true
    let ch: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      // Ensure we have the latest threads first (also sets msgUnread).
      const latest = await loadThreads()
      if (!active) return

      // Subscribe only to the currently visible threads (limit 20) to avoid noisy updates.
      const convIds = latest.map(t => t.conversation_id).filter(Boolean)

      ch = supabase.channel(`header_messages_${user.id}`)

      // If we don't have any threads yet, fall back to an unfiltered subscription
      // (RLS still applies) so the badge can become live immediately.
      if (convIds.length === 0) {
        ch
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { void loadThreads(); window.dispatchEvent(new CustomEvent('tyuta:inbox-refresh')) })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => { void loadThreads(); window.dispatchEvent(new CustomEvent('tyuta:inbox-refresh')) })
          .subscribe()
        return
      }

      for (const id of convIds) {
        ch
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
            () => { void loadThreads(); window.dispatchEvent(new CustomEvent('tyuta:inbox-refresh')) }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
            () => { void loadThreads(); window.dispatchEvent(new CustomEvent('tyuta:inbox-refresh')) }
          )
      }

      ch.subscribe()
    })()

    // Re-query when ChatClient marks a conversation as read
    const onThreadRead = () => void loadThreads()
    window.addEventListener('tyuta:thread-read', onThreadRead)

    return () => {
      active = false
      if (ch) void supabase.removeChannel(ch)
      window.removeEventListener('tyuta:thread-read', onThreadRead)
    }
    // We intentionally re-subscribe when the visible thread list changes.
  }, [user?.id, loadThreads])

  function requireAuthOrGoWrite(target: 'prika' | 'stories' | 'magazine') {
    if (!user) {
      alert('כדי לכתוב צריך להתחבר 🙂')
      router.push('/auth/login')
      return
    }
    if (getModerationStatus() === 'suspended') {
      router.push('/restricted?from=%2Fwrite')
      return
    }
    router.push(`/write?channel=${target}`)
  }

  function requireAuthOrGo(path: string) {
    if (!user) {
      alert('כדי להיכנס למחברת צריך להתחבר 🙂')
      router.push('/auth/login')
      return
    }
    router.push(path)
  }

  async function handleSignOut() {
    const confirmed = window.confirm('האם אתה בטוח שברצונך להתנתק? 👋')
    if (!confirmed) return

    closeAll()
    // Cross-tab: notify other tabs + set global state.
    setAuthState('out')
    broadcastAuthEvent('SIGNED_OUT')
    await supabase.auth.signOut()
    router.replace('/')
  }


  const MessagesList = (
    <div className="overflow-y-auto max-h-[400px] p-3">
      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-muted flex items-center justify-center mb-3">
            <MessageCircle size={20} className="text-neutral-400 dark:text-muted-foreground" />
          </div>
          <h4 className="text-sm font-bold text-neutral-900 dark:text-foreground mb-1">אין הודעות חדשות</h4>
          <p className="text-xs text-neutral-500 dark:text-muted-foreground">כל ההודעות שלך יופיעו כאן</p>
        </div>
      ) : (
        <div className="space-y-2" dir="rtl">
          {threads.map(t => {
            const identity = resolveUserIdentity({
              userId: t.other_user_id,
              displayName: t.other_display_name,
              username: t.other_username,
              avatarUrl: t.other_avatar_url,
            })
            const name = identity.displayName
            const avatarSrc = identity.avatarUrl
            const snippet = (t.last_body ?? '').trim()
            return (
              <Link
                key={t.conversation_id}
                href={`/inbox/${encodeURIComponent(t.conversation_id)}`}
                onClick={closeAll}
                className="block rounded-xl border border-neutral-200 dark:border-border bg-white dark:bg-popover hover:bg-neutral-50 dark:hover:bg-muted p-3 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Avatar src={avatarSrc} name={name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-neutral-900 dark:text-foreground truncate">{name}</div>
                      {t.unread_count && t.unread_count > 0 ? (
                        <div className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                          {t.unread_count}
                        </div>
                      ) : null}
                    </div>
                    {snippet ? <div className="mt-1 text-xs text-neutral-600 dark:text-muted-foreground line-clamp-2">{snippet}</div> : null}
                    {t.last_created_at ? (
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-muted-foreground">{formatDateTime(t.last_created_at)}</div>
                    ) : null}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <header className="w-full">
      {/* TOP NAVBAR - FIXED (sticky fails inside overflow containers) */}
      <nav className="fixed top-0 inset-x-0 z-[10000] bg-neutral-200/95 dark:bg-background/80 backdrop-blur-md border-b border-neutral-300 dark:border-border shadow-sm">
        <div className="bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200 dark:from-background dark:via-background dark:to-background">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex h-14 items-center justify-between" dir="rtl">
              {/* ימין: בית + פתקים (דסקטופ) | המבורגר + לוגו (מובייל) */}
              <div className="flex items-center gap-4">
                {/* המבורגר - רק במובייל */}
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('tyuta:close-notifications'))
                    }
                    setMobileMenuOpen(v => !v)
                  }}
                  className="lg:hidden p-2 hover:bg-neutral-300 dark:hover:bg-muted rounded-lg transition-colors"
                  aria-label="תפריט"
                >
                  <Menu size={24} className="text-neutral-800 dark:text-foreground" />
                </button>

                {/* בית - רק בדסקטופ */}
                <Link
                  href="/"
                  className="hidden lg:flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-foreground/80 hover:text-neutral-900 dark:hover:text-foreground transition-all duration-300 group"
                  onClick={closeAll}
                >
                  <div className="relative">
                    <Home size={17} strokeWidth={2.5} className="group-hover:scale-110 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-neutral-900 dark:bg-foreground rounded-full blur-md opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
                  </div>
                  <span className="group-hover:tracking-wider transition-all duration-300">בית</span>
                </Link>

                {/* לוגו מוקטן - רק במובייל */}
                <Link
  href="/"
  className="lg:hidden inline-flex w-fit items-center gap-3 text-right select-none active:scale-[0.99] active:opacity-90"

  onClick={closeAll}
>
  <span className="text-lg font-bold tracking-tight text-[#1E2A44] dark:text-foreground">
    Tyuta
  </span>

  <span className="h-4 w-px bg-[#1E2A44]/20 dark:bg-foreground/20" />

  <span className="text-xs font-semibold text-[#1E2A44]/65 dark:text-foreground/65">
    המקום לכל הגרסאות שלך
  </span>
</Link>
                

                {/* פתקים - רק בדסקטופ */}
                {user ? (
                  <Link
                    href="/notes"
                    className="hidden lg:flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-foreground/80 hover:text-neutral-900 dark:hover:text-foreground transition-all duration-300 group"
                    onClick={closeAll}
                    title="פתקים מהקהילה"
                  >
                    <div className="relative">
                      <BookOpen size={17} strokeWidth={2.5} className="group-hover:scale-110 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-neutral-900 dark:bg-foreground rounded-full blur-md opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
                    </div>
                    <span className="group-hover:tracking-wider transition-all duration-300">פתקים</span>
                  </Link>
                ) : null}
              </div>

              {/* שמאל: כתוב + התראות + הודעות + פרופיל */}
              <div className="flex items-center gap-2">
                {/* כתוב - רק בדסקטופ */}
                <div className="hidden lg:block relative" ref={writeRef}>
                  <button
                    onClick={() => {
                      setWriteOpen(v => !v)
                      setProfileOpen(false)
                      setMessagesOpen(false)
                    }}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-neutral-800 to-neutral-700 text-white hover:from-neutral-900 hover:to-neutral-800 px-3 py-2 text-sm font-semibold shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200"
                  >
                    <Edit size={16} strokeWidth={2.5} />
                    <span>כתוב</span>
                    <ChevronDown
                      size={14}
                      strokeWidth={2.5}
                      className={`transition-transform duration-200 ${writeOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {writeOpen && (
                    <div className="absolute top-full left-0 mt-2 w-72 rounded-xl bg-white dark:bg-popover shadow-xl border border-neutral-200 dark:border-border p-3 space-y-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <button
                        onClick={() => {
                          closeAll()
                          requireAuthOrGoWrite('prika')
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-stone-50 dark:hover:bg-muted border border-transparent hover:border-stone-200 dark:hover:border-border text-sm text-right transition-all"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-stone-400 to-stone-500 flex items-center justify-center shadow-sm">
                          <PenTool size={16} strokeWidth={2.5} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-neutral-900 dark:text-foreground">וידוי/שיר</div>
                          <div className="text-xs text-neutral-600 dark:text-muted-foreground">שתף את מחשבותיך</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          closeAll()
                          requireAuthOrGoWrite('stories')
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-muted border border-transparent hover:border-slate-200 dark:hover:border-border text-sm text-right transition-all"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shadow-sm">
                          <FileText size={16} strokeWidth={2.5} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-neutral-900 dark:text-foreground">סיפור</div>
                          <div className="text-xs text-neutral-600 dark:text-muted-foreground">ספר סיפור מרתק</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          closeAll()
                          requireAuthOrGoWrite('magazine')
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-zinc-50 dark:hover:bg-muted border border-transparent hover:border-zinc-200 dark:hover:border-border text-sm text-right transition-all"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-400 to-zinc-500 flex items-center justify-center shadow-sm">
                          <Newspaper size={16} strokeWidth={2.5} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-neutral-900 dark:text-foreground">כתבה</div>
                          <div className="text-xs text-neutral-600 dark:text-muted-foreground">כתוב כתבה מעניינת</div>
                        </div>
                      </button>
                      <div className="h-px bg-gradient-to-r from-transparent via-neutral-300 dark:via-border to-transparent my-2" />
                      <button
                        onClick={() => {
                          closeAll()
                          requireAuthOrGo('/notebook')
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer bg-neutral-50 dark:bg-muted hover:bg-neutral-100 dark:hover:bg-muted/80 border border-neutral-200 dark:border-border text-sm font-black text-right transition-all"
                      >
                        <NotebookPen size={17} strokeWidth={2.5} className="text-neutral-900 dark:text-foreground" />
                        <span>המחברת שלי 📓</span>
                      </button>
                    </div>
                  )}
                </div>

                {user && (
                  <>
                    {/* התראות */}
                    <Suspense><NotificationsBell /></Suspense>

                    {/* הודעות */}
                    <div className="relative" ref={messagesRef}>
                      <button
                        onClick={() => {
                          // במובייל: לוקח ל-/inbox (דרישה)
                          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                            closeAll()
                            router.push('/inbox')
                            return
                          }
                          setMessagesOpen(v => !v)
                          if (!messagesOpen) void loadThreads()
                          setWriteOpen(false)
                          setProfileOpen(false)
                          setMobileMenuOpen(false)
                        }}
                        className="relative p-2 rounded-lg hover:bg-neutral-300 dark:hover:bg-muted transition-all duration-200"
                        title="הודעות"
                        aria-label="הודעות"
                      >
                        <MessageCircle size={20} strokeWidth={2.5} className="text-neutral-700 dark:text-foreground" />
                        {msgUnread > 0 ? (
                          <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {msgUnread > 99 ? '99+' : msgUnread}
                          </span>
                        ) : null}
                      </button>

                      {/* Desktop Dropdown */}
                      {messagesOpen && (
                        <div
                          className="hidden lg:block absolute top-full left-0 mt-2 w-96 max-h-[500px] rounded-xl bg-white dark:bg-popover shadow-xl border border-neutral-200 dark:border-border overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                          dir="rtl"
                        >
                          <div className="sticky top-0 z-10 bg-gradient-to-b from-neutral-100 to-neutral-50 dark:from-popover dark:to-popover border-b border-neutral-200 dark:border-border px-4 py-3 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-neutral-900 dark:text-foreground">הודעות</h3>
                            <Link
                              href="/inbox"
                              onClick={closeAll}
                              className="text-xs font-semibold text-neutral-600 dark:text-muted-foreground hover:text-neutral-900 dark:hover:text-foreground hover:bg-neutral-200 dark:hover:bg-muted px-2 py-1 rounded-lg transition-colors"
                            >
                              ראה הכל
                            </Link>
                          </div>
                          {MessagesList}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* פרופיל או התחברות - רק בדסקטופ */}
                {user ? (
                  <div className="hidden lg:block relative" ref={profileRef}>
                    <button
                      onClick={() => {
                        setProfileOpen(v => !v)
                        setWriteOpen(false)
                        setMessagesOpen(false)
                      }}
                      className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-border bg-white dark:bg-card hover:bg-neutral-50 dark:hover:bg-muted px-2 py-1.5 transition-all"
                    >
                      <Avatar src={user.avatarUrl} name={user.displayName} size={26} />
                      <span className="text-sm font-semibold">{truncateText(user.displayName, 13)}</span>
                      <ChevronDown
                        size={15}
                        strokeWidth={2.5}
                        className={`text-neutral-600 dark:text-muted-foreground transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {profileOpen && (
                      <div className="absolute top-full right-0 mt-2 w-56 rounded-xl bg-white dark:bg-popover shadow-xl border border-neutral-200 dark:border-border p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        <Link
                          href={`/u/${user.username}`}
                          onClick={closeAll}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-muted border border-transparent hover:border-slate-200 dark:hover:border-border text-sm transition-all"
                        >
                          <User size={18} className="text-neutral-600 dark:text-muted-foreground" />
                          <span>פרופיל</span>
                        </Link>
                        <Link
                          href="/settings/profile"
                          onClick={closeAll}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-muted border border-transparent hover:border-stone-200 dark:hover:border-border text-sm transition-all"
                        >
                          <Settings size={18} className="text-neutral-600 dark:text-muted-foreground" />
                          <span>עריכת פרופיל</span>
                        </Link>
                        <Link
                          href="/saved"
                          onClick={closeAll}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-muted border border-transparent hover:border-emerald-200 dark:hover:border-border text-sm transition-all"
                        >
                          <BookOpen size={18} className="text-neutral-600 dark:text-muted-foreground" />
                          <span>פוסטים שמורים</span>
                        </Link>
                        <Link
                          href="/trash"
                          onClick={closeAll}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-muted border border-transparent hover:border-zinc-200 dark:hover:border-border text-sm transition-all"
                        >
                          <Trash2 size={18} className="text-neutral-600 dark:text-muted-foreground" />
                          <span>פוסטים שנמחקו</span>
                        </Link>
                        <ThemeToggle />
                        <div className="h-px bg-gradient-to-r from-transparent via-neutral-300 dark:via-border to-transparent my-2" />
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-900/50 text-sm text-right text-red-600 transition-all"
                        >
                          <LogOut size={18} className="text-red-500" />
                          <span>יציאה</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="hidden lg:flex items-center gap-2">
                    <Link
                      href="/auth/login"
                      onClick={closeAll}
                      className="rounded-full border border-neutral-300 dark:border-border bg-white dark:bg-card hover:bg-neutral-50 dark:hover:bg-muted px-4 py-1.5 text-sm font-semibold transition-all"
                    >
                      התחבר
                    </Link>
                    <Link
                      href="/auth/register"
                      onClick={closeAll}
                      className="rounded-full bg-black hover:opacity-90 px-4 py-1.5 text-sm font-semibold text-white transition-all"
                    >
                      הירשם
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer so content doesn't hide under the fixed navbar */}
      <div className="h-14" aria-hidden="true" />

      {/* שורה 2: BRAND + CHANNELS + SEARCH - Desktop Only (hidden on inbox) */}
      {!pathname.startsWith('/inbox') && !isAuthPage && (
      <div className="hidden lg:block border-b border-black/[.06] dark:border-white/[.08] w-full bg-[#FBF7EF]/50 dark:bg-background/80 backdrop-blur shadow-[0_6px_20px_-8px_rgba(0,0,0,0.10)] dark:shadow-none">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-4 py-5" dir="rtl" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            {/* Right: brand */}
            <div className="min-w-0">
             <Link
  href="/"
  className="group inline-flex w-fit items-center gap-3 text-right transition-all duration-300"
>
  <span className="relative text-lg font-bold tracking-tight text-[#1E2A44] dark:text-foreground transition-transform duration-300 group-hover:-translate-y-[2px]">
    Tyuta
  </span>

  <span className="h-4 w-px bg-[#1E2A44]/20 dark:bg-foreground/20" />

  <span className="text-sm font-medium text-[#1E2A44]/60 dark:text-foreground/60 transition-colors duration-300 group-hover:text-[#1E2A44]/80 dark:group-hover:text-foreground/80">
    המקום לכל הגרסאות שלך
  </span>
</Link>
            </div>

            {/* Center: channels */}
            <div className="justify-self-center">
              <ChannelsInline onNavigate={closeAll} />
            </div>

            {/* Left: search */}
            <div className="flex justify-self-end">
              <Suspense><SearchPostsBar /></Suspense>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Mobile Menu Dropdown - Full Screen */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeAll} />

          <div
            ref={mobileMenuRef}
            className="lg:hidden fixed top-14 left-0 right-0 bottom-0 z-50 bg-white dark:bg-background shadow-lg overflow-y-auto animate-in slide-in-from-top duration-300"
            dir="rtl"
          >
            <div className="mx-auto max-w-6xl px-4 py-4 space-y-4 ">
              {/* אין כפתור סגירה כאן – הסגירה נעשית דרך ה־navbar */}
              {/* חיפוש במובייל */}
              <form 
                className="relative "
                onSubmit={(e) => {
                  e.preventDefault()
                  const q = mobileSearch.trim()
                  if (!q) return
                  closeAll()
                  router.push(`/search?q=${encodeURIComponent(q)}`)
                }}
              >
                <Search size={18} strokeWidth={2.5} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={mobileSearch}
                  onChange={(e) => setMobileSearch(e.target.value)}
                  placeholder="חפש פוסטים..."  
                  className="w-full rounded-lg border border-neutral-200 dark:border-border bg-white dark:bg-muted hover:bg-neutral-50 dark:hover:bg-muted pr-10 pl-4 py-2.5 text-sm font-semibold outline-none focus:border-neutral-400 dark:focus:border-ring focus:bg-white dark:focus:bg-muted focus:ring-4 focus:ring-neutral-100 dark:focus:ring-ring/20 transition-all duration-300 text-foreground"
                />
              </form>

              {/* ניווט ראשי */}
              <div className="space-y-2">
                <Link
                  href="/"
                  onClick={closeAll}
                  className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-muted text-sm font-semibold"
                >
                  <Home size={18} />
                  <span>בית</span>
                </Link>
                {user && (
                  <Link
                    href="/notes"
                    onClick={closeAll}
                    className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-muted text-sm font-semibold"
                  >
                    <BookOpen size={18} />
                    <span>פתקים</span>
                  </Link>
                )}
              </div>

              {/* ערוצים */}
              <div className="border-t pt-4">
                <div className="text-xs font-bold text-neutral-600 dark:text-muted-foreground px-4 mb-2">ערוצים</div>
                <ChannelsInline onNavigate={closeAll} mobile={true} />
              </div>

              {/* כתיבה (accordion) */}
              <div className="border-t pt-4">
                <button
                  onClick={() => {
                    setMobileWriteOpen(v => {
                      const next = !v
                      if (next) setMobileProfileOpen(false)
                      return next
                    })
                  }}
                  className="w-full flex items-center justify-between px-4 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-muted text-sm font-bold"
                >
                  <span className="inline-flex items-center gap-2">
                    <Edit size={18} />
                    כתיבה
                  </span>
                  <ChevronDown size={18} className={`transition-transform ${mobileWriteOpen ? 'rotate-180' : ''}`} />
                </button>

                {mobileWriteOpen && (
                  <div className="px-2 pt-2 space-y-2">
                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGoWrite('prika')
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-muted border border-transparent hover:border-stone-200 dark:hover:border-border text-sm text-right transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-stone-400 to-stone-500 flex items-center justify-center">
                        <PenTool size={15} strokeWidth={2.5} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-neutral-900 dark:text-foreground text-sm">וידוי/שיר</div>
                        <div className="text-xs text-neutral-600 dark:text-muted-foreground">שתף את מחשבותיך</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGoWrite('stories')
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-muted border border-transparent hover:border-slate-200 dark:hover:border-border text-sm text-right transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center">
                        <FileText size={15} strokeWidth={2.5} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-neutral-900 dark:text-foreground text-sm">סיפור</div>
                        <div className="text-xs text-neutral-600 dark:text-muted-foreground">ספר סיפור מרתק</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGoWrite('magazine')
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-muted border border-transparent hover:border-zinc-200 dark:hover:border-border text-sm text-right transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-zinc-400 to-zinc-500 flex items-center justify-center">
                        <Newspaper size={15} strokeWidth={2.5} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-neutral-900 dark:text-foreground text-sm">כתבה</div>
                        <div className="text-xs text-neutral-600 dark:text-muted-foreground">כתוב כתבה מעניינת</div>
                      </div>
                    </button>
                    <div className="h-px bg-gradient-to-r from-transparent via-neutral-300 dark:via-border to-transparent my-2" />
                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGo('/notebook')
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-muted border border-transparent hover:border-neutral-200 dark:hover:border-border text-sm font-bold text-right transition-all"
                    >
                      <NotebookPen size={16} strokeWidth={2.5} className="text-neutral-600 dark:text-muted-foreground" />
                      <span>המחברת שלי 📓</span>
                    </button>
                  </div>
                )}
              </div>

              {/* משתמש (accordion) */}
              {user ? (
                <div className="border-t pt-4">
                  <button
                    onClick={() => {
                      setMobileProfileOpen(v => {
                        const next = !v
                        if (next) setMobileWriteOpen(false)
                        return next
                      })
                    }}
                    className="w-full flex items-center justify-between px-4 py-2 rounded-lg bg-neutral-100 dark:bg-muted border border-neutral-200 dark:border-border hover:bg-neutral-200 dark:hover:bg-muted/80 transition-colors"
                  >
                    <span className="inline-flex items-center gap-3">
                      <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
                      <span className="text-sm font-semibold">{user.displayName}</span>
                    </span>
                    <ChevronDown size={18} className={`transition-transform ${mobileProfileOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {mobileProfileOpen && (
                    <div className="px-2 pt-2 space-y-2">
                      <Link
                        href={`/u/${user.username}`}
                        onClick={closeAll}
                        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-muted border border-transparent hover:border-slate-200 dark:hover:border-border text-sm transition-all"
                      >
                        <User size={18} className="text-neutral-600 dark:text-muted-foreground" />
                        <span>פרופיל</span>
                      </Link>
                      <Link
                        href="/settings/profile"
                        onClick={closeAll}
                        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-muted border border-transparent hover:border-stone-200 dark:hover:border-border text-sm transition-all"
                      >
                        <Settings size={18} className="text-neutral-600 dark:text-muted-foreground" />
                        <span>עריכת פרופיל</span>
                      </Link>
                        <Link
                          href="/saved"
                          onClick={closeAll}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-muted border border-transparent hover:border-emerald-200 dark:hover:border-border text-sm transition-all"
                        >
                          <BookOpen size={18} className="text-neutral-600 dark:text-muted-foreground" />
                          <span>פוסטים שמורים</span>
                        </Link>
                      <Link
                        href="/trash"
                        onClick={closeAll}
                        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-muted border border-transparent hover:border-zinc-200 dark:hover:border-border text-sm transition-all"
                      >
                        <Trash2 size={18} className="text-neutral-600 dark:text-muted-foreground" />
                        <span>פוסטים שנמחקו</span>
                      </Link>
                      <ThemeToggle />
                      <div className="h-px bg-gradient-to-r from-transparent via-neutral-300 dark:via-border to-transparent my-2" />
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-900/50 text-sm text-right text-red-600 transition-all"
                      >
                        <LogOut size={18} className="text-red-500" />
                        <span>יציאה</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-t pt-4 space-y-2">
                  <Link
                    href="/auth/login"
                    onClick={closeAll}
                    className="w-full flex items-center justify-center gap-2 rounded-full border border-border bg-card hover:bg-muted px-4 py-3 text-sm font-semibold"
                  >
                    התחבר
                  </Link>
                    <Link
                    href="/auth/register"
                    onClick={closeAll}
                    className="w-full flex items-center justify-center gap-2 rounded-full bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                  >
                    הירשם
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  )
}