'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled error:', error)
  }, [error])

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center" dir="rtl">
      <h1 className="text-2xl font-bold text-neutral-900">משהו השתבש</h1>
      <p className="mt-2 text-sm text-neutral-500">קרתה שגיאה לא צפויה. נסה לרענן את הדף.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        נסה שוב
      </button>
    </main>
  )
}
