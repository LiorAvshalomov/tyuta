"use client"

import Script from "next/script"
import { usePathname } from "next/navigation"

const ANALYTICS_BLOCKED_PREFIXES = [
  "/admin",
  "/auth",
  "/login",
  "/register",
  "/write",
  "/settings",
  "/inbox",
  "/notes",
  "/notebook",
  "/saved",
  "/trash",
  "/notifications",
] as const

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export default function GoogleAnalyticsScripts({ measurementId }: { measurementId: string }) {
  const pathname = usePathname() || "/"
  const gaId = measurementId.trim()

  if (!gaId || matchesPrefix(pathname, ANALYTICS_BLOCKED_PREFIXES)) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
        strategy="afterInteractive"
      />
      <Script src={`/js/ga.js?id=${encodeURIComponent(gaId)}`} strategy="afterInteractive" />
    </>
  )
}
