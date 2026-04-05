import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserHistoryAction } from '@/lib/admin/userModerationHistory'

type JsonObject = Record<string, unknown>

export type UserProfileSnapshot = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  is_anonymous: boolean | null
}

type LogUserModerationActionArgs = {
  admin: SupabaseClient
  actorId: string
  targetUserId: string
  action: UserHistoryAction
  reason?: string | null
  metadata?: JsonObject
  strict?: boolean
  fallbackReasonSuffix?: string | null
}

type InsertResult = {
  id: string | null
  metadataPersisted: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function looksLikeMissingMetadataColumn(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('metadata') && (message.includes('column') || message.includes('schema cache'))
}

function withFallbackReason(
  reason: string | null | undefined,
  suffix: string | null | undefined,
): string | null {
  const trimmedReason = reason?.trim() ?? ''
  const trimmedSuffix = suffix?.trim() ?? ''
  if (!trimmedReason && !trimmedSuffix) return null
  if (!trimmedReason) return trimmedSuffix
  if (!trimmedSuffix) return trimmedReason
  return `${trimmedReason} | ${trimmedSuffix}`
}

export async function fetchUserProfileSnapshot(
  admin: SupabaseClient,
  userId: string,
): Promise<UserProfileSnapshot | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_anonymous')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data || typeof data.id !== 'string') return null

  return {
    id: data.id,
    username: typeof data.username === 'string' ? data.username : null,
    display_name: typeof data.display_name === 'string' ? data.display_name : null,
    avatar_url: typeof data.avatar_url === 'string' ? data.avatar_url : null,
    is_anonymous: typeof data.is_anonymous === 'boolean' ? data.is_anonymous : null,
  }
}

export function parseProfileSnapshot(value: unknown): UserProfileSnapshot | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null

  return {
    id: value.id,
    username: typeof value.username === 'string' ? value.username : null,
    display_name: typeof value.display_name === 'string' ? value.display_name : null,
    avatar_url: typeof value.avatar_url === 'string' ? value.avatar_url : null,
    is_anonymous: typeof value.is_anonymous === 'boolean' ? value.is_anonymous : null,
  }
}

export async function logUserModerationAction({
  admin,
  actorId,
  targetUserId,
  action,
  reason,
  metadata,
  strict = false,
  fallbackReasonSuffix,
}: LogUserModerationActionArgs): Promise<InsertResult> {
  const baseRow = {
    actor_id: actorId,
    target_user_id: targetUserId,
    action,
    reason: reason?.trim() || null,
  }

  const normalizedMetadata = isRecord(metadata) && Object.keys(metadata).length > 0 ? metadata : null

  if (normalizedMetadata) {
    const { data, error } = await admin
      .from('moderation_actions')
      .insert({
        ...baseRow,
        metadata: normalizedMetadata,
      } as never)
      .select('id')
      .single()

    if (!error && data && typeof data.id === 'string') {
      return { id: data.id, metadataPersisted: true }
    }

    if (!looksLikeMissingMetadataColumn(error)) {
      if (strict) {
        throw new Error(error?.message ?? 'persistent audit insert failed')
      }
      return { id: null, metadataPersisted: false }
    }
  }

  const { data, error } = await admin
    .from('moderation_actions')
    .insert({
      ...baseRow,
      reason: withFallbackReason(baseRow.reason, fallbackReasonSuffix),
    } as never)
    .select('id')
    .single()

  if (error) {
    if (strict) {
      throw new Error(error.message)
    }
    return { id: null, metadataPersisted: false }
  }

  return {
    id: data && typeof data.id === 'string' ? data.id : null,
    metadataPersisted: false,
  }
}
