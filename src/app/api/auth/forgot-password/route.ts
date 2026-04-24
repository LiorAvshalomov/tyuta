import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { createHash } from 'crypto'
import { buildAuditContext, mergeAuditMetadata } from '@/lib/auth/auditContext'

function emailHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16)
}

function isAllowedPasswordResetRedirect(value: string): boolean {
  if (!value) return true
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false

  const allowedHosts = new Set(['tyuta.net', 'www.tyuta.net'])
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (configuredSiteUrl) {
    try {
      const configuredHost = new URL(configuredSiteUrl).hostname
      if (configuredHost) allowedHosts.add(configuredHost)
    } catch {
      // Ignore malformed env; fall back to canonical production hosts.
    }
  }

  return allowedHosts.has(parsed.hostname)
}

export async function POST(req: Request) {
  const ctx = buildAuditContext(req)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey) {
    return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 })
  }

  // Rate limit: 3 requests per 10 minutes per IP
  const rl = await rateLimit(`forgot:${ctx.ip}`, { maxRequests: 3, windowMs: 10 * 60_000 })
  if (!rl.allowed) {
    // Log silently — the 200 response is intentional (oracle-attack prevention)
    if (serviceKey) {
      createClient(url, serviceKey, { auth: { persistSession: false } })
        .from('auth_audit_log').insert({
          user_id: null,
          event: 'rate_limit_exceeded',
          ip: ctx.ip,
          user_agent: ctx.user_agent,
          metadata: mergeAuditMetadata(ctx.metadata_base, { endpoint: 'forgot-password' }),
        }).then(null, () => null)
    }
    return NextResponse.json({ ok: true })
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

  if (!isAllowedPasswordResetRedirect(redirectTo)) {
    redirectTo = '/auth/reset-password'
  }

  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })
  // Always return ok (don't reveal whether email exists)
  void anonClient.auth.resetPasswordForEmail(email, { redirectTo: redirectTo || undefined })

  // Audit log — email_hash only, never plaintext (best-effort — must never block response)
  if (serviceKey) {
    const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } })
    serviceClient.from('auth_audit_log').insert({
      user_id: null,
      event: 'password_reset',
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      metadata: mergeAuditMetadata(ctx.metadata_base, { email_hash: emailHash(email) }),
    }).then(null, () => null)
  }

  return NextResponse.json({ ok: true })
}
