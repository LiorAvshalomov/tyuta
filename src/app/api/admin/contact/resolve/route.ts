import { NextResponse } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  const body = (await req.json().catch(() => null)) as { id?: string; status?: string } | null
  const id = body?.id
  const status = body?.status

  if (!id || (status !== "open" && status !== "resolved")) {
    return NextResponse.json({ error: "bad request" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    status,
    resolved_at: status === "resolved" ? new Date().toISOString() : null,
  }

  const { error } = await admin.from("contact_messages").update(patch).eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
