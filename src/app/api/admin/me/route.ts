import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function isAdminId(userId: string) {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return adminIds.includes(userId)
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""

  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { error: "missing server env (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL)" },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }

  if (!isAdminId(data.user.id)) {
    return NextResponse.json({ error: "not admin" }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  })
}
