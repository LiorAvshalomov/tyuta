import React from 'react'

type Props = {
  header?: React.ReactNode
  actions?: React.ReactNode
  sidebar?: React.ReactNode
  /** תוכן הפוסט עצמו (לב האתר) */
  children: React.ReactNode
  /** בלוקים מתחת לתוכן (תגובות/תחושות וכו') – לא בתוך כרטיס התוכן */
  below?: React.ReactNode
}

/**
 * עוטף לעמוד פוסט: תוכן מימין + סיידבר משמאל (בדסקטופ), RTL-first.
 * שומר על קריאות גבוהה (מדד קריאה) ועל הרבה "אוויר".
 */
export default function PostShell({ header, actions, sidebar, children, below }: Props) {
  return (
    <main className="min-h-screen bg-transparent font-sans text-neutral-900 dark:text-foreground" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {/*
          חשוב: בדסקטופ אנחנו רוצים שהטקסט (המאמר) יהיה בצד ימין והסיידבר בצד שמאל.
          עם RTL + flex זה קל להתבלבל, לכן אנחנו משתמשים ב-grid וקובעים עמודות מפורשות.
        */}
        {/*
          חשוב: כדי שהסיידבר יהיה משמאל בדסקטופ גם כשהעמוד RTL,
          אנחנו שמים dir="ltr" רק על ה-grid (הטקסט בפנים נשאר RTL).
        */}
        <div dir="ltr" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* סיידבר – משמאל (בדסקטופ) */}
          {sidebar ? (
            <aside className="order-last w-full lg:order-none lg:col-start-1 lg:row-start-1 lg:w-[360px] lg:shrink-0">
              {/* Sticky רגיל (בלי גלילה פנימית) */}
              {/* NOTE: Avoid backdrop-filter/blur on the post page to keep scroll 120/144Hz-snappy. */}
              <div className="rounded-2xl bg-neutral-100 dark:bg-card border-r border-neutral-200/70 dark:border-border p-2 lg:sticky lg:top-14" dir="rtl">
                {sidebar}
              </div>
            </aside>
          ) : null}

          {/* תוכן – מימין */}
          <article className="order-first min-w-0 rounded-3xl border border-neutral-200 dark:border-border bg-white dark:bg-card shadow-sm lg:order-none lg:col-start-2 lg:row-start-1" dir="rtl">
            {(header || actions) ? (
              <header className="rounded-t-3xl bg-neutral-100 dark:bg-muted px-6 py-6 sm:px-10 border-b border-neutral-200 dark:border-border">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 text-right">{header}</div>
                  {actions ? <div className="shrink-0">{actions}</div> : null}
                </div>
              </header>
            ) : null}

            <section className="px-6 pb-7 pt-4 text-right sm:px-10 sm:pb-10">
              {children}
            </section>
          </article>

          {/* בלוקים מתחת לתוכן (באותו רוחב/עמודה של התוכן) */}
          {below ? (
            <div className="order-2 min-w-0 lg:order-none lg:col-start-2 lg:row-start-2" dir="rtl">
              {below}
            </div>
          ) : null}
        </div>
        
      </div>
    </main>
  )
}
