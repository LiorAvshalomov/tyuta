import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clearRefreshCookie } from '@/lib/auth/cookieHelpers'
import { clearPresenceCookie } from '@/lib/auth/presenceCookie'
import { clearAnalyticsSessionCookie } from '@/lib/analytics/sessionCookie'
import { rateLimit } from '@/lib/rateLimit'
import { buildAuditContext, mergeAuditMetadata } from '@/lib/auth/auditContext'

export async function POST(req: NextRequest) {
  const ctx = buildAuditContext(req)
  const rl = await rateLimit(`signout:${ctx.ip}`, { maxRequests: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Always clear the httpOnly RT cookie regardless of any other outcome
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  clearRefreshCookie(res)
  clearPresenceCookie(res)
  clearAnalyticsSessionCookie(res)

  if (!url || !anonKey || !serviceKey) {
    return res
  }

  // Validate AT from Authorization header — used for audit log and session revocation
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  let userId: string | null = null
  let revocationFailed = false

  if (token) {
    // Token is still valid at this point: client awaits this route BEFORE calling supabase.auth.signOut()
    const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data } = await anonClient.auth.getUser(token)
    userId = data?.user?.id ?? null

    // Revoke the session server-side so the AT cannot be replayed after logout
    // scope=local revokes only this device's session
    const revokeRes = await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: {
        apikey:          anonKey,
        Authorization:   `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
    }).catch(() => null)
    revocationFailed = !revokeRes || !revokeRes.ok
  }

  // best-effort — audit failure must never block the signout response
  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } })
  serviceClient.from('auth_audit_log').insert({
    user_id:    userId,
    event:      'logout',
    ip:         ctx.ip,
    user_agent: ctx.user_agent,
    metadata:   mergeAuditMetadata(ctx.metadata_base, {
      ...(revocationFailed ? { revocation_failed: true } : {}),
      ...(!token ? { no_token: true } : {}),
    }),
  }).then(null, () => null)

  return res
}
