import type { Metadata } from 'next'
import RequireAuth from '@/components/auth/RequireAuth'

export const metadata: Metadata = {
  title: 'התראות',
  robots: { index: false, follow: false },
}

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
