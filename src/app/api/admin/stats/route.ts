import { NextResponse } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  // posts schema uses status + published_at (no boolean "published" column)
  const [postsTotal, postsPublished, postsDeleted, usersTotal] = await Promise.all([
    admin.from("posts").select("id", { count: "exact", head: true }),
    admin
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .is("deleted_at", null),
    admin.from("posts").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
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
