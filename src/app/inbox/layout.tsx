import InboxThreads from '@/components/InboxThreads'
import InboxShell from '@/components/InboxShell'
import RequireAuth from '@/components/auth/RequireAuth'

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <InboxShell>
        {/* Desktop split layout */}
        <div className="hidden md:grid md:grid-cols-[360px_1fr] md:gap-4 h-full min-h-0 py-2">
          {/* Sidebar */}
          <aside className="h-full min-h-0 overflow-hidden rounded-3xl border border-black/5 bg-[#FAF9F6] shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]">
            <div className="h-full min-h-0 overflow-hidden">
              <InboxThreads />
            </div>
          </aside>

          {/* Main */}
          <main className="h-full min-h-0 overflow-hidden">{children}</main>
        </div>

        {/* Mobile: render children as-is (page decides what to show) */}
        <div className="md:hidden h-full min-h-0 overflow-hidden py-2">{children}</div>
      </InboxShell>
    </RequireAuth>
  )
}
