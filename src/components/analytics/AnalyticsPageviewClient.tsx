"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { event as gaEvent } from "@/lib/gtag"

type PvResponse = { ok?: boolean; new_session?: boolean }

export default function AnalyticsPageviewClient() {
  const pathname = usePathname() || "/"

  useEffect(() => {
    // Only track on the production deployment — skip localhost and Vercel preview
    if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production") return

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
      
    })
      .then((r) => {
        if (!r.ok) return
        return r.json().then((raw: unknown) => {
          if (raw && typeof raw === "object" && "new_session" in raw && (raw as PvResponse).new_session) {
            gaEvent("internal_session_started")
          }
        })
      })
      .catch(() => {
        // no-op: analytics must never break UX
      })
    

    return () => controller.abort()
  }, [pathname])
  

  return null
}
