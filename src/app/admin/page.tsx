import AdminDashboardClient from '@/components/admin/AdminDashboardClient'
import { defaultDashboardRange, loadDashboardQuickCounts } from '@/lib/admin/dashboardData'
import { requireAdminFromServer } from '@/lib/admin/requireAdminFromServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function AdminDashboardPage() {
  const admin = await requireAdminFromServer('/admin')
  const initialRange = defaultDashboardRange()

  let quickCounts = { openReports: null as number | null, openContact: null as number | null }
  try {
    const counts = await loadDashboardQuickCounts(admin)
    quickCounts = counts
  } catch {
    // counts stay null, dashboard shows '—'
  }

  return (
    <AdminDashboardClient
      initialQuickCounts={quickCounts}
      initialRange={initialRange}
      initialDash={null}
      initialDashErr={null}
    />
  )
}
