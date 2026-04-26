'use client'

import { ChartSkeleton } from './AdminSkeleton'
import EmptyState from './EmptyState'
import { BarChart3 } from 'lucide-react'

type ChartCardProps = {
  title: string
  loading?: boolean
  empty?: boolean
  error?: string | null
  onRetry?: () => void
  accentColor?: string
  children: React.ReactNode
}

export default function ChartCard({
  title,
  loading,
  empty,
  error,
  onRetry,
  accentColor,
  children,
}: ChartCardProps) {
  if (loading) return <ChartSkeleton />

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          {accentColor && (
            <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
          )}
          {title}
        </h3>
        {error && onRetry && (
          <button
            onClick={onRetry}
            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            נסה שוב
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      ) : empty ? (
        <EmptyState
          title="אין נתונים לתצוגה"
          icon={<BarChart3 size={32} strokeWidth={1.5} />}
        />
      ) : (
        children
      )}
    </div>
  )
}
