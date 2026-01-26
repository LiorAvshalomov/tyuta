import { NextResponse } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  const [postsTotal, postsPublished, postsDeleted, usersTotal] = await Promise.all([
    admin.from("posts").select("id", { count: "exact", head: true }),
    admin.from("posts").select("id", { count: "exact", head: true }).filter("published", "eq", true as any),
    admin.from("posts").select("id", { count: "exact", head: true }).filter("deleted_at", "not.is", null),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ])

  return NextResponse.json({
    ok: true,
    posts: {
      total: postsTotal.count ?? 0,
      published: postsPublished.count ?? 0,
      deleted: postsDeleted.count ?? 0,
    },
    users: {
      total: usersTotal.count ?? 0,
    },
  })
}
