import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"
import { rejectLargeRequestBody } from "@/lib/requestBodyLimit"

const MAX_REQUEST_BODY_BYTES = 4 * 1024

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const tooLarge = rejectLargeRequestBody(req, MAX_REQUEST_BODY_BYTES)
  if (tooLarge) return tooLarge

  const { admin } = auth

  const body = (await req.json().catch(() => null)) as { id?: string; status?: string } | null
  const id = body?.id
  const status = body?.status

  if (!id || (status !== "open" && status !== "resolved")) {
    return adminError("bad request", 400, "bad_request")
  }

  const patch = {
    status,
    resolved_at: status === "resolved" ? new Date().toISOString() : null,
  }

  const { error } = await admin.from("contact_messages").update(patch as never).eq("id", id)
  if (error) return adminError(error.message, 500, "db_error")

  return adminOk({})
}
