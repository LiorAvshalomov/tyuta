import type { NextRequest } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"

function pickString(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return ""
  const v = (body as Record<string, unknown>)[key]
  return typeof v === "string" ? v.trim() : ""
}

type PostRestoreRow = {
  id: string
  deleted_at: string | null
  moderated_at: string | null
  prev_status: string | null
  prev_published_at: string | null
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const body: unknown = await req.json().catch(() => null)
  const postId = pickString(body, "post_id")
  if (!postId) return adminError("Missing post_id", 400, "bad_request")

  const { data, error: postErr } = await auth.admin
    .from("posts")
    .select("id, deleted_at, moderated_at, prev_status, prev_published_at")
    .eq("id", postId)
    .maybeSingle()

  if (postErr) return adminError(postErr.message, 500, "db_error")

  const post = data as unknown as PostRestoreRow | null
  if (!post) return adminError("Post not found", 404, "not_found")

  const now = new Date().toISOString()

  // Restore admin-moderated hide (soft, admin-only)
  if (post.moderated_at) {
    const status = post.prev_status ?? "draft"
    const published_at = status === "published" ? (post.prev_published_at ?? now) : null

    const { error: updErr } = await auth.admin
      .from("posts")
      .update({
        moderated_at: null,
        moderated_by: null,
        moderated_reason: null,
        prev_status: null,
        prev_published_at: null,
        status,
        published_at,
        updated_at: now,
      })
      .eq("id", postId)

    if (updErr) return adminError(updErr.message, 500, "db_error")
    return adminOk({ restored: true, mode: "admin_soft" })
  }

  // Restore user trash delete
  if (post.deleted_at) {
    const { error: updErr } = await auth.admin
      .from("posts")
      .update({
        deleted_at: null,
        deleted_by: null,
        deleted_reason: null,
        updated_at: now,
      })
      .eq("id", postId)

    if (updErr) return adminError(updErr.message, 500, "db_error")
    return adminOk({ restored: true, mode: "user_soft" })
  }

  return adminError("Post is not deleted or moderated.", 400, "bad_request")
}
