import type { Metadata } from 'next'
import AdminLayout from '@/components/admin/AdminLayout'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ניהול',
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>
}
