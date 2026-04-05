import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { setRefreshCookie } from '@/lib/auth/cookieHelpers'
import { setPresenceCookie } from '@/lib/auth/presenceCookie'
import { fetchModerationRoutingHint } from '@/lib/auth/fetchModerationRoutingHint'

function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: Request) {
  const ip = getIp(req)

  // Rate limit: 3 signups per 5 minutes per IP
  const rl = await rateLimit(`signup:${ip}`, { maxRequests: 3, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי ניסיונות הרשמה. נסה שוב מאוחר יותר.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  let email: string, password: string, username: string, display_name: string
  try {
    const body = await req.json()
    email = String(body.email ?? '')
    password = String(body.password ?? '')
    username = String(body.username ?? '')
    display_name = String(body.display_name ?? '')
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  if (!email || !password || !username || !display_name) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 })
  }

  // Reject oversized inputs before touching the DB — prevents long-string DoS on bcrypt
  if (email.length > 320 || password.length > 1000) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }

  // Server-side bounds (mirrors client validation — cannot be bypassed)
  if (username.length < 3 || username.length > 30 || !/^[a-z0-9_]+$/.test(username)) {
    return NextResponse.json({ error: 'שם משתמש לא תקין' }, { status: 400 })
  }
  if (display_name.length < 1 || display_name.length > 50) {
    return NextResponse.json({ error: 'שם תצוגה לא תקין' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'אימייל לא תקין' }, { status: 400 })
  }

  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })
  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await anonClient.auth.signUp({
    email,
    password,
    options: { data: { username, display_name } },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Log signup (best-effort)
  if (data.user?.id) {
    await serviceClient.from('auth_audit_log').insert({
      user_id: data.user.id,
      event: 'signup',
      ip,
      user_agent: req.headers.get('user-agent') ?? null,
      metadata: null,
    }).then(null, () => null)
  }

  // If email confirmation is disabled and Supabase returned a session immediately,
  // set the httpOnly RT cookie and return the AT in the body.
  // If email confirmation is required, data.session is null — no cookie is set.
  if (data.session) {
    const moderation = await fetchModerationRoutingHint(serviceClient, data.user!.id)
    const res = NextResponse.json(
      {
        access_token: data.session.access_token,
        expires_at:   data.session.expires_at,
        user:         data.user,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
    setRefreshCookie(res, data.session.refresh_token)
    await setPresenceCookie(res, data.user!.id, false, true, moderation)
    return res
  }

  // Email confirmation required — no session yet
  return NextResponse.json({ user: data.user })
}
