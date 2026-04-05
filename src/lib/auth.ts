import { supabase, hydrateSession } from '@/lib/supabaseClient'
import type { Session, User } from '@supabase/supabase-js'

import { USERNAME_MAX } from '@/lib/validation'
import { broadcastAuthEvent } from '@/lib/auth/authEvents'

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
  const body = await res.json() as { access_token?: string; user?: User; error?: string }

  if (!res.ok || body.error) {
    return { data: { session: null, user: null }, error: { message: body.error ?? 'שגיאה בכניסה' } }
  }

  // AT lives in memory only; RT is now in an httpOnly cookie set by the server
  if (body.access_token) {
    await hydrateSession(body.access_token)
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
  const body = await res.json() as { access_token?: string; user?: User; error?: string }

  if (!res.ok || body.error) {
    return { data: { session: null, user: null }, error: { message: body.error ?? 'שגיאה בהרשמה' } }
  }

  // If email confirmation is disabled and session was returned, hydrate client
  if (body.access_token) {
    await hydrateSession(body.access_token)
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
    return { error: { message: body.error ?? 'שגיאה בשליחת המייל' } }
  }
  return { error: null }
}

export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword })
}
