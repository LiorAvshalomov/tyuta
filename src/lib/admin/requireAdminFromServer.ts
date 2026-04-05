import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

import { AUTH_HINT_COOKIE, verifyAuthHint } from '@/lib/auth/presenceCookie'

function parseAdminIds() {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export async function requireAdminFromServer(nextPath = '/admin') {
  const cookieStore = await cookies()
  const authHint = cookieStore.get(AUTH_HINT_COOKIE)?.value ?? ''
  const secret = process.env.PRESENCE_HMAC_SECRET ?? ''

  if (!authHint || !secret) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`)
  }

  const claims = await verifyAuthHint(authHint, secret)
  if (!claims) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`)
  }

  if (!claims.isAdmin) {
    redirect('/')
  }

  const adminIds = parseAdminIds()
  if (!adminIds.includes(claims.uid)) {
    redirect('/')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) {
    throw new Error('missing server env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }

  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  })
}
