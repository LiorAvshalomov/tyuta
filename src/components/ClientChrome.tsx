"use client"

import { usePathname } from "next/navigation"
import { useMemo } from "react"
import AppBackground from "@/components/AppBackground"
import AnalyticsPageviewClient from "@/components/analytics/AnalyticsPageviewClient"
import SiteHeader from "@/components/SiteHeader"
import SiteFooter from "@/components/SiteFooter"
import BetaWelcomeModal from "@/components/BetaWelcomeModal"

type Props = { children: React.ReactNode }

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

export default function ClientChrome({ children }: Props) {
  const pathname = usePathname() || "/"
  const clean = useMemo(() => isCleanRoute(pathname), [pathname])
  const auth = useMemo(() => isAuthRoute(pathname), [pathname])

  if (clean) return <>{children}</>

  // Auth pages: show only the top sticky header row (Row2 is hidden inside SiteHeader for auth routes)
  // and keep the page clean (no footer/background).
  if (auth) {
    return (
      <div className="min-h-screen flex flex-col">
        <AnalyticsPageviewClient />
        <SiteHeader />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    )
  }

  return (
    <>
      <AnalyticsPageviewClient />
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
