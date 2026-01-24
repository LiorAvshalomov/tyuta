import Link from 'next/link'

type Props = {
  basePath: string
  query: Record<string, string | number | undefined | null>
  page: number
  pageSize: number
  total: number
  maxButtons?: number
}

function buildHref(basePath: string, query: Record<string, string | number | undefined | null>, page: number) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  sp.set('page', String(page))
  return `${basePath}?${sp.toString()}`
}

export default function Pagination({ basePath, query, page, pageSize, total, maxButtons = 7 }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)

  const half = Math.floor(maxButtons / 2)
  let start = Math.max(1, current - half)
  let end = Math.min(totalPages, start + maxButtons - 1)
  start = Math.max(1, end - maxButtons + 1)

  const pages: number[] = []
  for (let p = start; p <= end; p++) pages.push(p)

  if (totalPages <= 1) return null

  return (
    <nav className="mt-6 flex items-center justify-center gap-2" dir="rtl" aria-label="Pagination">
      <Link
        href={buildHref(basePath, query, Math.max(1, current - 1))}
        className={`rounded-full border px-3 py-1 text-sm ${current <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-neutral-50'}`}
      >
        הקודם
      </Link>

      {start > 1 ? (
        <>
          <Link href={buildHref(basePath, query, 1)} className="rounded-full border px-3 py-1 text-sm hover:bg-neutral-50">
            1
          </Link>
          {start > 2 ? <span className="px-1 text-sm text-muted-foreground">…</span> : null}
        </>
      ) : null}

      {pages.map((p) => (
        <Link
          key={p}
          href={buildHref(basePath, query, p)}
          className={`rounded-full border px-3 py-1 text-sm hover:bg-neutral-50 ${p === current ? 'bg-black text-white hover:bg-black' : ''}`}
        >
          {p}
        </Link>
      ))}

      {end < totalPages ? (
        <>
          {end < totalPages - 1 ? <span className="px-1 text-sm text-muted-foreground">…</span> : null}
          <Link
            href={buildHref(basePath, query, totalPages)}
            className="rounded-full border px-3 py-1 text-sm hover:bg-neutral-50"
          >
            {totalPages}
          </Link>
        </>
      ) : null}

      <Link
        href={buildHref(basePath, query, Math.min(totalPages, current + 1))}
        className={`rounded-full border px-3 py-1 text-sm ${current >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-neutral-50'}`}
      >
        הבא
      </Link>
    </nav>
  )
}
