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
      ? 'text-emerald-600'
      : trend === 'down'
        ? 'text-red-500'
        : 'text-neutral-400'

  const TrendIcon =
    trend === 'up'
      ? TrendingUp
      : trend === 'down'
        ? TrendingDown
        : Minus

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        {icon && <span className="text-neutral-300">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-neutral-900">
          {value}
        </span>
        {suffix && (
          <span className="text-xs font-medium text-neutral-400">{suffix}</span>
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
