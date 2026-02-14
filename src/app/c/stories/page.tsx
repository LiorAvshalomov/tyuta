import HomePage from '@/app/page'
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "סיפורים",
  description: "עמוד מסונן לפי סיפורים, הכי חם החודש בקטגוריית 'סיפורים'",
  alternates: {
    canonical: "/c/stories",
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
