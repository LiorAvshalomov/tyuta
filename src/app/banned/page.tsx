"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { setSupportConversationId } from "@/lib/moderation"
import { mapModerationRpcError, mapSupabaseError } from "@/lib/mapSupabaseError"
import { getResolvedSession } from "@/lib/auth/getResolvedSession"

const SYSTEM_USER_ID = process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? ""

type ProfileLite = {
  username: string | null
  display_name: string | null
}

function safePath(value: string | null): string | null {
  if (!value) return null
  // Reject non-relative, protocol-relative (//), backslash-bypass (/\ → // in browsers)
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null
  return value
}

export default function BannedPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const next = useMemo(
    () => safePath(searchParams.get("from") ?? searchParams.get("next")),
    [searchParams],
  )

  const [ready, setReady] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileLite | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const session = await getResolvedSession()
      const uid = session?.user?.id
      if (!uid) {
        router.replace("/")
        return
      }

      const [{ data: moderation, error: moderationError }, { data: p, error: profileError }] =
        await Promise.all([
          supabase
            .from("user_moderation")
            .select("is_banned, is_suspended, reason, ban_reason")
            .eq("user_id", uid)
            .maybeSingle(),
          supabase
            .from("profiles_public")
            .select("username, display_name")
            .eq("id", uid)
            .maybeSingle(),
        ])

      if (cancelled) return

      if (moderationError) {
        router.replace("/")
        return
      }

      if (moderation?.is_banned !== true) {
        router.replace(moderation?.is_suspended ? "/restricted" : "/")
        return
      }

      setReason(
        (moderation?.ban_reason as string | null) ??
        (moderation?.reason as string | null) ??
        null,
      )

      if (!profileError) {
        const record =
          p && typeof p === "object" ? (p as Record<string, unknown>) : null
        const username =
          record && typeof record.username === "string" ? record.username : null
        const display_name =
          record && typeof record.display_name === "string" ? record.display_name : null

        setProfile({ username, display_name })
      }

      setReady(true)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [router])

  async function openSupport() {
    if (!SYSTEM_USER_ID) {
      setError("חסר מזהה משתמש מערכת.")
      return
    }

    setBusy(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc("start_conversation", {
        other_user_id: SYSTEM_USER_ID,
      })

      if (rpcError) {
        setError(mapSupabaseError(rpcError) ?? mapModerationRpcError(rpcError.message ?? "") ?? rpcError.message)
        return
      }

      const conversationId =
        typeof data === "string" && data.trim() ? data.trim() : null

      if (!conversationId) {
        setError("לא התקבל מזהה שיחה ממערכת האתר.")
        return
      }

      setSupportConversationId(conversationId)
      router.push(`/banned/contact?cid=${encodeURIComponent(conversationId)}`)
    } catch (caught: unknown) {
      const raw = caught instanceof Error ? caught.message : "Unknown error"
      setError(mapModerationRpcError(raw) ?? raw)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return <div className="min-h-screen bg-neutral-950" />
  }

  const displayName =
    profile?.display_name || profile?.username || "החשבון שלך"

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-7 shadow-2xl">
          <div className="text-xs font-semibold tracking-widest text-red-200/80">
            TYUTA · SYSTEM NOTICE
          </div>

          <h1 className="mt-3 text-2xl sm:text-3xl font-black text-red-100">
            {displayName}, החשבון שלך חסום לצמיתות
          </h1>

          <p className="mt-3 text-sm sm:text-base text-red-100/80 leading-6">
            אין לך כרגע גישה לפעולות באתר. אם לדעתך מדובר בטעות, אפשר לפנות
            לצוות המערכת דרך כפתור יצירת הקשר.
          </p>

          {reason ? (
            <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3">
              <div className="text-xs font-bold text-red-200">סיבת החסימה</div>
              <div className="mt-1 text-sm text-white/90 leading-6">{reason}</div>
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
