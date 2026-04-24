import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { createHash, randomUUID } from 'crypto'
import { setRefreshCookie } from '@/lib/auth/cookieHelpers'
import { setPresenceCookie } from '@/lib/auth/presenceCookie'
import { isAdminUser } from '@/lib/auth/isAdminUser'
import { fetchModerationRoutingHint } from '@/lib/auth/fetchModerationRoutingHint'
import { buildHeaderUserFromAuthUser, fetchHeaderUserById } from '@/lib/auth/headerUser'
import { setAnalyticsSessionCookie } from '@/lib/analytics/sessionCookie'
import { buildAuditContext, mergeAuditMetadata } from '@/lib/auth/auditContext'

function emailHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16)
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } })
  const ctx = buildAuditContext(req)

  // Rate limit: 5 attempts per minute per IP — log before returning so brute-force is visible
  const rl = await rateLimit(`signin:${ctx.ip}`, { maxRequests: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    serviceClient.from('auth_audit_log').insert({
      user_id: null,
      event: 'rate_limit_exceeded',
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      metadata: mergeAuditMetadata(ctx.metadata_base, { endpoint: 'signin' }),
    }).then(null, () => null)
    return NextResponse.json(
      { error: 'יותר מדי ניסיונות כניסה. נסה שוב בעוד כדקה.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
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

  if (error) {
    serviceClient.from('auth_audit_log').insert({
      user_id: null,
      event: 'login_failed',
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      metadata: mergeAuditMetadata(ctx.metadata_base, { email_hash: emailHash(email), error_code: error.code }),
    }).then(null, () => null)
    return NextResponse.json({ error: 'אימייל או סיסמה שגויים' }, { status: 401 })
  }

  const isAdmin = isAdminUser(data.user.id)
  serviceClient.from('auth_audit_log').insert({
    user_id: data.user.id,
    event: 'login_success',
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    metadata: mergeAuditMetadata(ctx.metadata_base, isAdmin ? { is_admin: true } : null),
  }).then(null, () => null)

  // Refresh token goes into an httpOnly cookie — never exposed to JavaScript.
  // Only the access token is returned in the response body.
  const moderation = await fetchModerationRoutingHint(serviceClient, data.user.id)
  const headerUser =
    (await fetchHeaderUserById(serviceClient, data.user.id)) ??
    buildHeaderUserFromAuthUser(data.user)
  const res = NextResponse.json(
    {
      access_token: data.session.access_token,
      expires_at:   data.session.expires_at,
      user:         data.user,
      header_user:  headerUser,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
  setRefreshCookie(res, data.session.refresh_token, rememberMe)
  await setPresenceCookie(res, data.user.id, isAdmin, rememberMe, moderation)
  setAnalyticsSessionCookie(res, randomUUID())
  return res
}
