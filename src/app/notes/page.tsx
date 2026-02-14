import CommunityNotesWall from '@/components/CommunityNotesWall'
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "פתקים",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4" dir="rtl">
      <CommunityNotesWall />
    </div>
  )
}
