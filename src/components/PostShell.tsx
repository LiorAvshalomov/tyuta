import React from 'react'

type Props = {
  header?: React.ReactNode
  actions?: React.ReactNode
  sidebar?: React.ReactNode
  children: React.ReactNode
}

/**
 * עוטף לעמוד פוסט: תוכן מימין + סיידבר משמאל (בדסקטופ), RTL-first.
 * שומר על קריאות גבוהה (מדד קריאה) ועל הרבה "אוויר".
 *
 * חשוב: את מרכז הכותרת/הקדמה אנחנו לא "שוברים" עם האקשנס (3 נקודות),
 * לכן האקשנס ממוקם אבסולוטית וה־header מקבל רוחב מלא.
 */
export default function PostShell({ header, actions, sidebar, children }: Props) {
  return (
    <main className="min-h-screen bg-neutral-50" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {/*
          ב-RTL, flex-row מציב את הפריט הראשון בצד ימין.
          לכן: article (ראשון) יהיה מימין, sidebar (שני) יהיה משמאל.
        */}
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* תוכן */}
          <article className="min-w-0 flex-1 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
            {(header || actions) ? (
              <header className="relative">
                {actions ? (
                  <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
                    {actions}
                  </div>
                ) : null}

                {/* header מביא בעצמו padding / background לפי העיצוב של העמוד */}
                <div className="text-right">{header}</div>
              </header>
            ) : null}

            <section className="px-6 pb-7 pt-2 text-right sm:px-10 sm:pb-10">
              <div className="max-w-[72ch]">{children}</div>
            </section>
          </article>

          {/* סיידבר – סטטי (ללא sticky) */}
          {sidebar ? (
            <aside className="w-full lg:w-[360px] lg:shrink-0">
              {sidebar}
            </aside>
          ) : null}
        </div>
      </div>
    </main>
  )
}
