import { randomUUID } from 'crypto'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/requestRateLimit'
import {
  ANALYTICS_AUTH_BACKFILL_WINDOW_MS,
  ANALYTICS_SESSION_COOKIE,
  ANALYTICS_SESSION_IDLE_TIMEOUT_MS,
  setAnalyticsSessionCookie,
} from '@/lib/analytics/sessionCookie'

type IdentifyBody = {
  path?: string
  referrer?: string | null
}

type AnalyticsSessionRow = {
  session_id: string
  user_id: string | null
  created_at: string
  last_seen_at: string
}

function isWithinWindow(dateString: string | null | undefined, windowMs: number): boolean {
  if (!dateString) return false
  const ts = Date.parse(dateString)
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts <= windowMs
}

function normalizePath(path: unknown): string | null {
  if (typeof path !== 'string') return null
  const value = path.trim()
  return value ? value.slice(0, 2048) : null
}

function normalizeReferrer(referrer: unknown): string | null {
  if (typeof referrer !== 'string') return null
  const value = referrer.trim()
  return value ? value.slice(0, 2048) : null
}

export async function POST(req: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: true, skipped: 'non_production' })
  }

  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const rl = await rateLimit(`pv-identify:${auth.user.id}`, { maxRequests: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { ok: false, error: 'missing server env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 500 },
    )
  }

  const body = (await req.json().catch(() => null)) as IdentifyBody | null
  const path = normalizePath(body?.path) ?? '/'
  const referrer = normalizeReferrer(body?.referrer)

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  const userAgent = req.headers.get('user-agent')
  const ip = getClientIp(req)
  const nowIso = new Date().toISOString()
  let rotated = false
  let backfilled = false

  let sessionId = req.cookies.get(ANALYTICS_SESSION_COOKIE)?.value ?? null
  let existingSession: AnalyticsSessionRow | null = null

  if (sessionId) {
    const { data } = await admin
      .from('analytics_sessions')
      .select('session_id, user_id, created_at, last_seen_at')
      .eq('session_id', sessionId)
      .maybeSingle()

    existingSession = (data ?? null) as AnalyticsSessionRow | null
  }

  const rotateForIdle = Boolean(existingSession?.last_seen_at) &&
    !isWithinWindow(existingSession?.last_seen_at, ANALYTICS_SESSION_IDLE_TIMEOUT_MS)
  const rotateForUserMismatch = Boolean(
    existingSession?.user_id && existingSession.user_id !== auth.user.id,
  )
  const rotateForAnonymousCarryover = Boolean(
    existingSession &&
    !existingSession.user_id &&
    !isWithinWindow(existingSession.created_at, ANALYTICS_AUTH_BACKFILL_WINDOW_MS),
  )

  if (!sessionId || rotateForIdle || rotateForUserMismatch || rotateForAnonymousCarryover) {
    sessionId = randomUUID()
    existingSession = null
    rotated = true
  }

  if (!existingSession) {
    const { error } = await admin
      .from('analytics_sessions')
      .upsert(
        {
          session_id: sessionId,
          user_id: auth.user.id,
          first_path: path,
          referrer,
          user_agent: userAgent,
          ip,
          last_seen_at: nowIso,
        },
        { onConflict: 'session_id' },
      )

    if (error) {
      return NextResponse.json({ ok: false, error: 'session_upsert_failed' }, { status: 500 })
    }
  } else {
    const { error: updateSessionError } = await admin
      .from('analytics_sessions')
      .update({
        user_id: auth.user.id,
        user_agent: userAgent,
        ip,
        last_seen_at: nowIso,
      })
      .eq('session_id', sessionId)

    if (updateSessionError) {
      return NextResponse.json({ ok: false, error: 'session_update_failed' }, { status: 500 })
    }

    if (!existingSession.user_id && isWithinWindow(existingSession.created_at, ANALYTICS_AUTH_BACKFILL_WINDOW_MS)) {
      const { error: backfillError } = await admin
        .from('analytics_pageviews')
        .update({ user_id: auth.user.id })
        .eq('session_id', sessionId)
        .is('user_id', null)

      if (backfillError) {
        return NextResponse.json({ ok: false, error: 'pageview_backfill_failed' }, { status: 500 })
      }

      backfilled = true
    }
  }

  const response = NextResponse.json(
    { ok: true, rotated, backfilled },
    { headers: { 'Cache-Control': 'no-store' } },
  )

  if (rotated) {
    setAnalyticsSessionCookie(response, sessionId)
  }

  return response
}
