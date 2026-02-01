'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Menu, PenLine, User as UserIcon } from 'lucide-react'
import NotificationsBell from './NotificationsBell'
import StickySidebar from './StickySidebar'

type ProfileLite = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export default function SiteHeader() {
const supabase = createClientComponentClient()
  const pathname = usePathname()
  const router = useRouter()

  const [user, setUser] = useState<ProfileLite | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const mobileRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (!authUser?.id) {
        setUser(null)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('id,username,display_name,avatar_url')
        .eq('id', authUser.id)
        .single()

      setUser((data as ProfileLite) ?? null)
    })()
  }, [supabase])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!mobileMenuOpen) return
      const el = mobileRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setMobileMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [mobileMenuOpen])

  const isHome = pathname === '/'

  return (
    <>
      {/* header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <nav className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
          {/* right (RTL) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="sm:hidden p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition"
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label="תפריט"
            >
              <Menu className="w-6 h-6" />
            </button>

            <Link href="/" className="font-extrabold text-lg tracking-tight">
              PenDemic
            </Link>
          </div>

          {/* center */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              href="/"
              className={`text-sm ${isHome ? 'font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
            >
              בית
            </Link>
          </div>

          {/* left actions */}
          <div className="flex items-center gap-1">
            <NotificationsBell />

            <button
              type="button"
              onClick={() => router.push('/write')}
              className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition"
              aria-label="כתיבה"
            >
              <PenLine className="w-6 h-6" />
            </button>

            <Link
              href={user?.username ? `/u/${user.username}` : '/login'}
              className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition"
              aria-label="פרופיל"
            >
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <UserIcon className="w-6 h-6" />
              )}
            </Link>
          </div>
        </nav>
      </header>

      {/* mobile menu */}
      {mobileMenuOpen ? (
        <div className="sm:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" />
          <div
            ref={mobileRef}
            className="absolute top-14 right-0 left-0 bg-white border-t border-gray-200 shadow-lg p-4"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">תפריט</div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                סגור
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block py-2">
                בית
              </Link>
              <Link href="/write" onClick={() => setMobileMenuOpen(false)} className="block py-2">
                כתיבה
              </Link>
              <Link
                href={user?.username ? `/u/${user.username}` : '/login'}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2"
              >
                פרופיל
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* sticky sidebar if exists in your layout */}
      <StickySidebar />
    </>
  )
}
