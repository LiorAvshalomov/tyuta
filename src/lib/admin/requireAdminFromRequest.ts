import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type RequireAdminOk = {
  ok: true
  user: { id: string; email?: string | null }
  admin: ReturnType<typeof createClient>
}

type RequireAdminFail = {
  ok: false
  response: NextResponse
}

function parseAdminIds() {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function requireAdminFromRequest(req: Request): Promise<RequireAdminOk | RequireAdminFail> {
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""

  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "missing token" }, { status: 401 }) }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRole) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "missing server env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 }
      ),
    }
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) {
    return { ok: false, response: NextResponse.json({ error: "invalid token" }, { status: 401 }) }
  }

  const adminIds = parseAdminIds()
  if (!adminIds.includes(data.user.id)) {
    return { ok: false, response: NextResponse.json({ error: "not admin" }, { status: 403 }) }
  }

  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email },
    admin,
  }
}
