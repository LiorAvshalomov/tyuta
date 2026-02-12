import { AlertTriangle, RefreshCw } from 'lucide-react'

type ErrorBannerProps = {
  message: string
  onRetry?: () => void
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <AlertTriangle size={16} className="shrink-0 text-red-500" />
      <span className="min-w-0 flex-1 text-sm text-red-700">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
        >
          <RefreshCw size={12} />
          <span>נסה שוב</span>
        </button>
      )}
    </div>
  )
}
