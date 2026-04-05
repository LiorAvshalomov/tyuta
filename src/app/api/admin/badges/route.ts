import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

/**
 * GET /api/admin/badges
 *
 * Returns lightweight alert counts for the admin sidebar badges.
 * Polled every 60 s by AdminShell — intentionally simple (no WebSocket).
 *
 * Response: { reports: number; failedLogins: number }
 *   reports      — open/pending user reports
 *   failedLogins — failed login attempts in the last 24 h
 */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { admin } = auth

  const [reportsRes, failedLoginsRes] = await Promise.all([
    admin
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'pending']),

    admin
      .from('auth_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'login_failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])

  return NextResponse.json(
    {
      reports:      reportsRes.count  ?? 0,
      failedLogins: failedLoginsRes.count ?? 0,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
