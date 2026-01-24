import { supabase } from '../supabaseClient'

/**
 * Compatibility wrapper for code that expects `createClient()` like in newer Supabase examples.
 * Our app keeps a single browser client instance in `supabaseClient.ts`.
 */
export function createClient() {
  return supabase
}
