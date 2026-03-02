/**
 * heRelativeTime — single source of truth for Hebrew relative date strings.
 *
 * Rules:
 *  <1 min    → "עכשיו"
 *  <60 min   → "X דקות"  (1 min: "דקה")
 *  1 hr      → "לפני שעה"
 *  2 hr      → "שעתיים"
 *  3-23 hr   → "X שעות"
 *  1 day     → "לפני יום"
 *  2 days    → "יומיים"
 *  3-6 days  → "X ימים"
 *  1 week    → "לפני שבוע"
 *  2 weeks   → "שבועיים"
 *  ≥3 weeks  → "X שבועות"  (until calendar-month boundary)
 *  1 month   → "לפני חודש"
 *  2 months  → "חודשיים"
 *  ≥3 months → "X חודשים"
 *  1 year    → "לפני שנה"
 *  2 years   → "שנתיים"
 *  ≥3 years  → "X שנים"
 *
 * Months and years are calendar-based (day-of-month anniversary).
 * Example: Feb 2 → Mar 2 = 1 month ("לפני חודש").
 */

/** Calendar months elapsed between two dates (day-of-month anniversary). */
function calMonthsElapsed(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  return to.getDate() >= from.getDate() ? months : months - 1
}

/** Calendar years elapsed between two dates (month+day anniversary). */
function calYearsElapsed(from: Date, to: Date): number {
  const years = to.getFullYear() - from.getFullYear()
  const anniversaryPassed =
    to.getMonth() > from.getMonth() ||
    (to.getMonth() === from.getMonth() && to.getDate() >= from.getDate())
  return anniversaryPassed ? years : years - 1
}

export function heRelativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = Math.max(0, now.getTime() - d.getTime())

  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'עכשיו'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return diffMin === 1 ? 'דקה' : `${diffMin} דקות`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr === 1) return 'לפני שעה'
  if (diffHr < 24) return `לפני ${diffHr} שעות`

  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDay === 1) return 'לפני יום'
  if (diffDay < 7) return `לפני ${diffDay} ימים`

  // Calendar years (check before months to avoid multi-year miscounting)
  const years = calYearsElapsed(d, now)
  if (years >= 1) {
    if (years === 1) return 'לפני שנה'
    if (years === 2) return 'לפני שנתיים'
    return `לפני ${years} שנים`
  }

  // Calendar months
  const months = calMonthsElapsed(d, now)
  if (months >= 1) {
    if (months === 1) return 'לפני חודש'
    if (months === 2) return 'לפני חודשיים'
    return `לפני ${months} חודשים`
  }

  // Weeks (7 days up to calendar-month boundary)
  const weeks = Math.floor(diffDay / 7)
  if (weeks === 1) return 'לפני שבוע'
  if (weeks === 2) return 'לפני שבועיים'
  return `לפני ${weeks} שבועות`
}
