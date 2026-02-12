import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  const [postsTotal, postsPublished, postsDeleted, usersTotal] = await Promise.all([
    admin.from("posts").select("id", { count: "exact", head: true }).is("deleted_at", null),
    admin.from("posts").select("id", { count: "exact", head: true }).eq("status", "published").is("deleted_at", null),
    admin.from("posts").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ])

  const firstErr = postsTotal.error || postsPublished.error || postsDeleted.error || usersTotal.error
  if (firstErr) return adminError(firstErr.message, 500, "db_error")

  // Keep a stable response shape for the Admin UI.
  // The client expects `stats.*` keys.
  return adminOk({
    stats: {
      users_total: usersTotal.count ?? 0,
      posts_total: postsTotal.count ?? 0,
      posts_published: postsPublished.count ?? 0,
      posts_deleted: postsDeleted.count ?? 0,
    },
  })
}
