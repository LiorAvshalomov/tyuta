import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RESET_COOKIE = "tyuta_reset_required";

function isBypassPath(pathname: string): boolean {
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return true;
  }

  // Allow auth pages so users can complete reset or request a new link
  if (pathname.startsWith("/auth/")) return true;

  return false;
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (isBypassPath(pathname)) {
    return NextResponse.next();
  }

  // Hard gate: if cookie exists, force user to reset password before browsing the app.
  const resetRequired = req.cookies.get(RESET_COOKIE)?.value === "1";
  if (resetRequired && pathname !== "/auth/reset-password") {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/reset-password";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If we can detect a password-recovery flow in QUERY (PKCE), force reset.
  // NOTE: hash fragments (#access_token) are not visible to middleware.
  // IMPORTANT: Only redirect for recovery/invite types — NOT signup or magiclink.
  const flowType = searchParams.get("type");
  const isRecoveryFlow = flowType === "recovery" || flowType === "invite";

  if (isRecoveryFlow && pathname !== "/auth/reset-password") {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/reset-password";
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)"],
};
