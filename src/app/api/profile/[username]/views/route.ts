import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getClientIp, buildRateLimitResponse } from '@/lib/requestRateLimit'
import { rateLimit } from '@/lib/rateLimit'

const USERNAME_RE = /^[a-zA-Z0-9_-]{1,50}$/

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: 'invalid username' }, { status: 400 })
  }

  const ip = getClientIp(req)
  const rl = await rateLimit(`profile-views:${ip}`, { maxRequests: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return buildRateLimitResponse('יותר מדי בקשות. נסו שוב בעוד רגע.', rl.retryAfterMs)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('get_profile_view_count', { p_username: username })

  if (error) {
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  return NextResponse.json(
    { total: Number(data ?? 0) },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } },
  )
}
