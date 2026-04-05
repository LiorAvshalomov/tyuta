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

  const { data, error } = await admin
    .from("contact_messages")
    .select(
      `
        id,
        created_at,
        user_id,
        email,
        subject,
        message,
        status,
        attachment_paths
      `
    )
    .order("created_at", { ascending: false })
    .eq("status", status)
    .limit(limit)

  if (error) return adminError(error.message, 500, "db_error")

  const rows = (data ?? []) as { id: string; created_at: string; user_id: string; email: string | null; subject: string; message: string; status: string; attachment_paths: string[] | null }[]
  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)))

  let profileMap = new Map<string, MiniProfile>()
  if (ids.length) {
    const { data: profs, error: profErr } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids)

    if (profErr) return adminError(profErr.message, 500, "db_error")
    profileMap = new Map(((profs ?? []) as MiniProfile[]).map((p) => [p.id, p]))
  }

  const enriched = rows.map((r) => ({
    ...r,
    user_profile: profileMap.get(r.user_id) ?? null,
  }))

  return adminOk({ messages: enriched })
}
