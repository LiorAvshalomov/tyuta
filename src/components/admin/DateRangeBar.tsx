'use client'

import { Calendar } from 'lucide-react'

type Preset = {
  label: string
  days: number
}

const PRESETS: Preset[] = [
  { label: '7 ימים', days: 7 },
  { label: '30 ימים', days: 30 },
  { label: '90 ימים', days: 90 },
]

type Bucket = 'day' | 'week' | 'month'

const BUCKETS: { value: Bucket; label: string }[] = [
  { value: 'day', label: 'יום' },
  { value: 'week', label: 'שבוע' },
  { value: 'month', label: 'חודש' },
]

type DateRangeBarProps = {
  startDate: string
  endDate: string
  bucket: Bucket
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onBucketChange: (v: Bucket) => void
  onPreset: (days: number) => void
}

export default function DateRangeBar({
  startDate,
  endDate,
  bucket,
  onStartChange,
  onEndChange,
  onBucketChange,
  onPreset,
}: DateRangeBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Presets */}
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => onPreset(p.days)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date pickers */}
      <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5">
        <Calendar size={14} className="text-neutral-400" />
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          className="border-none bg-transparent text-xs font-medium text-neutral-700 outline-none"
          aria-label="תאריך התחלה"
        />
        <span className="text-xs text-neutral-300">—</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          className="border-none bg-transparent text-xs font-medium text-neutral-700 outline-none"
          aria-label="תאריך סיום"
        />
      </div>

      {/* Bucket selector */}
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
        {BUCKETS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => onBucketChange(b.value)}
            className={
              'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ' +
              (bucket === b.value
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')
            }
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}
