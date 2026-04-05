import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import PageHeader from '@/components/admin/PageHeader'
import UserModerationHistoryTab from '@/components/admin/UserModerationHistoryTab'

export default function AdminUsersHistoryPage() {
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/users"
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-foreground"
        >
          <ArrowRight size={14} />
          משתמשים
        </Link>
        <span className="text-neutral-300 dark:text-neutral-600">/</span>
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">היסטוריה</span>
      </div>

      <PageHeader
        title="היסטוריית משתמשים"
        description="לוג קבוע של פעולות אדמין על משתמשים, כולל אנונימיזציה ומחיקה מלאה."
      />

      <UserModerationHistoryTab />
    </div>
  )
}
