import Link from 'next/link'
import ChatClient from '@/components/ChatClient'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function ChatPage({ params }: PageProps) {
  const { id } = await params

  if (!id) {
    return (
      <div className="h-full" dir="rtl">
        <div className="rounded-3xl border bg-white p-4 text-sm text-muted-foreground shadow-sm">
          שגיאה: חסר מזהה שיחה (conversationId).
        </div>
      </div>
    )
  }

  return (
    <div className="h-full" dir="rtl">
      {/* Mobile back */}
      <div className="md:hidden mb-3">
        <Link
          href="/inbox"
          className="inline-flex items-center rounded-2xl border bg-white px-3 py-2 text-sm font-bold shadow-sm"
        >
          ← חזרה להודעות
        </Link>
      </div>

      <ChatClient conversationId={id} />
    </div>
  )
}
