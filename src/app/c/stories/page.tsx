import HomePage from '@/app/page'
import type { Metadata } from "next";

export const revalidate = 60

export const metadata: Metadata = {
  title: "סיפורים",
  description: "סיפורים מהקהילה — קצרים, אמיתיים ובהמשכים. Tyuta(טיוטה): מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
  alternates: {
    canonical: "/c/stories",
  },
  openGraph: {
    title: "סיפורים — Tyuta",
    description: "סיפורים מהקהילה — קצרים, אמיתיים ובהמשכים. Tyuta(טיוטה): מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
    url: "https://tyuta.net/c/stories",
    siteName: "Tyuta",
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "סיפורים — Tyuta",
    description: "סיפורים מהקהילה — קצרים, אמיתיים ובהמשכים. Tyuta(טיוטה): מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
  },
};

export default async function StoriesPage() {
  return (
    <HomePage
      forcedChannelSlug="stories"
      forcedChannelName="סיפורים"
      forcedSubtitle="הכי חם החודש בקטגוריה"
      forcedSubcategories={[
        { name_he: 'סיפורים אמיתיים' },
        { name_he: 'סיפורים קצרים' },
        { name_he: 'סיפור בהמשכים' },
      ]}
    />
  )
}
