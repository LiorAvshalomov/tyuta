import { Inbox } from 'lucide-react'

export default function EmptyState({
  title = 'אין נתונים',
  description,
  icon,
}: {
  title?: string
  description?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 text-neutral-300">
        {icon ?? <Inbox size={40} strokeWidth={1.5} />}
      </div>
      <div className="text-sm font-semibold text-neutral-600">{title}</div>
      {description && (
        <div className="mt-1 max-w-xs text-xs text-neutral-400">{description}</div>
      )}
    </div>
  )
}
