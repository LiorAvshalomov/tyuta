import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center" dir="rtl">
      <h1 className="text-6xl font-bold text-neutral-300">404</h1>
      <p className="mt-4 text-lg text-neutral-600">העמוד לא נמצא</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        חזרה לדף הבית
      </Link>
    </main>
  )
}
