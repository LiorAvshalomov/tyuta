import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type KpiCardProps = {
  label: string
  value: string | number
  suffix?: string
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  icon?: React.ReactNode
}

export default function KpiCard({
  label,
  value,
  suffix,
  trend,
  trendLabel,
  icon,
}: KpiCardProps) {
  const trendColor =
    trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'down'
        ? 'text-red-500 dark:text-red-400'
        : 'text-neutral-400 dark:text-neutral-500'

  const TrendIcon =
    trend === 'up'
      ? TrendingUp
      : trend === 'down'
        ? TrendingDown
        : Minus

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
        {icon && <span className="text-neutral-300 dark:text-neutral-600">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          {value}
        </span>
        {suffix && (
          <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">{suffix}</span>
        )}
      </div>
      {trend && trendLabel && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon size={13} />
          <span>{trendLabel}</span>
        </div>
      )}
    </div>
  )
}
