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

  const { note_id, reason } = body as Record<string, unknown>

  if (typeof note_id !== "string" || !note_id.trim()) {
    return adminError("note_id required", 400, "bad_request")
  }

  const cleanReason = typeof reason === "string" ? reason.trim() : ""
  if (cleanReason.length < 3) {
    return adminError("reason must be at least 3 characters", 400, "reason_required")
  }

  // Fetch note snapshot before deletion
  const { data: note, error: fetchErr } = await db
    .from("community_notes")
    .select("id, user_id, body")
    .eq("id", note_id)
    .maybeSingle()

  if (fetchErr) return adminError(fetchErr.message, 500, "db_error")
  if (!note) return adminError("note not found", 404, "note_not_found")

  const n = note as { id: string; user_id: string; body: string }

  // Notify the note author (same payload as the old RPC)
  const snippet = (n.body ?? "").replace(/\s+/g, " ").trim().slice(0, 60)
  await db.from("notifications").insert({
    user_id: n.user_id,
    actor_id: null,
    type: "system_message",
    entity_type: "community_note",
    entity_id: n.id,
    payload: {
      action: "note_deleted",
      note_snippet: snippet,
      reason: cleanReason,
    },
    is_read: false,
  })

  // Delete
  const { error: delErr } = await db.from("community_notes").delete().eq("id", note_id)
  if (delErr) return adminError(delErr.message, 500, "db_error")

  return adminOk({ deleted: true })
}
