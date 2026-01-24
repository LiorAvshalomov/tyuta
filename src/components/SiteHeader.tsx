'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import SearchPostsBar from '@/components/SearchPostsBar'
import { supabase } from '@/lib/supabaseClient'
import NotificationsBell from '@/components/NotificationsBell'
import MessagesMenu from '@/components/MessagesMenu'

type MiniUser = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
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

function ChannelsInline({ onNavigate }: { onNavigate?: () => void }) {
  const items = [
    { label: 'פריקה', href: '/c/release', icon: '✍️' },
    { label: 'סיפורים', href: '/c/stories', icon: '📖' },
    { label: 'מגזין', href: '/c/magazine', icon: '📰' },
  ]

  return (
    <nav className="flex items-center justify-center gap-2" dir="rtl" aria-label="קטגוריות">
      {items.map(it => (
        <Link
          key={it.href}
          href={it.href}
          onClick={onNavigate}
          className={[
            'inline-flex items-center gap-2 rounded-full px-4 py-2',
            'text-xs font-semibold',
            'border bg-neutral-50 hover:bg-neutral-100',
            'transition-colors',
            'whitespace-nowrap',
          ].join(' ')}
        >
          <span className="text-sm" aria-hidden="true">
            {it.icon}
          </span>
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  )
}

export default function SiteHeader() {
  const router = useRouter()
  const [user, setUser] = useState<MiniUser | null>(null)

  // dropdown states
  const [writeOpen, setWriteOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const writeRef = useRef<HTMLDivElement | null>(null)
  const profileRef = useRef<HTMLDivElement | null>(null)

  const anyOpen = useMemo(() => writeOpen || profileOpen, [writeOpen, profileOpen])

  const closeAll = useCallback(() => {
    setWriteOpen(false)
    setProfileOpen(false)
  }, [])

  useClickOutside(writeRef, () => setWriteOpen(false), writeOpen)
  useClickOutside(profileRef, () => setProfileOpen(false), profileOpen)

  useEffect(() => {
    if (!anyOpen) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAll()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyOpen, closeAll])

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!mounted) return

      if (!session?.user?.id) {
        setUser(null)
        return
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', session.user.id)
        .single()

      if (!mounted) return

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
    }

    load()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

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

  return (
    <header className="w-full">
      {/* 1) TOP NAVBAR */}
      <div className="border-b" style={{ backgroundColor: '#ECEAE6' }}>
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-12 items-center justify-between" dir="rtl">
            {/* ימין: בית */}
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm font-semibold hover:underline" onClick={closeAll}>
                בית
              </Link>
            </div>

            {/* שמאל: actions */}
            <div className="flex items-center gap-2" dir="rtl">
              {/* כתוב (dropdown controlled) */}
              <div className="relative" ref={writeRef}>
                <button
                  onClick={() => {
                    setWriteOpen(v => !v)
                    setProfileOpen(false)
                  }}
                  className="rounded-full border bg-white px-4 py-2 text-xs font-semibold hover:bg-neutral-50"
                >
                  כתוב ▾
                </button>

                {writeOpen && (
                  <div className="absolute left-0 z-50 mt-2 w-56 rounded-2xl border bg-white p-2 shadow-lg">
                    <div className="px-3 pb-2 pt-1 text-xs font-bold text-neutral-1000">מה את/ה רוצה לכתוב?</div>

                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGoWrite('prika')
                      }}
                      className="w-full rounded-xl px-3 py-2 text-right text-sm hover:bg-neutral-50"
                    >
                      וידוי/שיר ✍️
                    </button>

                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGoWrite('stories')
                      }}
                      className="w-full rounded-xl px-3 py-2 text-right text-sm hover:bg-neutral-50"
                    >
                      סיפור 📖
                    </button>

                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGoWrite('magazine')
                      }}
                      className="w-full rounded-xl px-3 py-2 text-right text-sm hover:bg-neutral-50"
                    >
                      כתבה 📰
                    </button>

                    <div className="my-2 h-px bg-black/5" />

                    <button
                      onClick={() => {
                        closeAll()
                        requireAuthOrGo('/notebook')
                      }}
                      className="w-full rounded-xl px-3 py-2 text-right text-sm font-semibold hover:bg-neutral-50"
                    >
                      המחברת שלי 📓
                    </button>
                  </div>
                )}
              </div>

              {!user ? (
                <>
                  <Link
                    href="/auth/login"
                    onClick={closeAll}
                    className="rounded-full border bg-white px-4 py-2 text-xs font-semibold hover:bg-neutral-50"
                  >
                    התחבר
                  </Link>
                  <Link
                    href="/auth/signup"
                    onClick={closeAll}
                    className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    הירשם
                  </Link>
                </>
              ) : (
                <>
                  <MessagesMenu />
                  <NotificationsBell />

                  <div className="relative" ref={profileRef}>
                    <button
                      onClick={() => {
                        setProfileOpen(v => !v)
                        setWriteOpen(false)
                      }}
                      className="flex items-center gap-2 rounded-full border bg-white px-2 py-1 hover:bg-neutral-50"
                    >
                      <Avatar src={user.avatarUrl} name={user.displayName} size={28} />
                      <span className="text-xs font-semibold">{user.displayName}</span>
                      <span className="text-xs">▾</span>
                    </button>

                    {profileOpen && (
                      <div className="absolute left-0 z-50 mt-2 w-48 rounded-2xl border bg-white p-2 shadow-lg">
                        <Link
                          href={`/u/${user.username}`}
                          onClick={closeAll}
                          className="block rounded-xl px-3 py-2 text-sm hover:bg-neutral-50"
                        >
                          פרופיל
                        </Link>
                        <Link
                          href="/settings/profile"
                          onClick={closeAll}
                          className="block rounded-xl px-3 py-2 text-sm hover:bg-neutral-50"
                        >
                          עריכת פרופיל
                        </Link>
                        <button
                          onClick={async () => {
                            closeAll()
                            await supabase.auth.signOut()
                            router.refresh()
                          }}
                          className="w-full rounded-xl px-3 py-2 text-right text-sm hover:bg-neutral-50"
                        >
                          יציאה
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2) BRAND + (CENTER) CHANNELS + SEARCH */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4">
          <div
            className="grid items-center gap-3 py-4"
            dir="rtl"
            style={{ gridTemplateColumns: '1fr auto 1fr' }}
          >
            {/* Right (in RTL): brand + tagline */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/" className="text-xl font-extrabold tracking-tight" onClick={closeAll}>
                  PenDemic
                </Link>
                <span className="text-sm text-muted-foreground">המקום שלך לכתוב בלי מסכות</span>
              </div>
            </div>

            {/* Center: channels */}
            <div className="justify-self-center">
              <ChannelsInline onNavigate={closeAll} />
            </div>

            {/* Left: search */}
<div className="flex justify-end md:justify-start">
  <SearchPostsBar />
</div>
          </div>
        </div>
      </div>
    </header>
  )
}
