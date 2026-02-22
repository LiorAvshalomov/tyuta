import React from 'react'

export type ProfileReactionTotal = {
  reaction_key: string
  label_he: string | null
  total_votes: number
  sort_order?: number | null
}

type Props = {
  /** Legacy stats (still used elsewhere on the page) */
  postsCount: number
  commentsWritten: number
  commentsReceived: number

  /** Legacy placeholder (kept for backwards compatibility) */
  medals?: { gold: number; silver: number; bronze: number }

  /** New: totals of reactions received across all posts of the profile */
  reactionTotals?: ProfileReactionTotal[]
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-neutral-50 px-3 py-3 dark:bg-muted dark:border-border">
      <div className="text-xs text-muted-foreground truncate">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}

export default function ProfileStatsCard({
  postsCount,
  commentsWritten,
  commentsReceived,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  medals,
  reactionTotals,
}: Props) {
  // IMPORTANT:
  // We consider reactions "available" if the server returned an array (even if all totals are 0),
  // because you want to show all reactions with 0 too.
  const reactionsAvailable = Array.isArray(reactionTotals)

  const items: ProfileReactionTotal[] = reactionsAvailable ? [...(reactionTotals ?? [])] : []

  // sort: prefer sort_order when present; fallback to label/name
  items.sort((a, b) => {
    const ao = typeof a.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER
    const bo = typeof b.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo

    const al = (a.label_he?.trim() || a.reaction_key).toLowerCase()
    const bl = (b.label_he?.trim() || b.reaction_key).toLowerCase()
    return al.localeCompare(bl)
  })

  return (
    <div className="rounded-2xl border bg-white p-4 h-[320px] flex flex-col dark:bg-card dark:border-border" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold m-0">נתונים</h3>
      </div>

      {reactionsAvailable ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          {items.map(r => (
            <Tile
              key={r.reaction_key}
              label={r.label_he?.trim() || r.reaction_key}
              value={Number(r.total_votes ?? 0)}
            />
          ))}
        </div>
      ) : (
        // Fallback: only if reactionTotals was not returned at all
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Tile label="פוסטים" value={postsCount} />
          <Tile label="תגובות שכתב" value={commentsWritten} />
          <Tile label="תגובות שקיבל" value={commentsReceived} />
        </div>
      )}
    </div>
  )
}
