import AdminDashboardClient from '@/components/admin/AdminDashboardClient'
import { defaultDashboardRange, loadDashboardPayload, loadDashboardQuickCounts } from '@/lib/admin/dashboardData'
import { requireAdminFromServer } from '@/lib/admin/requireAdminFromServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function AdminDashboardPage() {
  const admin = await requireAdminFromServer('/admin')
  const initialRange = defaultDashboardRange()

  const [quickCountsResult, dashResult] = await Promise.allSettled([
    loadDashboardQuickCounts(admin),
    loadDashboardPayload(admin, initialRange),
  ])

  const initialQuickCounts =
    quickCountsResult.status === 'fulfilled'
      ? quickCountsResult.value
      : { openReports: null, openContact: null }

  const initialDash = dashResult.status === 'fulfilled' ? dashResult.value : null
  const initialDashErr = dashResult.status === 'rejected'
    ? dashResult.reason instanceof Error
      ? dashResult.reason.message
      : 'שגיאה בטעינת הדשבורד'
    : null

  return (
    <AdminDashboardClient
      initialQuickCounts={initialQuickCounts}
      initialRange={initialRange}
      initialDash={initialDash}
      initialDashErr={initialDashErr}
    />
  )
}
