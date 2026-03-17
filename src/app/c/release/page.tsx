import HomePage from '@/app/page'
import type { Metadata } from "next";

export const revalidate = 60

export const metadata: Metadata = {
  title: "פריקה",
  description: "פריקה רגשית, וידויים ושירה — ערוץ הפריקה של Tyuta(טיוטה). מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
  alternates: {
    canonical: "/c/release",
  },
  openGraph: {
    title: "פריקה — Tyuta",
    description: "פריקה רגשית, וידויים ושירה — ערוץ הפריקה של Tyuta(טיוטה). מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
    url: "https://tyuta.net/c/release",
    siteName: "Tyuta",
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "פריקה — Tyuta",
    description: "פריקה רגשית, וידויים ושירה — ערוץ הפריקה של Tyuta(טיוטה). מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.",
  },
};

export default async function ReleasePage() {
  return (
    <HomePage
      forcedChannelSlug="release"
      forcedChannelName="פריקה"
      forcedSubtitle="הכי חם החודש בקטגוריה"
      forcedSubcategories={[
        { name_he: 'וידויים' },
        { name_he: 'מחשבות' },
        { name_he: 'שירים' }
      ]}
    />
  )
}
