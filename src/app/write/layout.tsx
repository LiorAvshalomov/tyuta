import RequireAuth from '@/components/auth/RequireAuth'
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "כתיבה",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = 'force-dynamic'

export default function WriteLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
