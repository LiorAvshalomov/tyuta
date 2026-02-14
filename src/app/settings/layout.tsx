import RequireAuth from '@/components/auth/RequireAuth'
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "עריכת פרופיל",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
