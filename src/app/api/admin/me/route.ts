import { NextResponse } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
    },
  })
}
