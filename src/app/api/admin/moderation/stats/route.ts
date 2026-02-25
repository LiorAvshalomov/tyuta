import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminOk, adminError } from "@/lib/admin/adminHttp"

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const sb = gate.admin as unknown as SupabaseClient

  const url = new URL(req.url)
  const userId = url.searchParams.get("userId") ?? ""

  if (!userId) {
    return adminError("userId required", 400, "bad_request")
  }

  // ── Fetch all moderation events for this actor ────────────────────────────
  const { data, error } = await sb
    .from("moderation_events")
    .select("id, created_at, action, actor_role, target_type, target_id, target_author_id, reason, snapshot")
    .eq("actor_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return adminError(error.message, 500, "db_error")

  const events = (Array.isArray(data) ? data : []) as Record<string, unknown>[]

  // ── Aggregate counters ────────────────────────────────────────────────────
  let deleted_comments = 0
  let deleted_notes     = 0
  let by_admin          = 0
  let by_moderator      = 0

  for (const ev of events) {
    if (ev.target_type === "comment") deleted_comments++
    if (ev.target_type === "note")    deleted_notes++
    if (ev.actor_role  === "admin")     by_admin++
    if (ev.actor_role  === "moderator") by_moderator++
  }

  const recent_events = events.slice(0, 20)

  // ── Enrich recent events with target_author profiles ─────────────────────
  const authorIds = new Set<string>()
  for (const ev of recent_events) {
    if (typeof ev.target_author_id === "string") authorIds.add(ev.target_author_id)
  }

  const { data: profData } = authorIds.size
    ? await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", Array.from(authorIds))
    : { data: [] }

  type ProfileRow = { id: string; username: string | null; display_name: string | null; avatar_url: string | null }
  const profileMap = new Map<string, ProfileRow>()
  for (const p of (Array.isArray(profData) ? profData : []) as unknown[]) {
    if (!p || typeof p !== "object" || Array.isArray(p)) continue
    const pr = p as ProfileRow
    if (typeof pr.id === "string") profileMap.set(pr.id, pr)
  }

  const enriched = recent_events.map((ev) => ({
    ...ev,
    author_profile: typeof ev.target_author_id === "string" ? (profileMap.get(ev.target_author_id) ?? null) : null,
  }))

  return adminOk({
    deleted_comments,
    deleted_notes,
    total: events.length,
    by_actor_role: { admin: by_admin, moderator: by_moderator },
    recent_events: enriched,
  })
}
