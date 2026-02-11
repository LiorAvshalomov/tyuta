import type { Metadata } from "next"
import { Geist, Geist_Mono, Heebo } from "next/font/google"
import "./globals.css"
import AuthSync from "@/components/auth/AuthSync"
import SuspensionSync from "@/components/moderation/SuspensionSync"
import ClientChrome from "@/components/ClientChrome"

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
  weight: ["400", "700"],
})

export const metadata: Metadata = {
  title: "PenDemic",
  description: "PenDemic",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${geistSans.variable} ${geistMono.variable} ${heebo.variable} antialiased bg-background text-foreground overflow-x-hidden`}>
        <AuthSync>
          <SuspensionSync>
            <ClientChrome>{children}</ClientChrome>
          </SuspensionSync>
        </AuthSync>
      </body>
    </html>
  )
}
