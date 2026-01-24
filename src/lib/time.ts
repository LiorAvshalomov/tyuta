const TZ = "Asia/Jerusalem"

export function formatDateTimeHe(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input

  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function minutesLabel(n: number) {
  return n === 1 ? "דקה" : "דקות"
}
function hoursLabel(n: number) {
  return n === 1 ? "שעה" : "שעות"
}
function daysLabel(n: number) {
  return n === 1 ? "יום" : "ימים"
}
function weeksText(n: number) {
  if (n <= 1) return "שבוע"
  if (n === 2) return "שבועיים"
  return `${n} שבועות`
}
function monthsText(n: number) {
  if (n <= 1) return "חודש"
  if (n === 2) return "חודשיים"
  return `${n} חודשים`
}
function yearsText(n: number) {
  if (n <= 1) return "שנה"
  if (n === 2) return "שנתיים"
  return `${n} שנים`
}

export function formatRelativeHe(input: string | Date, now = new Date()) {
  const d = typeof input === "string" ? new Date(input) : input

  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 0) return "עכשיו"

  const diffMin = Math.floor(diffMs / (1000 * 60))
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return "עכשיו"
  if (diffMin < 60) return `לפני ${diffMin} ${minutesLabel(diffMin)}`
  if (diffHr < 24) return `לפני ${diffHr} ${hoursLabel(diffHr)}`
  if (diffDay === 1) return "אתמול"
  if (diffDay < 7) return `לפני ${diffDay} ${daysLabel(diffDay)}`

  // שבועות: 7–27 ימים
  if (diffDay < 28) {
    const weeks = Math.min(3, Math.floor(diffDay / 7))
    return `לפני ${weeksText(weeks)}`
  }

  // חודשים: 28–364 ימים
  if (diffDay < 365) {
    const months = Math.max(1, Math.floor(diffDay / 30))
    return `לפני ${monthsText(months)}`
  }

  // שנים: 365+ ימים
  const years = Math.max(1, Math.floor(diffDay / 365))
  return `לפני ${yearsText(years)}`
}

export function isNewPost(input: string | Date, hours = 48) {
  const d = typeof input === "string" ? new Date(input) : input
  const diffMs = Date.now() - d.getTime()
  return diffMs >= 0 && diffMs < hours * 60 * 60 * 1000
}
