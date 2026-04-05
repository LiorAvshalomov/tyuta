import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { waitForAuthResolution } from '@/lib/auth/authEvents'

export type ClientSessionResolution =
  | { status: 'authenticated'; session: Session; user: User }
  | { status: 'unauthenticated' }
  | { status: 'timeout' }

export async function waitForClientSession(timeoutMs = 8000): Promise<ClientSessionResolution> {
  const initial = await supabase.auth.getSession()
  if (initial.data.session?.user) {
    return {
      status: 'authenticated',
      session: initial.data.session,
      user: initial.data.session.user,
    }
  }

  const resolution = await waitForAuthResolution(timeoutMs)
  if (resolution !== 'authenticated') {
    return { status: resolution === 'unauthenticated' ? 'unauthenticated' : 'timeout' }
  }

  const hydrated = await supabase.auth.getSession()
  if (hydrated.data.session?.user) {
    return {
      status: 'authenticated',
      session: hydrated.data.session,
      user: hydrated.data.session.user,
    }
  }

  return { status: 'timeout' }
}
