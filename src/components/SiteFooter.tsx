"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import FeedIntentLink from "@/components/FeedIntentLink"

const AUTH_ROUTES = ["/auth/login", "/auth/register", "/auth/signup", "/login", "/register"]

export default function SiteFooter() {
  const pathname = usePathname()
  if (pathname?.startsWith("/banned") || pathname?.startsWith("/restricted")) return null
  const isAuth = AUTH_ROUTES.some((p) => pathname.startsWith(p))
  if (isAuth) return null
  if (pathname.startsWith("/inbox")) return null

  return (
    <footer className="mt-16 tyuta-footer">
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">
        

        <div className="grid gap-5 md:grid-cols-3 md:items-center">
          {/* Right side (RTL start) */}
          <nav className="flex flex-wrap justify-center gap-4 md:justify-start">
            <Link className="tyuta-hover" href="/about">
              אודות
            </Link>
            <Link className="tyuta-hover" href="/terms">
              תנאי שימוש
            </Link>
            <Link className="tyuta-hover" href="/privacy">
              מדיניות פרטיות
            </Link>
            <Link className="tyuta-hover" href="/accessibility">
              נגישות
            </Link>
          </nav>

          {/* Center */}
          <div className="order-3 text-center text-xs text-muted-foreground/60 md:order-none md:text-sm">
            © 2026 .Tyuta. All rights reserved
          </div>

          {/* Left side */}
          <nav className="flex flex-wrap justify-center gap-4 md:justify-end">
            <FeedIntentLink className="tyuta-hover" href="/c/stories">
              סיפורים
            </FeedIntentLink>
            <FeedIntentLink className="tyuta-hover" href="/c/release">
              פריקה
            </FeedIntentLink>
            <FeedIntentLink className="tyuta-hover" href="/c/magazine">
              מגזין
            </FeedIntentLink>
            <Link className="tyuta-hover" href="/search">
              חיפוש
            </Link>
            <Link className="tyuta-hover" href="/contact">
              צור קשר
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
