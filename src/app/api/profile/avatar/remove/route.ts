import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'

const ALLOWED_PROFILE_FILENAMES = new Set([
  'profile.jpg',
  'profile.jpeg',
  'profile.png',
  'profile.webp',
  'profile.gif',
])

export async function POST(req: Request) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const rl = await rateLimit(`avatar-remove:${auth.user.id}`, { maxRequests: 10, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'missing server env' }, { status: 500 })
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await service.storage
    .from('avatars')
    .list(auth.user.id, { limit: 50 })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const avatarPaths = (data ?? [])
    .map((entry) => entry.name?.trim() ?? '')
    .filter((name) => ALLOWED_PROFILE_FILENAMES.has(name))
    .map((name) => `${auth.user.id}/${name}`)

  if (avatarPaths.length === 0) {
    return NextResponse.json({ ok: true, removed: 0 })
  }

  const { error: removeError } = await service.storage.from('avatars').remove(avatarPaths)
  if (removeError) {
    return NextResponse.json({ ok: false, error: removeError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, removed: avatarPaths.length })
}
