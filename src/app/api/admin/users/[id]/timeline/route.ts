import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import { USER_HISTORY_ACTIONS } from '@/lib/admin/userModerationHistory'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/admin/users/[id]/timeline
 *
 * Aggregates all activity for a single user:
 *   - Profile + moderation status
 *   - Recent posts (last 20)
 *   - Auth audit events attributed to this user (last 30)
 *   - Moderation events where this user's content was actioned (last 20)
 *
 * All queries run in parallel via Promise.all.
 * Gated by requireAdminFromRequest — service-role only.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { id: userId } = await params

  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'invalid user id' }, { status: 400 })
  }

  const { admin } = auth

  const [profileRes, modRes, postsRes, auditRes, modEventsRes, accountActionsRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, username, display_name, avatar_url, created_at')
      .eq('id', userId)
      .maybeSingle(),

    admin
      .from('user_moderation')
      .select('is_suspended, reason, suspended_at, suspended_by, is_banned, ban_reason, banned_at, banned_by')
      .eq('user_id', userId)
      .maybeSingle(),

    admin
      .from('posts')
      .select('id, title, slug, status, created_at, deleted_at, is_anonymous')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),

    admin
      .from('auth_audit_log')
      .select('id, event, ip, user_agent, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),

    admin
      .from('moderation_events')
      .select('id, action, reason, actor_user_id, actor_role, target_type, target_id, created_at')
      .eq('target_author_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),

    admin
      .from('moderation_actions')
      .select('*')
      .eq('target_user_id', userId)
      .in('action', [...USER_HISTORY_ACTIONS])
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!profileRes.data) {
    if (profileRes.error) {
      return NextResponse.json({ error: profileRes.error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  return NextResponse.json(
    {
      profile:          profileRes.data,
      moderation:       modRes.data ?? null,
      posts:            postsRes.data ?? [],
      auditEvents:      auditRes.data ?? [],
      moderationEvents: modEventsRes.data ?? [],
      accountActions:   accountActionsRes.data ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
