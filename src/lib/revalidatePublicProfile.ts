import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

type ProfileRow = {
  id: string
  username: string | null
}

function normalizeUsername(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const username = value.trim()
  return username ? username : null
}

export function revalidatePublicProfileUsername(username: string | null | undefined) {
  const normalized = normalizeUsername(username)
  if (!normalized) return
  revalidatePath(`/u/${normalized}`)
}

export async function revalidatePublicProfileForUserId(
  client: SupabaseClient,
  userId: string | null | undefined,
) {
  if (!userId) return

  const { data } = await client
    .from('profiles')
    .select('id, username')
    .eq('id', userId)
    .maybeSingle<ProfileRow>()

  revalidatePublicProfileUsername(data?.username)
}

export async function revalidatePublicProfilesForUserIds(
  client: SupabaseClient,
  userIds: Array<string | null | undefined>,
) {
  const ids = Array.from(new Set(userIds.filter((value): value is string => typeof value === 'string' && value.length > 0)))
  if (ids.length === 0) return

  const { data } = await client
    .from('profiles')
    .select('id, username')
    .in('id', ids)

  for (const row of (data ?? []) as ProfileRow[]) {
    revalidatePublicProfileUsername(row.username)
  }
}
