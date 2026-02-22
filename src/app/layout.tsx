import type { Metadata } from "next"
import Script from "next/script"
import { Suspense } from "react"
import { Geist, Geist_Mono, Heebo } from "next/font/google"
import "./globals.css"
import AuthSync from "@/components/auth/AuthSync"
import SuspensionSync from "@/components/moderation/SuspensionSync"
import ClientChrome from "@/components/ClientChrome"
import PageTracker from "@/components/analytics/PageTracker"
import { SpeedInsights } from "@vercel/speed-insights/next"
import ToastProvider from "@/components/Toast"

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
  description: "המקום לכל הגרסאות שלך — פלטפורמת כתיבה ישראלית, מרחב כתיבה רגיש ובטוח.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Tyuta",
    title: "Tyuta - המקום לכל הגרסאות שלך",
    description: "המקום לכל הגרסאות שלך — פלטפורמת כתיבה ישראלית, מרחב כתיבה רגיש ובטוח.",
    locale: "he_IL",
    images: [
      {
        url: "/apple-touch-icon.png",
        width: 180,
        height: 180,
        alt: "Tyuta",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tyuta - המקום לכל הגרסאות שלך",
    description: "המקום לכל הגרסאות שלך — פלטפורמת כתיבה ישראלית, מרחב כתיבה רגיש ובטוח.",
    images: ["/apple-touch-icon.png"],
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
      // eslint-disable-next-line react/no-danger
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
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
      </head>
      <body className={`${heebo.variable} ${geistSans.variable} ${geistMono.variable}  antialiased bg-background text-foreground overflow-x-hidden`}>
        <JsonLd data={organizationSchema} />
        <JsonLd data={websiteSchema} />
        <ToastProvider>
          <AuthSync>
            <SuspensionSync>
              <ClientChrome>{children}</ClientChrome>
            </SuspensionSync>
          </AuthSync>
          <Suspense fallback={null}><PageTracker /></Suspense>
          <SpeedInsights />
        </ToastProvider>
      </body>
    </html>
  )
}
