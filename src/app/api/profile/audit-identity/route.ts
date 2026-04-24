import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { buildAuditContext, mergeAuditMetadata } from '@/lib/auth/auditContext'

function normalizeValue(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
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
    nextUsername?: unknown
    nextDisplayName?: unknown
  }

  const nextUsername = normalizeValue(body.nextUsername)
  const nextDisplayName = normalizeValue(body.nextDisplayName)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'missing server env' }, { status: 500 })
  }

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // Read current values from DB — never trust client-supplied "previous" state
  const { data: current } = await serviceClient
    .from('profiles')
    .select('username, display_name')
    .eq('id', auth.user.id)
    .maybeSingle()

  const previousUsername = current?.username ?? null
  const previousDisplayName = current?.display_name ?? null

  const changedFields: string[] = []
  if (previousUsername !== nextUsername) changedFields.push('username')
  if (previousDisplayName !== nextDisplayName) changedFields.push('display_name')

  if (changedFields.length === 0) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const ctx = buildAuditContext(req)

  await serviceClient.from('auth_audit_log').insert({
    user_id: auth.user.id,
    event: 'profile_identity_updated',
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    metadata: mergeAuditMetadata(ctx.metadata_base, {
      changed_fields: changedFields,
      previous_username: previousUsername,
      next_username: nextUsername,
      previous_display_name: previousDisplayName,
      next_display_name: nextDisplayName,
    }),
  }).then(null, () => null)

  return NextResponse.json({ ok: true })
}
