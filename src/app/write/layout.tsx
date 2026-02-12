import RequireAuth from '@/components/auth/RequireAuth'

export const dynamic = 'force-dynamic'

export default function WriteLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
