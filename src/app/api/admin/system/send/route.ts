import type { NextRequest } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"
import { rateLimit } from "@/lib/rateLimit"

const TITLE_MIN = 2
const TITLE_MAX = 120
const MESSAGE_MIN = 2
const MESSAGE_MAX = 2000
const MAX_BROADCAST_USERS = 5000

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const mode = (body?.mode ?? "user").toString() // 'user' | 'all'
  const username = (body?.username ?? "").toString().trim()
  const userId = (body?.user_id ?? "").toString().trim()
  const title = (body?.title ?? "").toString().trim()
  const message = (body?.message ?? "").toString().trim()

  // Rate limit: 5 broadcasts per 10 minutes per admin
  const rl = rateLimit(`admin_broadcast:${auth.user.id}`, { maxRequests: 5, windowMs: 600_000 })
  if (!rl.allowed) return adminError("שליחה מהירה מדי. נסה שוב בעוד כמה דקות.", 429, "rate_limited")

  if (title.length < TITLE_MIN) return adminError("כותרת קצרה מדי.", 400, "bad_request")
  if (title.length > TITLE_MAX) return adminError("כותרת ארוכה מדי.", 400, "bad_request")
  if (message.length < MESSAGE_MIN) return adminError("הודעה קצרה מדי.", 400, "bad_request")
  if (message.length > MESSAGE_MAX) return adminError("הודעה ארוכה מדי.", 400, "bad_request")

  let targetIds: string[] = []

  if (mode === "all") {
    // guardrail: prevent accidental massive broadcast
    const countRes = await auth.admin.from("profiles").select("id", { count: "exact", head: true })
    if (countRes.error) return adminError(countRes.error.message, 500, "db_error")
    const total = countRes.count ?? 0
    if (total > MAX_BROADCAST_USERS) {
      return adminError(
        `יש יותר מדי משתמשים (${total}). הגבלת שידור מערכת היא ${MAX_BROADCAST_USERS}.`,
        400,
        "broadcast_too_large",
        { total, max: MAX_BROADCAST_USERS }
      )
    }

    const { data, error } = await auth.admin.from("profiles").select("id")
    if (error) return adminError(error.message, 500, "db_error")
    targetIds = (data ?? []).map((r) => (r as { id: string }).id)
  } else {
    if (userId) {
      targetIds = [userId]
    } else if (username) {
      const { data, error } = await auth.admin.from("profiles").select("id").eq("username", username).maybeSingle()
      if (error) return adminError(error.message, 500, "db_error")
      if (!data?.id) return adminError("לא נמצא משתמש עם ה-username הזה.", 404, "not_found")
      targetIds = [data.id]
    } else {
      return adminError("חסר username או user_id.", 400, "bad_request")
    }
  }

  if (targetIds.length === 0) return adminOk({ sent: 0 })

  const now = new Date().toISOString()
  const rows = targetIds.map((uid) => ({
    user_id: uid,
    actor_id: null,
    type: "system_message",
    entity_type: null,
    entity_id: null,
    payload: { title, message },
    is_read: false,
    created_at: now,
  }))

  // Insert in chunks to avoid payload limits
  const chunkSize = 500
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await auth.admin.from("notifications").insert(chunk as never)
    if (error) return adminError(error.message, 500, "db_error")
  }

  return adminOk({ sent: rows.length })
}
