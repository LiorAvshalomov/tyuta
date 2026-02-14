import type { ReactNode } from "react";
import "@/styles/auth.css";
import FloatingStationery from "@/components/FloatingStationery";
import AnimatedIntro from "@/components/AnimatedIntro";

export default function AuthLayout({
  children,
  mode,
}: {
  children: ReactNode;
  mode: "login" | "signup" | "forgot" | "reset";
}) {
  // IMPORTANT:
  // The global SiteHeader sits above auth pages in normal flow.
  // If the auth shell keeps min-height: 100vh (from auth.css),
  // you'll get: header + 100vh => scroll ≈ header height.
  // So we size BOTH the shell and main area to (viewport - header).
  //
  // If your header height differs, adjust 72px (common values: 64/72/80).
  const headerH = 72;

  return (
    <div
      className="pd-auth-shell relative w-full overflow-hidden"
      dir="rtl"
      style={{
        height: `calc(100dvh - ${headerH}px)`,
        minHeight: `calc(100dvh - ${headerH}px)`,
      }}
    >
      <div className="pd-auth-noise" aria-hidden="true" />
      <FloatingStationery />

      <main className="relative z-10 mx-auto flex h-full max-w-6xl items-center justify-center px-4">
        <div className="w-full max-w-[980px]">
          <AnimatedIntro />

          {/* Desktop: form on RIGHT, copy on LEFT (RTL expectation).
              We flip placement safely using dir="ltr" only for grid placement. */}
          <div className="grid items-stretch gap-6 lg:grid-cols-2" dir="ltr">
            {/* Copy / vibe (LEFT on desktop) */}
            <section
              dir="rtl"
              className="pd-intro-stagger hidden lg:block rounded-3xl p-10"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-black/80 shadow-sm">
                <span aria-hidden>✍️</span>
                Tyuta
              </div>

              <h1 className="pd-auth-title mt-6 text-4xl font-extrabold leading-tight">
                {mode === "login"
                  ? "נעים לראות אותך שוב."
                  : mode === "signup"
                    ? "ברוכים הבאים."
                    : "כמעט שם."}
              </h1>

              <p className="pd-auth-subtitle mt-4 text-base leading-7">
                מקום שקט לכתיבה, פריקה וסיפורים. בלי רעש, בלי לחץ — רק אתה והמילים.
              </p>

              <ul className="mt-6 space-y-3 text-sm text-black/70">
                <li className="flex items-start gap-2">
                  <span aria-hidden>📓</span>
                  <span>המחברת שלך נשמרת ומחכה.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden>🖋️</span>
                  <span>כתיבה קצרה או ארוכה — הכול הולך.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden>🕊️</span>
                  <span>לפעמים שורה אחת מספיקה כדי להתחיל.</span>
                </li>
              </ul>
            </section>

            {/* Form card (RIGHT on desktop) */}
            <section dir="rtl" className="pd-auth-card pd-intro rounded-3xl p-6 sm:p-8">
              {children}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
