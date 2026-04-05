import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { waitForAuthResolution } from '@/lib/auth/authEvents'

export async function getResolvedSession(timeoutMs = 8000): Promise<Session | null> {
  const initial = await supabase.auth.getSession()
  if (initial.data.session) return initial.data.session

  const resolution = await waitForAuthResolution(timeoutMs)
  if (resolution !== 'authenticated') return null

  const hydrated = await supabase.auth.getSession()
  return hydrated.data.session ?? null
}
