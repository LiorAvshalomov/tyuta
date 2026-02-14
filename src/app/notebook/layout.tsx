import RequireAuth from '@/components/auth/RequireAuth'
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "המחברת שלי",
  robots: {
    index: false,
    follow: false,
  },
};



export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
