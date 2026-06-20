"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { event as gaEvent } from "@/lib/gtag"
import { supabase } from "@/lib/supabaseClient"
import { getAuthResolutionState, waitForAuthResolution } from "@/lib/auth/authEvents"

type PvResponse = { ok?: boolean; new_session?: boolean }

const POST_VIEW_QUALIFICATION_MS = 8_000
const POST_VIEW_SCROLL_FRACTION = 0.3
const POST_VIEW_SCROLL_PX = 480

function isPostPath(pathname: string): boolean {
  return pathname.startsWith("/post/")
}

function hasQualifiedPostScroll(): boolean {
  if (typeof document === "undefined") return false

  const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
  if (scrollTop >= POST_VIEW_SCROLL_PX) return true

  const scrollHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  )
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1
  const scrollable = Math.max(scrollHeight - viewportHeight, 1)
  return scrollTop / scrollable >= POST_VIEW_SCROLL_FRACTION
}

function waitForQualifiedPageview(pathname: string, signal: AbortSignal): Promise<void> {
  if (!isPostPath(pathname)) return Promise.resolve()
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve()
  if (hasQualifiedPostScroll()) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    let timerId: number | null = null

    const cleanup = () => {
      if (timerId != null) window.clearTimeout(timerId)
      window.removeEventListener("scroll", onScroll)
      signal.removeEventListener("abort", onAbort)
    }

    const settle = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const onScroll = () => {
      if (hasQualifiedPostScroll()) settle()
    }

    timerId = window.setTimeout(settle, POST_VIEW_QUALIFICATION_MS)
    window.addEventListener("scroll", onScroll, { passive: true })
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

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
      await waitForQualifiedPageview(pathname, controller.signal)
      if (controller.signal.aborted) return

      const token = await resolveAccessToken()
      if (controller.signal.aborted) return

      fetch("/api/internal/pv", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
    })()

    return () => controller.abort()
  }, [pathname])
  

  return null
}
