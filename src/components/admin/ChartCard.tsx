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
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {error && onRetry && (
          <button
            onClick={onRetry}
            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
          >
            נסה שוב
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
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
