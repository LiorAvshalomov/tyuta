import InboxThreads from '@/components/InboxThreads'

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4" dir="rtl">
      {/* Desktop split layout */}
      <div className="hidden md:grid md:min-h-0 md:grid-cols-[360px_1fr] md:gap-4">
        {/* Sidebar */}
        <aside className="h-[calc(100dvh-120px)] min-h-0 overflow-hidden rounded-3xl border border-black/5 bg-[#FAF9F6] shadow-sm">
          <div className="h-full min-h-0 overflow-hidden">
            <InboxThreads />
          </div>
        </aside>

        {/* Main */}
        <main className="h-[calc(100dvh-120px)] min-h-0 overflow-hidden">{children}</main>
      </div>

      {/* Mobile: render children as-is (page decides what to show) */}
      <div className="md:hidden h-[calc(100dvh-120px)] overflow-hidden">{children}</div>
    </div>
  )
}
