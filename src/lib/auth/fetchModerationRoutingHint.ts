import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveModerationRoutingHint, type ModerationRoutingHint } from '@/lib/auth/moderationRouting'

export async function fetchModerationRoutingHint(
  supabase: SupabaseClient,
  userId: string,
  fallback: ModerationRoutingHint = 'none',
): Promise<ModerationRoutingHint> {
  const { data, error } = await supabase
    .from('user_moderation')
    .select('is_banned, is_suspended')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return fallback
  return deriveModerationRoutingHint(data)
}
