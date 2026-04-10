import AdminDashboardClient from '@/components/admin/AdminDashboardClient'
import { defaultDashboardRange } from '@/lib/admin/dashboardData'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function AdminDashboardPage() {
  const initialRange = defaultDashboardRange()

  return (
    <AdminDashboardClient
      initialQuickCounts={{ openReports: null, openContact: null }}
      initialRange={initialRange}
      initialDash={null}
      initialDashErr={null}
    />
  )
}
