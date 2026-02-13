"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const AUTH_ROUTES = ['/auth/login', '/auth/register', '/auth/signup', '/login', '/register']

export default function SiteFooter() {
  const pathname = usePathname()
  if (pathname?.startsWith('/banned') || pathname?.startsWith('/restricted')) return null
  const isAuth = AUTH_ROUTES.some((p) => pathname.startsWith(p))
  if (isAuth) return null
  if (pathname.startsWith('/inbox')) return null

  return (
    <footer className="mt-16 border-t bg-black/10 backdrop-blur supports-[backdrop-filter]:bg-black/5">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">PenDemic</span>
          <span aria-hidden>•</span>
          <span>מקום לכתיבה ולפריקה</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link className="hover:text-foreground" href="/c/stories">
            סיפורים
          </Link>
          <Link className="hover:text-foreground" href="/c/release">
            פריקה
          </Link>
          <Link className="hover:text-foreground" href="/c/magazine">
            מגזין
          </Link>
          <Link className="hover:text-foreground" href="/search">
            חיפוש
          </Link>
          <Link className="hover:text-foreground" href="/contact">
            צור קשר
          </Link>
        </div>
      </div>
    </footer>
  )
}