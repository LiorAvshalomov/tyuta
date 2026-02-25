import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function parseIds(envKey: string): string[] {
  return (process.env[envKey] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * GET /api/me/roles
 * Returns { isAdmin, isMod } based on env-var allowlists.
 * Never errors — returns false/false on any auth failure so callers
 * can safely hide privileged UI without crashing.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  if (!token) {
    return NextResponse.json({ isAdmin: false, isMod: false })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ isAdmin: false, isMod: false })
  }

  const client = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  })

  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) {
    return NextResponse.json({ isAdmin: false, isMod: false })
  }

  const userId = data.user.id
  const isAdmin = parseIds("ADMIN_USER_IDS").includes(userId)
  const isMod = parseIds("MODERATOR_USER_IDS").includes(userId)

  return NextResponse.json({ isAdmin, isMod })
}
