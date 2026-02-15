import HomePage from '@/app/page'
import type { Metadata } from "next";

export const revalidate = 60

export const metadata: Metadata = {
  title: "פריקה",
  description: "עמוד מסונן לפי פריקה, הכי חם החודש בקטגוריית 'פריקה'",
  alternates: {
    canonical: "/c/release",
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
