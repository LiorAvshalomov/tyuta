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
  children: React.ReactNode
}

export default function ChartCard({
  title,
  loading,
  empty,
  error,
  onRetry,
  children,
}: ChartCardProps) {
  if (loading) return <ChartSkeleton />

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
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
