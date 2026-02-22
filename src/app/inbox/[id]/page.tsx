import ChatClient from '@/components/ChatClient'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function ChatPage({ params }: PageProps) {
  const { id } = await params

  if (!id) {
    return (
      <div className="h-full min-h-0 overflow-hidden" dir="rtl">
        <div className="rounded-3xl border bg-white p-4 text-sm text-muted-foreground shadow-sm">
          שגיאה: חסר מזהה שיחה (conversationId).
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden" dir="rtl">
      <ChatClient conversationId={id} />
    </div>
  )
}
