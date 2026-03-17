import HomePage from '@/app/page'
import type { Metadata } from "next";

export const revalidate = 60

export const metadata: Metadata = {
  title: "כתבות",
  description: "כתבות, דעות ותרבות מהקהילה הישראלית — ערוץ המגזין של Tyuta(טיוטה). מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
  alternates: {
    canonical: "/c/magazine",
  },
  openGraph: {
    title: "כתבות — Tyuta",
    description: "כתבות, דעות ותרבות מהקהילה הישראלית — ערוץ המגזין של Tyuta(טיוטה). מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
    url: "https://tyuta.net/c/magazine",
    siteName: "Tyuta",
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "כתבות — Tyuta",
    description: "כתבות, דעות ותרבות מהקהילה הישראלית — ערוץ המגזין של Tyuta(טיוטה). מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
  },
};

export default async function MagazinePage() {
  return (
    <HomePage
      forcedChannelSlug="magazine"
      forcedChannelName="כתבות"
      forcedSubtitle="הכי חם החודש בקטגוריה"
      forcedSubcategories={[
        { name_he: 'חדשות' },
        { name_he: 'עולם הכתיבה' },
        { name_he: 'תרבות ובידור' },
        { name_he: 'טכנולוגיה' },
        { name_he: 'ספורט' },
        { name_he: 'דעות' }
      ]}
    />
  )
}
