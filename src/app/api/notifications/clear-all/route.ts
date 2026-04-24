import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(req: NextRequest) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const service = serviceClient()
  if (!service) {
    return NextResponse.json(
      { error: { code: 'server_error', message: 'notifications cleanup is not configured' } },
      { status: 500 },
    )
  }

  const uid = auth.user.id
  const rl = await rateLimit(`notifications-clear:${uid}`, {
    maxRequests: 10,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'Too many notification cleanup requests' } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const { error } = await service.rpc('clear_user_notifications', { p_user_id: uid })
  if (error) {
    return NextResponse.json(
      { error: { code: 'db_error', message: error.message } },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
  })
}
