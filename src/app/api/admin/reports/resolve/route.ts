import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  const body = (await req.json().catch(() => null)) as { id?: string; status?: string } | null
  const id = body?.id
  const status = body?.status

  if (!id || (status !== "open" && status !== "resolved")) {
    return adminError("bad request", 400, "bad_request")
  }

  const patch: Record<string, unknown> = {
    status,
    resolved_at: status === "resolved" ? new Date().toISOString() : null,
  }

  const { error } = await admin.from("user_reports").update(patch as never).eq("id", id)
  if (error) return adminError(error.message, 500, "db_error")

  return adminOk({})
}
