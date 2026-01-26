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
  const limit = Math.min(Number(url.searchParams.get("limit") || "200"), 500)

  // טבלת הדיווחים מהצ'אט: user_reports
  // (כולל message_id / excerpt / conversation_id)
  const q = admin
    .from("user_reports")
    .select(
      `
        id,
        created_at,
        category,
        details,
        status,
        resolved_at,
        reporter_id,
        reported_user_id,
        conversation_id,
        message_id,
        message_created_at,
        message_excerpt
      `
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  const { data: reports, error } =
    status === "resolved" ? await q.eq("status", "resolved") : await q.eq("status", "open")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = reports ?? []
  const ids = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.reporter_id, r.reported_user_id])
        .filter(Boolean)
    )
  ) as string[]

  let profileMap = new Map<string, MiniProfile>()
  if (ids.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids)

    profileMap = new Map((profs ?? []).map((p: any) => [p.id, p as MiniProfile]))
  }

  const enriched = rows.map((r: any) => {
    const reporter = profileMap.get(r.reporter_id) ?? null
    const reported = profileMap.get(r.reported_user_id) ?? null
    return {
      ...r,
      reporter_profile: reporter,
      reported_profile: reported,

      // תאימות לאדמין UI הקיים
      reporter_display_name: reporter?.display_name ?? null,
      reporter_username: reporter?.username ?? null,
      reported_display_name: reported?.display_name ?? null,
      reported_username: reported?.username ?? null,
      message_preview: r.message_excerpt ?? null,
    }
  })

  return NextResponse.json({ ok: true, reports: enriched })
}
