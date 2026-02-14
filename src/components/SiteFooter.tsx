"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const AUTH_ROUTES = ["/auth/login", "/auth/register", "/auth/signup", "/login", "/register"]

export default function SiteFooter() {
  const pathname = usePathname()
  if (pathname?.startsWith("/banned") || pathname?.startsWith("/restricted")) return null
  const isAuth = AUTH_ROUTES.some((p) => pathname.startsWith(p))
  if (isAuth) return null
  if (pathname.startsWith("/inbox")) return null

  return (
    <footer className="mt-16 border-t bg-black/10 backdrop-blur supports-[backdrop-filter]:bg-black/5">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">
        <div className="grid gap-5 md:grid-cols-3 md:items-center">
          {/* Right side (RTL start) */}
          <nav className="flex flex-wrap justify-center gap-4 md:justify-start">
            <Link className="hover:text-foreground" href="/about">
              אודות
            </Link>
            <Link className="hover:text-foreground" href="/terms">
              תנאי שימוש
            </Link>
            <Link className="hover:text-foreground" href="/privacy">
              מדיניות פרטיות
            </Link>
          </nav>

          {/* Center */}
          <div className="order-3 text-center text-xs text-muted-foreground/80 md:order-none md:text-sm">
            © 2026 .Tyuta. All rights reserved
          </div>

          {/* Left side */}
          <nav className="flex flex-wrap justify-center gap-4 md:justify-end">
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
          </nav>
        </div>
      </div>
    </footer>
  )
}
