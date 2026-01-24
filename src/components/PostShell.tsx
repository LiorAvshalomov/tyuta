import React from "react"

type Props = {
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
}

export default function PostShell({ title, meta, children }: Props) {
  return (
    <main className="min-h-screen bg-neutral-50" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <article className="rounded-3xl bg-white shadow-sm ring-1 ring-black/5 p-6 sm:p-10">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-right">
              {title}
            </h1>
            {meta ? <div className="mt-3 text-sm text-muted-foreground text-right">{meta}</div> : null}
          </header>

          <section className="text-right">{children}</section>
        </article>
      </div>
    </main>
  )
}
