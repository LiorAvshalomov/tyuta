import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { fetchModerationRoutingHint } from '@/lib/auth/fetchModerationRoutingHint'
import { isAdminUser } from '@/lib/auth/isAdminUser'
import {
  RT_COOKIE,
  RT_MODE_COOKIE,
  RT_SESSION_COOKIE,
  resolveRememberMeFromCookies,
} from '@/lib/auth/cookieHelpers'
import {
  PRESENCE_COOKIE,
  setPresenceCookie,
  verifyPresence,
} from '@/lib/auth/presenceCookie'

export async function POST(req: NextRequest) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const rl = await rateLimit(`presence:${auth.user.id}`, { maxRequests: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const secret = process.env.PRESENCE_HMAC_SECRET
  const oldPresence = secret
    ? await verifyPresence(req.cookies.get(PRESENCE_COOKIE)?.value ?? '', secret)
    : null

  const cookieState = resolveRememberMeFromCookies({
    sessionRt: req.cookies.get(RT_SESSION_COOKIE)?.value ?? null,
    persistentRt: req.cookies.get(RT_COOKIE)?.value ?? null,
    modeCookie: req.cookies.get(RT_MODE_COOKIE)?.value ?? null,
    hintedRememberMe: oldPresence?.rememberMe ?? null,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  const moderation =
    supabaseUrl && serviceRole
      ? await fetchModerationRoutingHint(
          createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } }),
          auth.user.id,
          oldPresence?.moderation ?? 'none',
        )
      : await fetchModerationRoutingHint(auth.supabase, auth.user.id, oldPresence?.moderation ?? 'none')

  const res = NextResponse.json(
    { ok: true, moderation },
    { headers: { 'Cache-Control': 'no-store' } },
  )

  await setPresenceCookie(
    res,
    auth.user.id,
    isAdminUser(auth.user.id),
    cookieState.rememberMe,
    moderation,
  )

  return res
}
