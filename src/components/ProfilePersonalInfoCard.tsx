import React from 'react'

type Props = {
  about?: string | null
  age?: number | null
  occupation?: string | null
  writingAbout?: string | null
  books?: string | null
  favoriteCategory?: string | null
  isShared?: boolean | null
  rightSlot?: React.ReactNode
}

function Placeholder({ text }: { text: string }) {
  return <span className="text-sm text-neutral-400 dark:text-muted-foreground/70">{text}</span>
}

function Row({
  label,
  value,
  placeholder,
}: {
  label: string
  value: React.ReactNode
  placeholder: string
}) {
  const hasValue =
    value !== null &&
    value !== undefined &&
    (typeof value !== 'string' || value.trim().length > 0)

  return (
    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted/50 dark:hover:bg-muted">
      <div className="text-[11px] font-medium text-neutral-500 dark:text-muted-foreground">{label}</div>
      <div className="mt-0.5 min-h-[18px]">
        {hasValue ? (
          <div className="text-sm text-neutral-800 break-words whitespace-pre-wrap [overflow-wrap:anywhere] line-clamp-2 dark:text-foreground">
            {value}
          </div>
        ) : (
          <Placeholder text={placeholder} />
        )}
      </div>
    </div>
  )
}

export default function ProfilePersonalInfoCard({
  about,
  age,
  occupation,
  writingAbout,
  books,
  favoriteCategory,
  isShared,
  rightSlot,
}: Props) {
  const shared = Boolean(isShared)
  const placeholder = shared ? 'לא מולא' : 'הכותב בחר לא להציג'

  const aboutCapped = typeof about === 'string' ? about.slice(0, 90) : about
  const occupationCapped = typeof occupation === 'string' ? occupation.slice(0, 35) : occupation
  const writingAboutCapped = typeof writingAbout === 'string' ? writingAbout.slice(0, 35) : writingAbout
  const booksCapped = typeof books === 'string' ? books.slice(0, 80) : books

  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md dark:bg-card dark:border-border"
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold m-0">מידע אישי</h3>
        {rightSlot ? rightSlot : !shared ? (
          <span className="text-xs text-neutral-400 dark:text-muted-foreground/70">פרטי</span>
        ) : null}
      </div>

      <div className="space-y-2">
        <Row label="קצת עליי" value={aboutCapped ?? ''} placeholder={placeholder} />
        <div className="grid grid-cols-2 gap-2">
          <Row label="גיל" value={age ?? ''} placeholder={placeholder} />
          <Row label="עיסוק" value={occupationCapped ?? ''} placeholder={placeholder} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Row label="אוהב לכתוב על" value={writingAboutCapped ?? ''} placeholder={placeholder} />
          <Row label="קטגוריה מועדפת" value={favoriteCategory ?? ''} placeholder={placeholder} />
        </div>
        <Row label="ספרים שקראתי" value={booksCapped ?? ''} placeholder={placeholder} />
      </div>
    </div>
  )
}
