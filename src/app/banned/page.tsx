"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import {
  getModerationReason,
  getModerationStatus,
  setSupportConversationId,
} from "@/lib/moderation"
import { mapModerationRpcError } from "@/lib/mapSupabaseError"

const SYSTEM_USER_ID = process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? ""

type ProfileLite = {
  username: string | null
  display_name: string | null
}

function safePath(v: string | null): string | null {
  if (!v) return null
  return v.startsWith("/") ? v : null
}

export default function BannedPage() {
  const router = useRouter()
  const sp = useSearchParams()

  const next = useMemo(() => safePath(sp.get("next")), [sp])
  const [mounted, setMounted] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileLite | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    // Only after mount: read localStorage-backed status/reason
    const status = getModerationStatus()
    if (status !== "banned") {
      router.replace("/")
      return
    }
    setReason(getModerationReason())
  }, [router])

  useEffect(() => {
    if (!mounted) return
    let cancelled = false

    async function load() {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user?.id
      if (!uid) return

      const { data: p, error: e } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", uid)
        .maybeSingle()

      if (cancelled) return
      if (e) return

      const pr = p as unknown
      const rec = (pr && typeof pr === "object") ? (pr as Record<string, unknown>) : null
      const username = rec && typeof rec["username"] === "string" ? (rec["username"] as string) : null
      const display_name = rec && typeof rec["display_name"] === "string" ? (rec["display_name"] as string) : null

      setProfile({ username, display_name })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [mounted])

  async function openSupport() {
    if (!SYSTEM_USER_ID) {
      setError("Missing system user id")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.rpc("start_conversation", {
        other_user_id: SYSTEM_USER_ID,
      })
      if (e) throw e

      // start_conversation returns uuid directly (string), not an object
      const conversationId =
        typeof data === "string" && data.trim()
          ? data.trim()
          : null

      if (conversationId) {
        setSupportConversationId(conversationId)
        router.push(`/banned/contact?cid=${encodeURIComponent(conversationId)}`)
      } else {
        setError("לא התקבל מזהה שיחה ממערכת האתר.")
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Unknown error"
      setError(mapModerationRpcError(raw) ?? raw)
    } finally {
      setBusy(false)
    }
  }

  // Prevent SSR/CSR mismatches: render stable frame until mounted
  if (!mounted) {
    return <div className="min-h-screen bg-neutral-950" />
  }

  const displayName =
    profile?.display_name || profile?.username || "המשתמש שלך"

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-7 shadow-2xl">
          <div className="text-xs font-semibold tracking-widest text-red-200/80">
            TYUTA · SYSTEM NOTICE
          </div>

          <h1 className="mt-3 text-2xl sm:text-3xl font-black text-red-100">
            {displayName}, החשבון שלך הושעה לצמיתות
          </h1>

          <p className="mt-3 text-sm sm:text-base text-red-100/80 leading-6">
            אין באפשרותך להשתמש בפיצ׳רים של האתר. אם לדעתך מדובר בטעות — ניתן לפנות
            אל צוות המערכת דרך כפתור “צור קשר”.
          </p>

          {reason ? (
            <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3">
              <div className="text-xs font-bold text-red-200">סיבת חסימה</div>
              <div className="mt-1 text-sm text-white/90 leading-6">
                {reason}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 text-sm text-red-200">{error}</div>
          ) : null}

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={openSupport}
              disabled={busy}
              className="w-full sm:w-auto rounded-xl bg-white text-neutral-900 font-bold px-5 py-3 hover:bg-neutral-100 disabled:opacity-60"
            >
              {busy ? "פותח שיחה..." : "צור קשר עם המערכת"}
            </button>

            {next ? (
              <button
                onClick={() => router.replace(next)}
                className="w-full sm:w-auto rounded-xl border border-white/15 text-white/90 font-semibold px-5 py-3 hover:bg-white/5"
              >
                נסה לחזור
              </button>
            ) : null}
          </div>

          <div className="mt-6 text-xs text-white/40">
            כל ניסיון לעקוף את ההגבלה יתועד.
          </div>
        </div>
      </div>
    </div>
  )
}
