import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"

type MiniProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

const VALID_STATUSES = new Set(["open", "resolved"])

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  const url = new URL(req.url)
  const rawStatus = (url.searchParams.get("status") || "open").toLowerCase()
  const status = VALID_STATUSES.has(rawStatus) ? (rawStatus as "open" | "resolved") : "open"

  const rawLimit = parseInt(url.searchParams.get("limit") || "200", 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 200, 1), 500)

  const q = admin
    .from("user_reports")
    .select(
      `
        id,
        created_at,
        category,
        reason_code,
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
    .eq("status", status)
    .limit(limit)

  const { data: reports, error } = await q
  if (error) return adminError(error.message, 500, "db_error")

  type ReportRow = {
    id: string; created_at: string; category: string; reason_code: string | null; details: string | null;
    status: string; resolved_at: string | null; reporter_id: string;
    reported_user_id: string; conversation_id: string | null;
    message_id: string | null; message_created_at: string | null;
    message_excerpt: string | null
  }
  const rows = (reports ?? []) as ReportRow[]
  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.reporter_id, r.reported_user_id]).filter(Boolean))
  )

  let profileMap = new Map<string, MiniProfile>()
  if (ids.length) {
    const { data: profs, error: profErr } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids)

    if (profErr) return adminError(profErr.message, 500, "db_error")
    profileMap = new Map(((profs ?? []) as MiniProfile[]).map((p) => [p.id, p]))
  }

  const enriched = rows.map((r) => {
    const reporter = profileMap.get(r.reporter_id) ?? null
    const reported = profileMap.get(r.reported_user_id) ?? null
    return {
      ...r,
      reporter_profile: reporter,
      reported_profile: reported,

      // תאימות ל-UI הקיים
      reporter_display_name: reporter?.display_name ?? null,
      reporter_username: reporter?.username ?? null,
      reported_display_name: reported?.display_name ?? null,
      reported_username: reported?.username ?? null,
      message_preview: r.message_excerpt ?? null,
    }
  })

  return adminOk({ reports: enriched })
}
