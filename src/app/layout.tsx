import type { Metadata } from "next"
import Script from "next/script"
import { Suspense } from "react"
import { Geist, Geist_Mono, Heebo } from "next/font/google"
import "./globals.css"
import AuthSync from "@/components/auth/AuthSync"
import SuspensionSync from "@/components/moderation/SuspensionSync"
import ClientChrome from "@/components/ClientChrome"
import PageTracker from "@/components/analytics/PageTracker"
import ToastProvider from "@/components/Toast"
import VisualViewportSync from "@/components/VisualViewportSync"
import ThemeSync from "@/components/ThemeSync"

const SITE_URL = "https://tyuta.net"
const SITE_NAME = "Tyuta"
const SITE_NAME_HE = "טיוטה"
const SITE_TITLE = "טיוטה - המקום לכל הגרסאות שלך"
const SITE_DESCRIPTION =
  "טיוטה (Tyuta) היא בית לכותבים בישראל וקהילת כתיבה עברית: מקום לכתוב, לשתף ולקרוא סיפורים, שירים, פריקה ומחשבות, מהטיוטה הראשונה ועד הפרסום."
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? ""

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
})

const heebo = Heebo({
  variable: "--font-editor-hebrew", 
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap"
})



export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Tyuta",
  },
  description: SITE_DESCRIPTION,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "he_IL",
    images: [
      {
        url: "/web-app-manifest-512x512.png",
        width: 512,
        height: 512,
        alt: "Tyuta",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/web-app-manifest-512x512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-icon-152x152.png", sizes: "152x152", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
}

function safeJsonLdStringify(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(data) }}
    />
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: SITE_NAME_HE,
    url: SITE_URL,
    logo: `${SITE_URL}/apple-touch-icon.png`,
  }

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_NAME_HE,
    inLanguage: "he-IL",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  }

  return (
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <head>
        {/* Preconnect to external image hosts used for fallback avatars */}
        <link rel="preconnect" href="https://api.dicebear.com" />
        <link rel="dns-prefetch" href="https://api.dicebear.com" />
        {/* Theme init — render-blocking to prevent flash of wrong theme before first paint.
            External file (cached by CDN) keeps our first-party inline-script footprint at zero.
            Note: Next.js App Router RSC streaming still injects its own inline scripts,
            so 'unsafe-inline' remains in CSP regardless. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/js/theme-init.js" />
        {process.env.NODE_ENV === "production" && GA_MEASUREMENT_ID && (
          <>
            {/* GA ID stored in a meta tag so the external ga.js can read it without inline JS */}
            <meta name="ga-id" content={GA_MEASUREMENT_ID} />
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script src="/js/ga.js" strategy="afterInteractive" />
          </>
        )}
      </head>
      <body className={`${heebo.variable} ${geistSans.variable} ${geistMono.variable}  antialiased bg-background text-foreground overflow-x-hidden`}>
        <JsonLd data={organizationSchema} />
        <JsonLd data={websiteSchema} />
        <ToastProvider>
          <VisualViewportSync />
          <ThemeSync />
          <AuthSync>
            <SuspensionSync>
              <ClientChrome>{children}</ClientChrome>
            </SuspensionSync>
          </AuthSync>
          <Suspense fallback={null}><PageTracker /></Suspense>
        </ToastProvider>
      </body>
    </html>
  )
}
