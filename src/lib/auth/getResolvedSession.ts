import type { Session } from '@supabase/supabase-js'
import { waitForClientSession } from '@/lib/auth/clientSession'

export async function getResolvedSession(timeoutMs = 8000): Promise<Session | null> {
  const resolved = await waitForClientSession(timeoutMs)
  return resolved.status === 'authenticated' ? resolved.session : null
}
