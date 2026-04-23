import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

/**
 * GET /api/admin/badges
 *
 * Returns lightweight alert counts for the admin sidebar badges.
 * Polled every 60 s by AdminShell — intentionally simple (no WebSocket).
 *
 * Response: { reports: number; failedLogins: number; inbox: number }
 *   reports      — open/pending user reports
 *   failedLogins — failed login attempts in the last 24 h
 *   inbox        — unread inbox messages sent to the system user
 */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  const systemUserId = (process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? process.env.SYSTEM_USER_ID ?? '').trim()

  const [reportsRes, failedLoginsRes, inboxRes] = await Promise.all([
    admin
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'pending']),

    admin
      .from('auth_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'login_failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),

    // Count unread messages in system-user conversations
    systemUserId
      ? (async () => {
          const { data: memberRows } = await admin
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', systemUserId)
            .limit(500)
          const convIds = ((memberRows ?? []) as { conversation_id: string }[]).map((r) => r.conversation_id)
          if (!convIds.length) return { count: 0 }
          return admin
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .in('conversation_id', convIds)
            .neq('sender_id', systemUserId)
            .is('read_at', null)
        })()
      : Promise.resolve({ count: 0 }),
  ])

  return NextResponse.json(
    {
      reports:      reportsRes.count  ?? 0,
      failedLogins: failedLoginsRes.count ?? 0,
      inbox:        (inboxRes as { count: number | null }).count ?? 0,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
