import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  enforceActorRouteRateLimit,
  enforceIpRateLimit,
  resolveAuthedRoutePolicy,
  resolveProtectedGatePolicy,
} from '@/lib/requestRateLimit'

type RequireUserOk = {
  ok: true
  user: { id: string; email?: string | null }
  /**
   * Supabase client scoped to the user's JWT.
   * Queries made with this client will respect RLS.
   */
  supabase: SupabaseClient
}

type RequireUserFail = {
  ok: false
  response: NextResponse
}

export async function requireUserFromRequest(req: Request): Promise<RequireUserOk | RequireUserFail> {
  const gateLimit = await enforceIpRateLimit(req, resolveProtectedGatePolicy('authed', req.method))
  if (gateLimit) {
    return { ok: false, response: gateLimit }
  }

  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  if (!token) {
    return { ok: false, response: NextResponse.json({ error: { code: 'missing_token', message: 'missing token' } }, { status: 401 }) }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anon) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'server_env', message: 'missing server env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)' } },
        { status: 500 }
      ),
    }
  }

  // IMPORTANT: global Authorization header makes PostgREST apply RLS with the user's JWT.
  const supabase = createClient(supabaseUrl, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return { ok: false, response: NextResponse.json({ error: { code: 'invalid_token', message: 'invalid token' } }, { status: 401 }) }
  }

  const routeLimit = await enforceActorRouteRateLimit(req, data.user.id, resolveAuthedRoutePolicy)
  if (routeLimit) {
    return { ok: false, response: routeLimit }
  }

  return { ok: true, user: { id: data.user.id, email: data.user.email }, supabase }
}
