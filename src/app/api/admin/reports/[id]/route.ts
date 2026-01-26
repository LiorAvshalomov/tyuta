import { NextResponse } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  // ✅ Next דורש unwrap של params
  const { id } = await ctx.params

  if (!id || id === "undefined") {
    return NextResponse.json({ error: "missing id" }, { status: 400 })
  }

  const { data, error } = await admin
    .from("user_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })

  return NextResponse.json({ ok: true, report: data })
}
