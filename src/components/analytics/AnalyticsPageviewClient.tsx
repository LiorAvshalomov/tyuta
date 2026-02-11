"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export default function AnalyticsPageviewClient() {
  const pathname = usePathname() || "/"

  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/internal/pv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        referrer: typeof document !== "undefined" ? document.referrer || null : null,
      }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {
      // no-op: analytics must never break UX
    })

    return () => controller.abort()
  }, [pathname])

  return null
}
