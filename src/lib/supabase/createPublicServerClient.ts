import { createClient } from '@supabase/supabase-js'

export function createPublicServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) return null

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  })
}
