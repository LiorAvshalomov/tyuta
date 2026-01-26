import { NextResponse } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"

type MiniProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  const url = new URL(req.url)
  const status = (url.searchParams.get("status") || "open").toLowerCase()
  const rawLimit = Number(url.searchParams.get("limit") || "200")
  const limit = Math.min(Number.isFinite(rawLimit) ? Math.max(rawLimit, 1) : 200, 500)

  if (status !== "open" && status !== "resolved") {
    return NextResponse.json({ error: "bad status" }, { status: 400 })
  }

  const q = admin
    .from("contact_messages")
    .select(
      `
        id,
        created_at,
        user_id,
        email,
        subject,
        message,
        status
      `
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  const { data, error } = await q.eq("status", status)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  const ids = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean))) as string[]

  let profileMap = new Map<string, MiniProfile>()
  if (ids.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids)
    profileMap = new Map((profs ?? []).map((p: any) => [p.id, p as MiniProfile]))
  }

  const enriched = rows.map((r: any) => ({
    ...r,
    user_profile: profileMap.get(r.user_id) ?? null,
  }))

  return NextResponse.json({ ok: true, messages: enriched })
}
