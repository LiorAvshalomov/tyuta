'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import SearchPostsBar from '@/components/SearchPostsBar'
import { supabase } from '@/lib/supabaseClient'
import {
  Menu,
  X,
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
  Sparkles,
  NotebookPen,
  MessageCircle,
} from 'lucide-react'
import NotificationsBell from "@/components/NotificationsBell"


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
            className={`group inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold bg-white border ${it.borderClass} ${it.hoverClass} hover:shadow-sm transition-all duration-200 whitespace-nowrap ${mobile ? 'w-full justify-start' : ''}`}
          >
            <Icon size={17} strokeWidth={2.5} className={`${it.colorClass} group-hover:scale-110 transition-transform`} />
            <span className="text-neutral-700 group-hover:text-neutral-900 transition-colors">{it.label}</span>
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
  const [user, setUser] = useState<MiniUser | null>(null)

  const [isMobile, setIsMobile] = useState(false)

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

    window.addEventListener('pendemic:close-mobile-menu', onCloseMobile as EventListener)
    window.addEventListener('pendemic:close-header-dropdowns', onCloseDropdowns as EventListener)
    return () => {
      window.removeEventListener('pendemic:close-mobile-menu', onCloseMobile as EventListener)
      window.removeEventListener('pendemic:close-header-dropdowns', onCloseDropdowns as EventListener)
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

  const loadThreads = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id
    if (!uid) {
      setThreads([])
      setMsgUnread(0)
      return
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
      return
    }

    const safe = (rows ?? []) as unknown as ThreadRow[]
    setThreads(safe)
    setMsgUnread(safe.reduce((acc, r) => acc + (r.unread_count ?? 0), 0))
  }, [])

  // Load user initially + whenever route changes
  useEffect(() => {
    void loadUser()
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
    void loadThreads()

    // שינוי הודעות יכול להשפיע על unread_count ב-view. נרענן כשנוצרה הודעה חדשה.
    const msgCh = supabase
      .channel(`header_messages_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => void loadThreads()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => void loadThreads()
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(msgCh)
    }
  }, [user?.id, loadThreads])

  function requireAuthOrGoWrite(target: 'prika' | 'stories' | 'magazine') {
    if (!user) {
      alert('כדי לכתוב צריך להתחבר 🙂')
      router.push('/auth/login')
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
    await supabase.auth.signOut()
    router.refresh()
  }


  const MessagesList = (
    <div className="overflow-y-auto max-h-[400px] p-3">
      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
            <MessageCircle size={20} className="text-neutral-400" />
          </div>
          <h4 className="text-sm font-bold text-neutral-900 mb-1">אין הודעות חדשות</h4>
          <p className="text-xs text-neutral-500">כל ההודעות שלך יופיעו כאן</p>
        </div>
      ) : (
        <div className="space-y-2" dir="rtl">
          {threads.filter(t => Boolean(t.last_created_at || (t.last_body ?? '').trim())).map(t => {
            const name = (t.other_display_name ?? '').trim() || t.other_username || 'משתמש'
            const snippet = (t.last_body ?? '').trim()
            return (
              <Link
                key={t.conversation_id}
                href={`/inbox/${encodeURIComponent(t.conversation_id)}`}
                onClick={closeAll}
                className="block rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 p-3 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Avatar src={t.other_avatar_url} name={name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-neutral-900 truncate">{name}</div>
                      {t.unread_count && t.unread_count > 0 ? (
                        <div className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                          {t.unread_count}
                        </div>
                      ) : null}
                    </div>
                    {snippet ? <div className="mt-1 text-xs text-neutral-600 line-clamp-2">{snippet}</div> : null}
                    {t.last_created_at ? (
                      <div className="mt-1 text-[11px] text-neutral-500">{formatDateTime(t.last_created_at)}</div>
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
      <nav className="fixed top-0 inset-x-0 z-[10000] bg-neutral-200/95 backdrop-blur-md border-b border-neutral-300 shadow-sm">
        <div className="bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex h-14 items-center justify-between" dir="rtl">
              {/* ימין: בית + פתקים (דסקטופ) | המבורגר + לוגו (מובייל) */}
              <div className="flex items-center gap-4">
                {/* המבורגר - רק במובייל */}
                <button
                  onClick={() => setMobileMenuOpen(v => !v)}
                  className="lg:hidden p-2 hover:bg-neutral-300 rounded-lg transition-colors"
                  aria-label="תפריט"
                >
                  {mobileMenuOpen ? (
                    <X size={24} className="text-neutral-800" />
                  ) : (
                    <Menu size={24} className="text-neutral-800" />
                  )}
                </button>

                {/* בית - רק בדסקטופ */}
                <Link
                  href="/"
                  className="hidden lg:flex items-center gap-2 text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-all duration-300 group"
                  onClick={closeAll}
                >
                  <div className="relative">
                    <Home size={17} strokeWidth={2.5} className="group-hover:scale-110 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-neutral-900 rounded-full blur-md opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
                  </div>
                  <span className="group-hover:tracking-wider transition-all duration-300">בית</span>
                </Link>

                {/* לוגו מוקטן - רק במובייל */}
                <Link href="/" className="lg:hidden flex items-center gap-2 group" onClick={closeAll}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-600 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all duration-300">
                    <Sparkles size={17} strokeWidth={2.5} className="text-white group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <div className="text-xl font-extrabold text-neutral-900">PenDemic</div>
                    <div className="text-[9px] text-neutral-600 font-semibold">מקום לכתיבה ולפריקה</div>
                  </div>
                </Link>

                {/* פתקים - רק בדסקטופ */}
                {user ? (
                  <Link
                    href="/notes"
                    className="hidden lg:flex items-center gap-2 text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-all duration-300 group"
                    onClick={closeAll}
                    title="פתקים מהקהילה"
                  >
                    <div className="relative">
                      <BookOpen size={17} strokeWidth={2.5} className="group-hover:scale-110 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-neutral-900 rounded-full blur-md opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
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
                    <div className="absolute top-full left-0 mt-2 w-72 rounded-xl bg-white shadow-xl border border-neutral-200 p-3 space-y-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <button
                        onClick={() => {
                          closeAll()
                          requireAuthOrGoWrite('prika')
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-200 text-sm text-right transition-all"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-stone-400 to-stone-500 flex items-center justify-center shadow-sm">
                          <PenTool size={16} strokeWidth={2.5} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-neutral-900">וידוי/שיר</div>
                          <div className="text-xs text-neutral-600">שתף את מחשבותיך</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          closeAll()
                          requireAuthOrGoWrite('stories')
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-sm text-right transition-all"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shadow-sm">
                          <FileText size={16} strokeWidth={2.5} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-neutral-900">סיפור</div>
                          <div className="text-xs text-neutral-600">ספר סיפור מרתק</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          closeAll()
                          requireAuthOrGoWrite('magazine')
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 text-sm text-right transition-all"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-400 to-zinc-500 flex items-center justify-center shadow-sm">
                          <Newspaper size={16} strokeWidth={2.5} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-neutral-900">כתבה</div>
                          <div className="text-xs text-neutral-600">כתוב כתבה מעניינת</div>
                        </div>
                      </button>
                      <div className="h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent my-2" />
                      <button
                        onClick={() => {
                          closeAll()
                          requireAuthOrGo('/notebook')
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-neutral-200 text-sm font-bold text-right transition-all"
                      >
                        <NotebookPen size={17} strokeWidth={2.5} className="text-neutral-600" />
                        <span>המחברת שלי 📓</span>
                      </button>
                    </div>
                  )}
                </div>

                {user && (
                  <>
                    {/* התראות */}
                    <NotificationsBell />

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
                        className="relative p-2 rounded-lg hover:bg-neutral-300 transition-all duration-200"
                        title="הודעות"
                        aria-label="הודעות"
                      >
                        <MessageCircle size={20} strokeWidth={2.5} className="text-neutral-700" />
                        {msgUnread > 0 ? (
                          <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {msgUnread > 99 ? '99+' : msgUnread}
                          </span>
                        ) : null}
                      </button>

                      {/* Desktop Dropdown */}
                      {messagesOpen && (
                        <div
                          className="hidden lg:block absolute top-full left-0 mt-2 w-96 max-h-[500px] rounded-xl bg-white shadow-xl border border-neutral-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                          dir="rtl"
                        >
                          <div className="sticky top-0 z-10 bg-gradient-to-b from-neutral-100 to-neutral-50 border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-neutral-900">הודעות</h3>
                            <Link
                              href="/inbox"
                              onClick={closeAll}
                              className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 px-2 py-1 rounded-lg transition-colors"
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
                      className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 px-2 py-1.5 transition-all"
                    >
                      <Avatar src={user.avatarUrl} name={user.displayName} size={26} />
                      <span className="text-sm font-semibold">{user.displayName}</span>
                      <ChevronDown
                        size={15}
                        strokeWidth={2.5}
                        className={`text-neutral-600 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {profileOpen && (
                      <div className="absolute top-full right-0 mt-2 w-56 rounded-xl bg-white shadow-xl border border-neutral-200 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        <Link
                          href={`/u/${user.username}`}
                          onClick={closeAll}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-sm transition-all"
                        >
                          <User size={18} className="text-neutral-600" />
                          <span>פרופיל</span>
                        </Link>
                        <Link
                          href="/settings/profile"
                          onClick={closeAll}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-200 text-sm transition-all"
                        >
                          <Settings size={18} className="text-neutral-600" />
                          <span>עריכת פרופיל</span>
                        </Link>
                        <Link
                          href="/trash"
                          onClick={closeAll}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 text-sm transition-all"
                        >
                          <Trash2 size={18} className="text-neutral-600" />
                          <span>פוסטים שנמחקו</span>
                        </Link>
                        <div className="h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent my-2" />
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200 text-sm text-right text-red-600 transition-all"
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
                      className="rounded-full border border-neutral-300 bg-white hover:bg-neutral-50 px-4 py-1.5 text-sm font-semibold transition-all"
                    >
                      התחבר
                    </Link>
                    <Link
                      href="/auth/signup"
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

      {/* שורה 2: BRAND + CHANNELS + SEARCH - Desktop Only */}
      <div className="bg-gradient-to-b from-neutral-50 to-white hidden lg:block border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-4 py-5" dir="rtl" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            {/* Right: brand */}
            <div className="min-w-0">
              <Link href="/" className="flex items-center gap-2 group" onClick={closeAll}>
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-600 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:shadow-neutral-400/50 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Sparkles size={18} strokeWidth={2.5} className="text-white group-hover:rotate-12 transition-transform duration-300" />
                </div>
                <div>
                  <div className="text-xl font-extrabold text-neutral-900 group-hover:text-neutral-700 transition-colors duration-300">
                    PenDemic
                  </div>
                  <div className="text-[10px] text-neutral-600 font-semibold group-hover:text-neutral-800 transition-colors duration-300">
                    מקום לכתיבה ולפריקה
                  </div>
                </div>
              </Link>
            </div>

            {/* Center: channels */}
            <div className="justify-self-center">
              <ChannelsInline onNavigate={closeAll} />
            </div>

            {/* Left: search */}
            <div className="flex justify-self-end">
              <SearchPostsBar />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown - Full Screen */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeAll} />

          <div
            ref={mobileMenuRef}
            className="lg:hidden fixed top-14 left-0 right-0 bottom-0 z-50 bg-white shadow-lg overflow-y-auto animate-in slide-in-from-top duration-300"
            dir="rtl"
          >
            <div className="mx-auto max-w-6xl px-4 py-4 space-y-4">
              {/* חיפוש במובייל */}
              <form
                className="relative"
                onSubmit={(e) => {
                  e.preventDefault()
                  const q = mobileSearch.trim()
                  if (!q) return
                  closeAll()
                  router.push(`/search?q=${encodeURIComponent(q)}`)
                }}
              >
                <Search size={18} strokeWidth={2.5} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="search"
                  value={mobileSearch}
                  onChange={(e) => setMobileSearch(e.target.value)}
                  placeholder="חפש פוסטים..."
                  className="w-full rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 pr-10 pl-4 py-2.5 text-sm font-semibold outline-none focus:border-neutral-400 focus:bg-white focus:ring-4 focus:ring-neutral-100 transition-all duration-300"
                />
              </form>

              {/* ניווט ראשי */}
              <div className="space-y-2">
                <Link
                  href="/"
                  onClick={closeAll}
                  className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-neutral-50 text-sm font-semibold"
                >
                  <Home size={18} />
                  <span>בית</span>
                </Link>
                {user && (
                  <Link
                    href="/notes"
                    onClick={closeAll}
                    className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-neutral-50 text-sm font-semibold"
                  >
                    <BookOpen size={18} />
                    <span>פתקים</span>
                  </Link>
                )}
              </div>

              {/* ערוצים */}
              <div className="border-t pt-4">
                <div className="text-xs font-bold text-neutral-600 px-4 mb-2">ערוצים</div>
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
                  className="w-full flex items-center justify-between px-4 py-2 rounded-lg hover:bg-neutral-50 text-sm font-bold"
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
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-200 text-sm text-right transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-stone-400 to-stone-500 flex items-center justify-center">
                        <PenTool size={15} strokeWidth={2.5} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-neutral-900 text-sm">וידוי/שיר</div>
                        <div className="text-xs text-neutral-600">שתף את מחשבותיך</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGoWrite('stories')
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-sm text-right transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center">
                        <FileText size={15} strokeWidth={2.5} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-neutral-900 text-sm">סיפור</div>
                        <div className="text-xs text-neutral-600">ספר סיפור מרתק</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGoWrite('magazine')
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 text-sm text-right transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-zinc-400 to-zinc-500 flex items-center justify-center">
                        <Newspaper size={15} strokeWidth={2.5} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-neutral-900 text-sm">כתבה</div>
                        <div className="text-xs text-neutral-600">כתוב כתבה מעניינת</div>
                      </div>
                    </button>
                    <div className="h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent my-2" />
                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGo('/notebook')
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-neutral-200 text-sm font-bold text-right transition-all"
                    >
                      <NotebookPen size={16} strokeWidth={2.5} className="text-neutral-600" />
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
                    className="w-full flex items-center justify-between px-4 py-2 rounded-lg bg-neutral-100 border border-neutral-200 hover:bg-neutral-200 transition-colors"
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
                        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-sm transition-all"
                      >
                        <User size={18} className="text-neutral-600" />
                        <span>פרופיל</span>
                      </Link>
                      <Link
                        href="/settings/profile"
                        onClick={closeAll}
                        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-200 text-sm transition-all"
                      >
                        <Settings size={18} className="text-neutral-600" />
                        <span>עריכת פרופיל</span>
                      </Link>
                      <Link
                        href="/trash"
                        onClick={closeAll}
                        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 text-sm transition-all"
                      >
                        <Trash2 size={18} className="text-neutral-600" />
                        <span>פוסטים שנמחקו</span>
                      </Link>
                      <div className="h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent my-2" />
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200 text-sm text-right text-red-600 transition-all"
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
                    className="w-full flex items-center justify-center gap-2 rounded-full border bg-white px-4 py-3 text-sm font-semibold hover:bg-neutral-50"
                  >
                    התחבר
                  </Link>
                  <Link
                    href="/auth/signup"
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
