import type { ReactNode } from "react"

type LayoutProps = {
  children: ReactNode
  params: Promise<{ slug: string }>
}

// All SEO metadata (title, og:*, twitter:*, canonical, robots) is handled in page.tsx
// via generateMetadata + React cache — no duplicate DB query needed here.

export default function PostLayout({ children }: LayoutProps) {
  return <>{children}</>
}
