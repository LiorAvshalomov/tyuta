"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { event as gaEvent } from "@/lib/gtag"
import { supabase } from "@/lib/supabaseClient"
import { getAuthResolutionState, waitForAuthResolution } from "@/lib/auth/authEvents"

type PvResponse = { ok?: boolean; new_session?: boolean }

export default function AnalyticsPageviewClient() {
  const pathname = usePathname() || "/"

  useEffect(() => {
    // Only track on the production deployment — skip localhost and Vercel preview
    if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production") return

    const controller = new AbortController()

    const resolveAccessToken = async (): Promise<string | null> => {
      let resolution: ReturnType<typeof getAuthResolutionState> | "timeout" = getAuthResolutionState()
      if (resolution === "unknown") {
        resolution = await waitForAuthResolution(1200)
      }

      if (controller.signal.aborted || resolution !== "authenticated") return null

      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    }

    void (async () => {
      const token = await resolveAccessToken()
      if (controller.signal.aborted) return

      fetch("/api/internal/pv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: pathname,
          referrer: typeof document !== "undefined" ? document.referrer || null : null,
          ...(token ? { token } : {}),
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
    })()

    return () => controller.abort()
  }, [pathname])
  

  return null
}
