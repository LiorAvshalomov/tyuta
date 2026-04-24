import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import {
  RT_COOKIE,
  RT_MODE_COOKIE,
  RT_SESSION_COOKIE,
  setRefreshCookie,
  clearRefreshCookie,
  resolveRememberMeFromCookies,
} from '@/lib/auth/cookieHelpers'
import { setPresenceCookie, clearPresenceCookie, verifyPresence, PRESENCE_COOKIE } from '@/lib/auth/presenceCookie'
import { isAdminUser } from '@/lib/auth/isAdminUser'
import { fetchModerationRoutingHint } from '@/lib/auth/fetchModerationRoutingHint'
import { buildHeaderUserFromAuthUser, fetchHeaderUserById } from '@/lib/auth/headerUser'
import { buildAuditContext, mergeAuditMetadata } from '@/lib/auth/auditContext'

function deviceFingerprint(meta: Record<string, unknown>): string {
  const parts = [meta.ua_browser ?? '', meta.ua_os ?? '', meta.accept_language ?? ''].join('|')
  return createHash('sha256').update(parts).digest('hex').slice(0, 8)
}

/**
 * GET /api/auth/session
 *
 * Reads the httpOnly refresh-token cookie, exchanges it for a new access + refresh
 * token pair (Supabase rotates RTs on every use), sets the new RT cookie, and
 * returns the new AT in the response body.
 *
 * Called by AuthSync on mount, on a schedule (60s before AT expiry), and on tab focus.
 */
export async function GET(req: NextRequest) {
  const ctx = buildAuditContext(req)

  // Rate limit: 30 refreshes per minute per IP
  const rl = await rateLimit(`session-get:${ctx.ip}`, { maxRequests: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const sessionRt = req.cookies.get(RT_SESSION_COOKIE)?.value ?? null
  const persistentRt = req.cookies.get(RT_COOKIE)?.value ?? null
  if (!sessionRt && !persistentRt) {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  const secret = process.env.PRESENCE_HMAC_SECRET
  const oldPresence = secret
    ? await verifyPresence(req.cookies.get(PRESENCE_COOKIE)?.value ?? '', secret)
    : null

  const cookieState = resolveRememberMeFromCookies({
    sessionRt,
    persistentRt,
    modeCookie: req.cookies.get(RT_MODE_COOKIE)?.value ?? null,
    hintedRememberMe: oldPresence?.rememberMe ?? null,
  })
  const rt = cookieState.refreshToken
  const rememberMe = cookieState.rememberMe
  if (!rt) {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }

  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await client.auth.refreshSession({ refresh_token: rt })

  if (error || !data.session) {
    // Only treat 4xx Supabase responses as definitive auth failures (token truly
    // invalid/revoked). Network errors, 5xx responses, and unknown errors are
    // transient — do NOT clear the RT cookie, or we permanently log the user out
    // on a momentary Supabase hiccup.
    const isDefinitiveFailure =
      !error || (error.status != null && error.status >= 400 && error.status < 500)

    if (!isDefinitiveFailure) {
      // Transient error — tell the client to retry; keep cookies intact.
      return new NextResponse(null, {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' },
      })
    }

    // RT is definitively invalid or revoked; clear cookies so the browser stops sending them.
    const errRes = new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    })
    clearRefreshCookie(errRes)
    clearPresenceCookie(errRes)

    // Audit: best-effort; never block the response.
    if (serviceKey) {
      createClient(url, serviceKey, { auth: { persistSession: false } })
        .from('auth_audit_log').insert({
          user_id: null,
          event: 'token_refresh_failed',
          ip: ctx.ip,
          user_agent: ctx.user_agent,
          metadata: mergeAuditMetadata(ctx.metadata_base, error ? { reason: error.message } : null),
        }).then(null, () => null)
    }
    return errRes
  }

  const serviceClient = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null
  const headerUser = serviceClient
    ? await fetchHeaderUserById(serviceClient, data.user!.id)
    : buildHeaderUserFromAuthUser(data.user)

  const res = NextResponse.json(
    {
      access_token: data.session.access_token,
      expires_at: data.session.expires_at,
      user: data.user,
      header_user: headerUser,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )

  // Rotate: new RT replaces old one in the matching cookie variant.
  setRefreshCookie(res, data.session.refresh_token, rememberMe)
  const moderation = serviceClient
    ? await fetchModerationRoutingHint(
        serviceClient,
        data.user!.id,
        oldPresence?.moderation ?? 'none',
      )
    : oldPresence?.moderation ?? 'none'

  await setPresenceCookie(res, data.user!.id, isAdminUser(data.user!.id), rememberMe, moderation)

  if (serviceClient) {
    serviceClient.from('auth_audit_log').insert({
      user_id:    data.user!.id,
      event:      'token_refresh_success',
      ip:         ctx.ip,
      user_agent: ctx.user_agent,
      metadata:   mergeAuditMetadata(ctx.metadata_base, {
        device_fp:   deviceFingerprint(ctx.metadata_base),
        remember_me: rememberMe,
      }),
    }).then(null, () => null)
  }

  return res
}

/**
 * POST /api/auth/session
 *
 * One-time migration endpoint. Accepts a legacy refresh token that was stored in
 * localStorage under the old Supabase client key, validates it, and replaces it with
 * a proper httpOnly RT cookie.
 *
 * After migration this endpoint is no longer called; new sessions go through GET.
 */
export async function POST(req: NextRequest) {
  const ctx = buildAuditContext(req)

  // Strict rate limit: migration runs once per user; 3 calls per 5 min is generous
  const rl = await rateLimit(`session-migrate:${ctx.ip}`, { maxRequests: 3, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  let legacy_refresh_token: string
  try {
    const body = await req.json() as { legacy_refresh_token?: unknown }
    legacy_refresh_token = String(body.legacy_refresh_token ?? '')
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  if (!legacy_refresh_token) {
    return NextResponse.json({ error: 'legacy_refresh_token required' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await client.auth.refreshSession({ refresh_token: legacy_refresh_token })

  if (error || !data.session) {
    return NextResponse.json(
      { error: 'invalid or expired token' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const serviceClient = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null
  const headerUser = serviceClient
    ? await fetchHeaderUserById(serviceClient, data.user!.id)
    : buildHeaderUserFromAuthUser(data.user)

  const res = NextResponse.json(
    {
      access_token: data.session.access_token,
      expires_at: data.session.expires_at,
      user: data.user,
      header_user: headerUser,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
  setRefreshCookie(res, data.session.refresh_token)
  const moderation = serviceClient
    ? await fetchModerationRoutingHint(
        serviceClient,
        data.user!.id,
      )
    : 'none'
  await setPresenceCookie(res, data.user!.id, isAdminUser(data.user!.id), true, moderation)

  if (serviceClient) {
    serviceClient.from('auth_audit_log').insert({
      user_id:    data.user!.id,
      event:      'legacy_rt_migrated',
      ip:         ctx.ip,
      user_agent: ctx.user_agent,
      metadata:   mergeAuditMetadata(ctx.metadata_base, {
        device_fp: deviceFingerprint(ctx.metadata_base),
      }),
    }).then(null, () => null)
  }

  return res
}
