import type { Metadata } from 'next'
import RequireAuth from '@/components/auth/RequireAuth'

export const metadata: Metadata = {
  title: 'שמורים',
  robots: { index: false, follow: false },
}

export default function SavedLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
