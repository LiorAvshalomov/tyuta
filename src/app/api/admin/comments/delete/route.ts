import type { NextRequest } from "next/server"
import { requireAdminOrModFromRequest } from "@/lib/admin/requireAdminOrModFromRequest"
import { adminOk, adminError } from "@/lib/admin/adminHttp"

export async function POST(req: NextRequest) {
  const gate = await requireAdminOrModFromRequest(req)
  if (!gate.ok) return gate.response

  const db = gate.admin

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return adminError("invalid json", 400, "bad_request")
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return adminError("invalid body", 400, "bad_request")
  }

  const { comment_id, reason } = body as Record<string, unknown>

  if (typeof comment_id !== "string" || !comment_id.trim()) {
    return adminError("comment_id required", 400, "bad_request")
  }

  const cleanReason = typeof reason === "string" ? reason.trim() : ""
  if (cleanReason.length < 3) {
    return adminError("reason must be at least 3 characters", 400, "reason_required")
  }

  // Fetch comment snapshot before deletion
  const { data: comment, error: fetchErr } = await db
    .from("comments")
    .select("id, post_id, author_id, content, created_at, parent_comment_id")
    .eq("id", comment_id)
    .maybeSingle()

  if (fetchErr) return adminError(fetchErr.message, 500, "db_error")
  if (!comment) return adminError("comment not found", 404, "comment_not_found")

  const c = comment as {
    id: string
    post_id: string
    author_id: string
    content: string
    created_at: string
    parent_comment_id: string | null
  }

  const excerpt = (c.content ?? "").replace(/\s+/g, " ").trim().slice(0, 300)
  const actorRole = gate.isAdmin ? "admin" : "moderator"

  // ── Audit log (before delete so it never silently skips) ──────────────────
  const { error: logErr } = await db.from("moderation_events").insert({
    action:           "delete_comment",
    actor_user_id:    gate.user.id,
    actor_role:       actorRole,
    target_type:      "comment",
    target_id:        c.id,
    target_post_id:   c.post_id ?? null,
    target_author_id: c.author_id,
    reason:           cleanReason,
    snapshot: {
      excerpt,
      post_id:           c.post_id ?? null,
      created_at:        c.created_at,
      parent_comment_id: c.parent_comment_id ?? null,
    },
  })
  if (logErr) return adminError(`audit log failed: ${logErr.message}`, 500, "audit_error")

  // ── Notify the comment author ──────────────────────────────────────────────
  await db.from("notifications").insert({
    user_id:     c.author_id,
    actor_id:    null,
    type:        "system_message",
    entity_type: null,
    entity_id:   null,
    payload: {
      action:          "comment_deleted",
      comment_snippet: excerpt.slice(0, 80),
      reason:          cleanReason,
    },
    is_read: false,
  })

  // ── Delete ─────────────────────────────────────────────────────────────────
  const { error: delErr } = await db.from("comments").delete().eq("id", comment_id)
  if (delErr) return adminError(delErr.message, 500, "db_error")

  return adminOk({ deleted: true })
}
