import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { createHash } from 'crypto'
import { setRefreshCookie } from '@/lib/auth/cookieHelpers'
import { setPresenceCookie } from '@/lib/auth/presenceCookie'
import { isAdminUser } from '@/lib/auth/isAdminUser'
import { fetchModerationRoutingHint } from '@/lib/auth/fetchModerationRoutingHint'

function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function emailHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16)
}

export async function POST(req: Request) {
  const ip = getIp(req)

  // Rate limit: 5 attempts per minute per IP
  const rl = await rateLimit(`signin:${ip}`, { maxRequests: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי ניסיונות כניסה. נסה שוב בעוד כדקה.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  let email: string, password: string, rememberMe: boolean
  try {
    const body = await req.json()
    email = String(body.email ?? '')
    password = String(body.password ?? '')
    rememberMe = body.remember_me !== false   // default true; explicit false opts out
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 })
  }

  // Reject oversized inputs before touching the DB — prevents long-string DoS on bcrypt
  if (email.length > 320 || password.length > 1000) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 400 })
  }

  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password })

  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } })

  if (error) {
    // best-effort — audit failure must never block the auth response
    serviceClient.from('auth_audit_log').insert({
      user_id: null,
      event: 'login_failed',
      ip,
      user_agent: req.headers.get('user-agent') ?? null,
      metadata: { email_hash: emailHash(email), error_code: error.code },
    }).then(null, () => null)
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  // best-effort — audit failure must never block the auth response
  serviceClient.from('auth_audit_log').insert({
    user_id: data.user?.id ?? null,
    event: 'login_success',
    ip,
    user_agent: req.headers.get('user-agent') ?? null,
    metadata: null,
  }).then(null, () => null)

  // Refresh token goes into an httpOnly cookie — never exposed to JavaScript.
  // Only the access token is returned in the response body.
  const moderation = await fetchModerationRoutingHint(serviceClient, data.user.id)
  const res = NextResponse.json(
    {
      access_token: data.session.access_token,
      expires_at:   data.session.expires_at,
      user:         data.user,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
  setRefreshCookie(res, data.session.refresh_token, rememberMe)
  await setPresenceCookie(res, data.user.id, isAdminUser(data.user.id), rememberMe, moderation)
  return res
}
