"use client"

import { usePathname } from "next/navigation"
import { useMemo } from "react"
import AppBackground from "@/components/AppBackground"
import SiteHeader from "@/components/SiteHeader"
import SiteFooter from "@/components/SiteFooter"

type Props = { children: React.ReactNode }

function isCleanRoute(pathname: string): boolean {
  // Pages that must be "clean" (no header/footer/background)
  if (pathname.startsWith("/banned")) return true
  if (pathname.startsWith("/restricted")) return true
  if (pathname.startsWith("/auth/login")) return true
  if (pathname.startsWith("/auth/register")) return true
  if (pathname.startsWith("/auth/signup")) return true
  if (pathname === "/login" || pathname === "/register") return true
  return false
}

export default function ClientChrome({ children }: Props) {
  const pathname = usePathname() || "/"
  const clean = useMemo(() => isCleanRoute(pathname), [pathname])

  if (clean) return <>{children}</>

  return (
    <>
      <AppBackground />
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </>
  )
}
