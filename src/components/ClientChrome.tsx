"use client"

import { usePathname } from "next/navigation"
import { useEffect, useMemo, useRef } from "react"
import AppBackground from "@/components/AppBackground"
import AnalyticsPageviewClient from "@/components/analytics/AnalyticsPageviewClient"
import PostRouteAutoRefresh from "@/components/PostRouteAutoRefresh"
import ProfileRouteAutoRefresh from "@/components/ProfileRouteAutoRefresh"
import SiteHeader from "@/components/SiteHeader"
import SiteFooter from "@/components/SiteFooter"
import BetaWelcomeModal from "@/components/BetaWelcomeModal"

type Props = {
  children: React.ReactNode
}

function isCleanRoute(pathname: string): boolean {
  // Pages that must be fully clean (no header/footer/background)
  if (pathname.startsWith("/banned")) return true
  if (pathname.startsWith("/restricted")) return true
  // Admin has its own shell (no SiteHeader/SiteFooter)
  if (pathname.startsWith("/admin")) return true
  return false
}

function isAuthRoute(pathname: string): boolean {
  if (pathname.startsWith("/auth/login")) return true
  if (pathname.startsWith("/auth/register")) return true
  if (pathname.startsWith("/auth/signup")) return true
  if (pathname.startsWith('/auth/forgot-password')) return true
  if (pathname.startsWith('/auth/reset-password')) return true
  if (pathname === "/login" || pathname === "/register") return true
  return false
}

function shouldForceScrollTop(pathname: string): boolean {
  if (pathname === "/") return true
  if (pathname.startsWith("/post/")) return true
  if (pathname.startsWith("/u/")) return true
  if (pathname.startsWith("/c/")) return true
  if (pathname.startsWith("/search")) return true
  return false
}

function resetDocumentScrollToTop() {
  if (typeof window === "undefined") return

  const scroller = document.scrollingElement ?? document.documentElement
  if (typeof scroller.scrollTo === "function") {
    scroller.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }

  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  window.scrollTo({ top: 0, left: 0, behavior: "auto" })
}

export default function ClientChrome({ children }: Props) {
  const pathname = usePathname() || "/"
  const clean = useMemo(() => isCleanRoute(pathname), [pathname])
  const auth = useMemo(() => isAuthRoute(pathname), [pathname])
  const previousPathnameRef = useRef<string | null>(null)
  const isHistoryTraversalRef = useRef(false)

  useEffect(() => {
    const onPopState = () => {
      isHistoryTraversalRef.current = true
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    const previous = previousPathnameRef.current
    previousPathnameRef.current = pathname
    const isHistoryTraversal = isHistoryTraversalRef.current
    isHistoryTraversalRef.current = false

    if (!previous || previous === pathname) return
    if (isHistoryTraversal) return
    if (!shouldForceScrollTop(pathname)) return

    const rafId = window.requestAnimationFrame(() => {
      resetDocumentScrollToTop()
      window.setTimeout(resetDocumentScrollToTop, 0)
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [pathname])

  if (clean) return <>{children}</>

  // Auth pages: show only the top sticky header row (Row2 is hidden inside SiteHeader for auth routes)
  // and keep the page clean (no footer/background).
  if (auth) {
    return (
      <div className="min-h-screen flex flex-col">
        <AnalyticsPageviewClient />
        <PostRouteAutoRefresh />
        <ProfileRouteAutoRefresh />
        <SiteHeader />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    )
  }

  return (
    <>
      <AnalyticsPageviewClient />
      <PostRouteAutoRefresh />
      <ProfileRouteAutoRefresh />
      <AppBackground />
      <BetaWelcomeModal />
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </>
  )
}
