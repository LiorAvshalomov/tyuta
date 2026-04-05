import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { createHash } from 'crypto'

function emailHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16)
}

function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: Request) {
  const ip = getIp(req)

  // Rate limit: 3 requests per 10 minutes per IP
  const rl = await rateLimit(`forgot:${ip}`, { maxRequests: 3, windowMs: 10 * 60_000 })
  if (!rl.allowed) {
    // Return 200 (don't reveal rate limit — avoid oracle attacks)
    return NextResponse.json({ ok: true })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  let email: string, redirectTo: string
  try {
    const body = await req.json()
    email = String(body.email ?? '').trim()
    redirectTo = String(body.redirectTo ?? '')
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  // Validate redirectTo is a relative path or our own domain (prevent open redirect).
  // Exclude protocol-relative URLs like //evil.com which also start with '/'.
  const isRelative = redirectTo.startsWith('/') && !redirectTo.startsWith('//')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const isSameDomain =
    redirectTo.startsWith('https://tyuta.net') ||
    redirectTo.startsWith('https://www.tyuta.net') ||
    (!!siteUrl && redirectTo.startsWith(siteUrl))
  if (redirectTo && !isRelative && !isSameDomain) {
    redirectTo = '/auth/reset-password'
  }

  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })
  // Always return ok (don't reveal whether email exists)
  void anonClient.auth.resetPasswordForEmail(email, { redirectTo: redirectTo || undefined })

  // Audit log — email_hash only, never plaintext (best-effort — must never block response)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) {
    const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } })
    serviceClient.from('auth_audit_log').insert({
      user_id: null,
      event: 'password_reset',
      ip,
      user_agent: req.headers.get('user-agent') ?? null,
      metadata: { email_hash: emailHash(email) },
    }).then(null, () => null)
  }

  return NextResponse.json({ ok: true })
}
