import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

/**
 * GET /api/admin/retention
 *
 * Returns absolute-window retention metrics (not date-range parameterised):
 *   dau          — distinct users with login_success today (UTC)
 *   wau          — distinct users with login_success in last 7 days
 *   mau          — distinct users with login_success in last 30 days
 *   d7_cohort    — users who signed up 7-14 days ago (full window elapsed)
 *   d7_retained  — of that cohort, returned with login_success within 7 days
 *   d30_cohort   — users who signed up 30-60 days ago
 *   d30_retained — of that cohort, returned with login_success within 30 days
 *
 * Backed by admin_retention_metrics() SQL function (SECURITY DEFINER, service_role only).
 */
export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const { data, error } = await gate.admin.rpc('admin_retention_metrics') as {
    data: unknown
    error: { message: string } | null
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? {}, { headers: { 'Cache-Control': 'no-store' } })
}
