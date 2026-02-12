import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"

type Bucket = "day" | "week" | "month"

type AdminKpisV2 = {
  pageviews: number
  visits: number
  bounce_rate: number
  avg_session_minutes: number
  unique_users: number
  signups: number
  posts_created: number
  posts_published: number
  posts_soft_deleted: number
  posts_purged: number
  users_suspended: number
  users_banned: number
  users_purged: number
}

type PageviewsPoint = {
  bucket_start: string
  pageviews: number
  sessions: number
  unique_users: number
}

type ActiveUsersPoint = {
  bucket_start: string
  active_users: number
}

type SignupsPoint = {
  bucket_start: string
  signups: number
}

type PostsPoint = {
  bucket_start: string
  posts_created: number
  posts_published: number
  posts_soft_deleted: number
}

function parseBucket(v: string | null): Bucket {
  if (v === "day" || v === "week" || v === "month") return v
  return "day"
}

function parseDateOrNull(v: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function getBearer(req: Request): string {
  const auth = req.headers.get("authorization") || ""
  return auth.startsWith("Bearer ") ? auth.slice(7) : ""
}

export async function GET(req: Request) {
  // 1) verify admin using existing server-side guard (env-based admin list)
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const token = getBearer(req)
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 })
  }

  const url = new URL(req.url)
  const bucket = parseBucket(url.searchParams.get("bucket"))

  const now = new Date()
  const start = parseDateOrNull(url.searchParams.get("start")) ?? new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30)
  const end = parseDateOrNull(url.searchParams.get("end")) ?? now

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "missing server env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)" },
      { status: 500 }
    )
  }

  // 2) call analytics RPC as the authenticated admin user
  // This is required because DB functions use auth.uid() via assert_admin().
  const asUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const pStart = start.toISOString()
  const pEnd = end.toISOString()

  // 3) fetch everything in parallel
  const [kpisRes, trafficRes, activeUsersRes, signupsRes, postsRes] = await Promise.all([
    asUser.rpc("admin_kpis_v2", { p_start: pStart, p_end: pEnd }),
    asUser.rpc("admin_pageviews_timeseries", { p_start: pStart, p_end: pEnd, p_bucket: bucket }),
    asUser.rpc("admin_active_users_timeseries", { p_start: pStart, p_end: pEnd, p_bucket: bucket }),
    asUser.rpc("admin_signups_timeseries", { p_start: pStart, p_end: pEnd, p_bucket: bucket }),
    asUser.rpc("admin_posts_timeseries", { p_start: pStart, p_end: pEnd, p_bucket: bucket }),
  ])

  // 4) handle rpc errors explicitly (often thrown as Postgres error strings)
  const firstError =
    kpisRes.error || trafficRes.error || activeUsersRes.error || signupsRes.error || postsRes.error

  if (firstError) {
    const msg = firstError.message || "rpc_error"
    const isAuth = msg.includes("not_authenticated") || msg.includes("not admin") || msg.includes("not_admin")
    return NextResponse.json({ error: msg }, { status: isAuth ? 403 : 500 })
  }

  const kpisRow = (Array.isArray(kpisRes.data) ? kpisRes.data[0] : null) as AdminKpisV2 | null

  return NextResponse.json({
    range: { start: pStart, end: pEnd, bucket },
    kpis: kpisRow,
    series: {
      traffic: (trafficRes.data ?? []) as PageviewsPoint[],
      activeUsers: (activeUsersRes.data ?? []) as ActiveUsersPoint[],
      signups: (signupsRes.data ?? []) as SignupsPoint[],
      posts: (postsRes.data ?? []) as PostsPoint[],
    },
  })
}
