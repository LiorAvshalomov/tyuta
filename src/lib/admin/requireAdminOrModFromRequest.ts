import { NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  enforceActorRouteRateLimit,
  enforceIpRateLimit,
  resolveAdminRoutePolicy,
  resolveProtectedGatePolicy,
} from "@/lib/requestRateLimit"

export type RequireAdminOrModOk = {
  ok: true
  user: { id: string; email?: string | null }
  isAdmin: boolean
  isMod: boolean
  admin: SupabaseClient
}

type RequireAdminOrModFail = {
  ok: false
  response: NextResponse
}

function parseIds(envKey: string): string[] {
  return (process.env[envKey] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function requireAdminOrModFromRequest(
  req: Request,
): Promise<RequireAdminOrModOk | RequireAdminOrModFail> {
  const gateLimit = await enforceIpRateLimit(req, resolveProtectedGatePolicy("admin", req.method))
  if (gateLimit) {
    return {
      ok: false,
      response: gateLimit,
    }
  }

  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "missing token" }, { status: 401 }),
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRole) {
    return {
      ok: false,
      response: NextResponse.json({ error: "missing server env" }, { status: 500 }),
    }
  }

  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  })

  const { data, error } = await adminClient.auth.getUser(token)
  if (error || !data?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid token" }, { status: 401 }),
    }
  }

  const userId = data.user.id
  const isAdmin = parseIds("ADMIN_USER_IDS").includes(userId)
  const isMod = parseIds("MODERATOR_USER_IDS").includes(userId)

  if (!isAdmin && !isMod) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not authorized" }, { status: 403 }),
    }
  }

  const routeLimit = await enforceActorRouteRateLimit(req, userId, resolveAdminRoutePolicy)
  if (routeLimit) {
    return {
      ok: false,
      response: routeLimit,
    }
  }

  return {
    ok: true,
    user: { id: userId, email: data.user.email },
    isAdmin,
    isMod,
    admin: adminClient,
  }
}
