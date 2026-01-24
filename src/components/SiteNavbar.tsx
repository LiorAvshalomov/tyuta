import Link from 'next/link'

export default function SiteNavbar() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3" dir="rtl">
        {/* ימין: לוגו + סלוגן */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-xl font-black tracking-tight">
            PenDemic
          </Link>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            המקום שלך לכתוב
          </span>
        </div>

        {/* שמאל: חיפוש */}
        <div className="ms-auto flex items-center gap-2">
          <div className="relative">
            <input
              type="search"
              placeholder="חפש..."
              className="w-56 rounded-full border bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
        </div>
      </div>
    </header>
  )
}
