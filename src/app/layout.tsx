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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    default: "Tyuta - המקום לכל הגרסאות שלך",
    template: "%s | Tyuta",
  },
  description: "Tyuta(טיוטה): המקום לכל הגרסאות שלך. מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Tyuta",
    title: "Tyuta - המקום לכל הגרסאות שלך",
    description: "Tyuta(טיוטה): המקום לכל הגרסאות שלך. מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
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
    title: "Tyuta - המקום לכל הגרסאות שלך",
    description: "Tyuta(טיוטה): המקום לכל הגרסאות שלך. מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
    images: ["/web-app-manifest-512x512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
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
    name: "Tyuta",
    url: SITE_URL,
    logo: `${SITE_URL}/apple-touch-icon.png`,
  }

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tyuta",
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
        {/* Theme init — runs synchronously before first paint to prevent flash of wrong theme.
            Reads 'tyuta:theme' from localStorage ('light'|'dark'|'system').
            Falls back to prefers-color-scheme, then light. No external deps. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('tyuta:theme');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
        {process.env.NODE_ENV === "production" && (
          <>
            {/* GA ID stored in a meta tag so the external ga.js can read it without inline JS */}
            <meta name="ga-id" content={process.env.NEXT_PUBLIC_GA_ID} />
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
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
