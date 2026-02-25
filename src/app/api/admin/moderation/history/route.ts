import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminOk, adminError } from "@/lib/admin/adminHttp"

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ActorEntry = {
  id: string
  role: "admin" | "moderator"
  profile: ProfileRow | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function parseIds(envKey: string): string[] {
  return (process.env[envKey] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const sb = gate.admin as unknown as SupabaseClient

  const url = new URL(req.url)
  const actor_user_id = url.searchParams.get("actor_user_id") ?? ""
  const actor_role    = url.searchParams.get("actor_role")    ?? ""
  const target_type   = url.searchParams.get("target_type")   ?? ""
  const author_id     = url.searchParams.get("author_id")     ?? ""
  const author        = (url.searchParams.get("author") ?? "").trim()
  const from          = url.searchParams.get("from")          ?? ""
  const to            = url.searchParams.get("to")            ?? ""

  const rawLimit  = parseInt(url.searchParams.get("limit")  ?? "50", 10)
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0",  10)
  const limit  = Math.min(Math.max(Number.isFinite(rawLimit)  ? rawLimit  : 50, 1), 100)
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0)

  // ── Validate enum params ──────────────────────────────────────────────────
  const VALID_ROLES = new Set(["admin", "moderator"])
  const VALID_TYPES = new Set(["comment", "note"])

  // ── Active actors from env (for dropdown) ────────────────────────────────
  const adminIds = parseIds("ADMIN_USER_IDS")
  const modIds   = parseIds("MODERATOR_USER_IDS")
  const allActorIds = [...new Set([...adminIds, ...modIds])]

  const { data: actorProfileData } = allActorIds.length
    ? await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", allActorIds)
    : { data: [] }

  const actorProfileMap = new Map<string, ProfileRow>()
  for (const p of (Array.isArray(actorProfileData) ? actorProfileData : []) as unknown[]) {
    if (!isRecord(p)) continue
    const pr = p as unknown as ProfileRow
    if (typeof pr.id === "string") actorProfileMap.set(pr.id, pr)
  }

  const actors: ActorEntry[] = allActorIds.map((id) => ({
    id,
    role: adminIds.includes(id) ? "admin" : "moderator",
    profile: actorProfileMap.get(id) ?? null,
  }))

  // ── Author display_name pre-filter ────────────────────────────────────────
  let matchingAuthorIds: Set<string> | null = null

  if (author) {
    const { data: profMatches, error: profErr } = await sb
      .from("profiles")
      .select("id")
      .ilike("display_name", `%${author}%`)
      .limit(500)
    if (profErr) return adminError(profErr.message, 500, "db_error")

    matchingAuthorIds = new Set(
      (Array.isArray(profMatches) ? profMatches : [])
        .filter(isRecord)
        .map((p) => (p as Record<string, unknown>).id)
        .filter((id): id is string => typeof id === "string"),
    )
    if (matchingAuthorIds.size === 0) {
      return adminOk({ events: [], total: 0, actors })
    }
  }

  // ── Build query ───────────────────────────────────────────────────────────
  let query = sb
    .from("moderation_events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })

  if (actor_user_id) query = query.eq("actor_user_id", actor_user_id)
  if (actor_role && VALID_ROLES.has(actor_role)) query = query.eq("actor_role", actor_role)
  if (target_type && VALID_TYPES.has(target_type)) query = query.eq("target_type", target_type)
  if (author_id) query = query.eq("target_author_id", author_id)
  if (from) query = query.gte("created_at", from)
  if (to) {
    const toEnd = new Date(to)
    toEnd.setDate(toEnd.getDate() + 1)
    query = query.lt("created_at", toEnd.toISOString())
  }

  // If filtering by author display_name, over-fetch for in-process filter
  const needsAuthorFilter = matchingAuthorIds !== null
  const fetchLimit = needsAuthorFilter ? Math.min(limit * 8, 800) : limit
  if (!needsAuthorFilter) query = query.range(offset, offset + fetchLimit - 1)

  const { data, error, count } = await query
  if (error) return adminError(error.message, 500, "db_error")

  let events = (Array.isArray(data) ? data : []) as Record<string, unknown>[]

  // In-process author display_name filter
  if (matchingAuthorIds !== null) {
    events = events.filter((ev) => {
      const authorId = typeof ev.target_author_id === "string" ? ev.target_author_id : null
      return authorId !== null && matchingAuthorIds!.has(authorId)
    })
  }

  const filteredTotal = needsAuthorFilter ? events.length : (count ?? 0)
  events = events.slice(offset, offset + limit)

  // ── Batch profile enrichment ──────────────────────────────────────────────
  const profileIds = new Set<string>()
  for (const ev of events) {
    if (typeof ev.actor_user_id === "string") profileIds.add(ev.actor_user_id)
    if (typeof ev.target_author_id === "string") profileIds.add(ev.target_author_id)
  }

  const allIds = Array.from(profileIds).filter((id) => !actorProfileMap.has(id))
  const { data: profData } = allIds.length
    ? await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", allIds)
    : { data: [] }

  const profileMap = new Map<string, ProfileRow>(actorProfileMap)
  for (const p of (Array.isArray(profData) ? profData : []) as unknown[]) {
    if (!isRecord(p)) continue
    const pr = p as unknown as ProfileRow
    if (typeof pr.id === "string") profileMap.set(pr.id, pr)
  }

  const enriched = events.map((ev) => ({
    ...ev,
    actor_profile:  typeof ev.actor_user_id   === "string" ? (profileMap.get(ev.actor_user_id)   ?? null) : null,
    author_profile: typeof ev.target_author_id === "string" ? (profileMap.get(ev.target_author_id) ?? null) : null,
  }))

  return adminOk({ events: enriched, total: filteredTotal, actors })
}
