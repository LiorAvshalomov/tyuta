export function SkeletonBox({
  className = '',
}: {
  className?: string
}) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[#e8e5df] dark:bg-neutral-800 ${className}`}
      aria-hidden="true"
    />
  )
}

export function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <SkeletonBox className="mb-3 h-3 w-20" />
      <SkeletonBox className="h-8 w-16" />
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <SkeletonBox className="mb-4 h-4 w-32" />
      <SkeletonBox className="h-[220px] w-full rounded-lg" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <SkeletonBox className="mb-2 h-4 w-3/4" />
          <SkeletonBox className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}
