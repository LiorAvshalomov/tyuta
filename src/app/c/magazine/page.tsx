import HomePage from '@/app/page'
import type { Metadata } from "next";

export const revalidate = 60

export const metadata: Metadata = {
  title: "כתבות",
  description: "עמוד מסונן לפי כתבות, הכי חם החודש בקטגוריית 'כתבות'",
  alternates: {
    canonical: "/c/magazine",
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
        { name_he: 'תרבות ובידור' },
        { name_he: 'טכנולוגיה' },
        { name_he: 'ספורט' },
        { name_he: 'דעות' }
      ]}
    />
  )
}
