import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10" dir="rtl">
      <h1 className="text-2xl font-bold">המשתמש לא נמצא</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        ייתכן שהשם שגוי או שהפרופיל נמחק.
      </p>

      <Link
        href="/"
        className="mt-6 inline-block rounded-xl border bg-white px-4 py-2 hover:bg-neutral-50"
      >
        חזרה לבית
      </Link>
    </div>
  )
}
