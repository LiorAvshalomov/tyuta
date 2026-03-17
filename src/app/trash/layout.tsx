import type { Metadata } from 'next'
import RequireAuth from '@/components/auth/RequireAuth'

export const metadata: Metadata = {
  title: 'פח',
  robots: { index: false, follow: false },
}

export default function TrashLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
