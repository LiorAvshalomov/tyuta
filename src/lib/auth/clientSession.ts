import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { getAuthResolutionState, getAuthState, waitForAuthResolution } from '@/lib/auth/authEvents'

export type ClientSessionResolution =
  | { status: 'authenticated'; session: Session; user: User }
  | { status: 'unauthenticated' }
  | { status: 'timeout' }

const SESSION_POLL_INTERVAL_MS = 150

async function readClientSession(): Promise<Session | null> {
  const result = await supabase.auth.getSession()
  return result.data.session ?? null
}

export async function waitForClientSession(timeoutMs = 8000): Promise<ClientSessionResolution> {
  const initial = await readClientSession()
  if (initial?.user) {
    return {
      status: 'authenticated',
      session: initial,
      user: initial.user,
    }
  }

  if (getAuthState() === 'in') {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (getAuthResolutionState() === 'unauthenticated') {
        return { status: 'unauthenticated' }
      }

      await new Promise((resolve) => window.setTimeout(resolve, SESSION_POLL_INTERVAL_MS))
      const next = await readClientSession()
      if (next?.user) {
        return {
          status: 'authenticated',
          session: next,
          user: next.user,
        }
      }
    }

    if (getAuthResolutionState() === 'unauthenticated') {
      return { status: 'unauthenticated' }
    }

    return { status: 'timeout' }
  }

  const resolution = await waitForAuthResolution(timeoutMs)
  if (resolution !== 'authenticated') {
    return { status: resolution === 'unauthenticated' ? 'unauthenticated' : 'timeout' }
  }

  const hydrated = await readClientSession()
  if (hydrated?.user) {
    return {
      status: 'authenticated',
      session: hydrated,
      user: hydrated.user,
    }
  }

  return { status: 'timeout' }
}
