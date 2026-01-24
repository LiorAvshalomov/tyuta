import InboxThreads from '@/components/InboxThreads'

export default function InboxPage() {
  return (
    <div className="h-[calc(100dvh-120px)] min-h-0 overflow-hidden">
      {/* Mobile: show threads list */}
      <div className="md:hidden">
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-[#FAF9F6] shadow-sm">
          <InboxThreads />
        </div>
      </div>

      {/* Desktop: placeholder (threads are in sidebar) */}
      <div className="hidden h-full md:flex">
        <div className="flex h-full w-full items-center justify-center rounded-3xl border border-black/5 bg-[#FAF9F6] shadow-sm">
          <div className="text-center">
            <div className="text-lg font-black">בחר שיחה</div>
            <div className="mt-1 text-sm text-muted-foreground">כדי להתחיל לדבר 🙂</div>
          </div>
        </div>
      </div>
    </div>
  )
}
