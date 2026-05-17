import { supabase, hydrateSession } from '@/lib/supabaseClient'
import type { Session, User } from '@supabase/supabase-js'

import { USERNAME_MAX } from '@/lib/validation'
import { broadcastAuthEvent } from '@/lib/auth/authEvents'
import { publishHeaderUser, type HeaderUser } from '@/lib/auth/headerUser'
import { mapUserFacingError } from '@/lib/mapSupabaseError'

type AuthResponseBody = {
  access_token?: string
  user?: User
  error?: string
  header_user?: HeaderUser | null
  expires_at?: number
}

export function slugifyUsername(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX)
}

export async function signIn(
  email: string,
  password: string,
  rememberMe = true,
): Promise<{ data: { session: Session | null; user: User | null }; error: { message: string } | null }> {
  const res = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember_me: rememberMe }),
  })
  const body = await res.json() as AuthResponseBody

  if (!res.ok || body.error) {
    return { data: { session: null, user: null }, error: { message: mapUserFacingError(body.error, 'לא הצלחנו להתחבר. בדקו את הפרטים ונסו שוב.') } }
  }

  // AT lives in memory only; RT is now in an httpOnly cookie set by the server
  if (body.access_token) {
    await hydrateSession(body.access_token)
    publishHeaderUser(body.header_user ?? null, body.expires_at)
    broadcastAuthEvent('SIGNED_IN')
  }

  return { data: { session: null, user: body.user ?? null }, error: null }
}

export async function isUsernameTaken(username: string) {
  const { data, error } = await supabase.from('profiles').select('id').eq('username', username).limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

export async function signUp(params: {
  email: string
  password: string
  username: string
  display_name: string
}): Promise<{ data: { session: Session | null; user: User | null }; error: { message: string } | null }> {
  // DB trigger: on auth.users INSERT => handle_new_user()
  // Trigger reads raw_user_meta_data: { username, display_name }
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const body = await res.json() as AuthResponseBody

  if (!res.ok || body.error) {
    return { data: { session: null, user: null }, error: { message: mapUserFacingError(body.error, 'לא הצלחנו להשלים את ההרשמה. נסו שוב.') } }
  }

  // If email confirmation is disabled and session was returned, hydrate client
  if (body.access_token) {
    await hydrateSession(body.access_token)
    publishHeaderUser(body.header_user ?? null, body.expires_at)
    broadcastAuthEvent('SIGNED_IN')
  }

  return { data: { session: null, user: body.user ?? null }, error: null }
}

export async function sendPasswordResetEmail(email: string, redirectTo: string) {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirectTo }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    return { error: { message: mapUserFacingError(body.error, 'לא הצלחנו לשלוח מייל איפוס. נסו שוב.') } }
  }
  return { error: null }
}

export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword })
}
