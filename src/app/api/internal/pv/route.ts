import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import { rateLimit } from "@/lib/rateLimit"

type PageviewBody = {
  path?: string
  referrer?: string | null
  /** Optional: If you later want user attribution, send an access token (Bearer or body.token). */
  token?: string
}

function isSkippablePath(path: string): boolean {
  if (!path) return true
  if (path.startsWith("/_next")) return true
  if (path.startsWith("/favicon")) return true
  if (path.startsWith("/robots.txt")) return true
  if (path.startsWith("/sitemap")) return true
  if (/\.(png|jpg|jpeg|gif|webp|svg|css|js|map|ico|woff2?)$/i.test(path)) return true
  return false
}

function isProbablyBot(userAgent: string | null): boolean {
  if (!userAgent) return false
  const s = userAgent.toLowerCase()
  return (
    s.includes("bot") ||
    s.includes("crawler") ||
    s.includes("spider") ||
    s.includes("headless") ||
    s.includes("lighthouse")
  )
}

function getClientIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for")
  if (xf) {
    const first = xf.split(",")[0]?.trim()
    return first || null
  }
  return req.headers.get("x-real-ip")
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { ok: false, error: "missing server env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })

  // Rate limit: 60 requests per 60 seconds per IP
  const ip = getClientIp(req) ?? "unknown"
  const rl = rateLimit(`pv:${ip}`, { maxRequests: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 })
  }

  const userAgent = req.headers.get("user-agent")
  if (isProbablyBot(userAgent)) return NextResponse.json({ ok: true, skipped: "bot" })

  const body = (await req.json().catch(() => null)) as PageviewBody | null
  const path = body?.path ?? "/"

  if (isSkippablePath(path)) return NextResponse.json({ ok: true, skipped: "asset" })

  const referrer = body?.referrer ?? null

  // session cookie
  let sessionId = req.cookies.get("pd_sid")?.value ?? null
  const isNewSession = !sessionId
  if (!sessionId) sessionId = randomUUID()

  // optional user attribution (token)
  const bearer = req.headers.get("authorization") ?? ""
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : ""
  const token = headerToken || body?.token || ""

  let userId: string | null = null
  if (token) {
    const { data, error } = await admin.auth.getUser(token)
    if (!error && data?.user?.id) userId = data.user.id
  }

  const nowIso = new Date().toISOString()

  // 1) Create the session row once (ignore duplicates)
  const { error: insertSessionError } = await admin
    .from("analytics_sessions")
    .upsert(
      {
        session_id: sessionId,
        user_id: userId,
        first_path: path,
        referrer,
        user_agent: userAgent,
        ip,
        last_seen_at: nowIso,
      },
      { onConflict: "session_id", ignoreDuplicates: true }
    )

  if (insertSessionError) {
    return NextResponse.json({ ok: false, error: "session_insert_failed" }, { status: 500 })
  }

  // 2) Always update last_seen_at (+ attach user_id if we have it)
  const sessionUpdate: { last_seen_at: string; user_agent: string | null; ip: string | null; user_id?: string } = {
    last_seen_at: nowIso,
    user_agent: userAgent,
    ip,
  }
  if (userId) sessionUpdate.user_id = userId

  const { error: updateSessionError } = await admin
    .from("analytics_sessions")
    .update(sessionUpdate)
    .eq("session_id", sessionId)

  if (updateSessionError) {
    return NextResponse.json({ ok: false, error: "session_update_failed" }, { status: 500 })
  }

  const { error: pvErr } = await admin.from("analytics_pageviews").insert({
    session_id: sessionId,
    user_id: userId,
    path,
    referrer,
    user_agent: userAgent,
    ip,
  })

  if (pvErr) {
    return NextResponse.json({ ok: false, error: "pageview_insert_failed" }, { status: 500 })
  }
const isProd = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true, new_session: isNewSession })
  if (isNewSession) {
res.cookies.set("pd_sid", sessionId, {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
});
  }

  return res
}
