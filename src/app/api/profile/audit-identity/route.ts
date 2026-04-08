import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'

function normalizeValue(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getIp(req: Request) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: Request) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const rl = await rateLimit(`profile-audit:${auth.user.id}`, { maxRequests: 15, windowMs: 10 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const body = await req.json().catch(() => ({})) as {
    previousUsername?: unknown
    nextUsername?: unknown
    previousDisplayName?: unknown
    nextDisplayName?: unknown
  }

  const previousUsername = normalizeValue(body.previousUsername)
  const nextUsername = normalizeValue(body.nextUsername)
  const previousDisplayName = normalizeValue(body.previousDisplayName)
  const nextDisplayName = normalizeValue(body.nextDisplayName)

  const changedFields: string[] = []
  if (previousUsername !== nextUsername) changedFields.push('username')
  if (previousDisplayName !== nextDisplayName) changedFields.push('display_name')

  if (changedFields.length === 0) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'missing server env' }, { status: 500 })
  }

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  await serviceClient.from('auth_audit_log').insert({
    user_id: auth.user.id,
    event: 'profile_identity_updated',
    ip: getIp(req),
    user_agent: req.headers.get('user-agent') ?? null,
    metadata: {
      changed_fields: changedFields,
      previous_username: previousUsername,
      next_username: nextUsername,
      previous_display_name: previousDisplayName,
      next_display_name: nextDisplayName,
    },
  }).then(null, () => null)

  return NextResponse.json({ ok: true })
}
