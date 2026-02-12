export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // "Clean" auth pages:
  // - No Footer (handled by SiteFooter route detection)
  // - Header Row2 hidden (handled by SiteHeader route detection)
  // - No outer scroll: constrain to the available main height and allow inner scrolling.
  return <div className="h-full overflow-hidden">{children}</div>
}
