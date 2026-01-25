"use client"

import { useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import SiteFooter from '@/components/SiteFooter'
import SiteHeader from '@/components/SiteHeader'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = pathname?.startsWith('/auth')

  const variant = useMemo(() => {
    if (!pathname) return 'default'
    if (pathname.startsWith('/u/')) return 'profile'
    if (pathname.startsWith('/search')) return 'search'
    if (pathname.startsWith('/c/')) return 'feed'
    return 'home'
  }, [pathname])

  useEffect(() => {
    if (isAuth) return

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Small, subtle motion. Keeps readability.
        const y = window.scrollY || 0
        const drift = ((y / 28) % 80) * -1 // -0..-80px
        document.documentElement.style.setProperty('--pd-scroll', `${drift}`)
      })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [isAuth])

  if (isAuth) return <>{children}</>

  return (
    <div className="pd-bg" data-pd-variant={variant}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
