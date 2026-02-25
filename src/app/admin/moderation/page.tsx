'use client'

import { useState } from 'react'
import PageHeader from '@/components/admin/PageHeader'
import FilterTabs from '@/components/admin/FilterTabs'
import ModerationHistoryTab from '@/components/admin/ModerationHistoryTab'
import ModerationStatsTab from '@/components/admin/ModerationStatsTab'

type Tab = 'history' | 'stats'

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'history', label: 'היסטוריה' },
  { value: 'stats',   label: 'סטטיסטיקת משתמש' },
]

export default function AdminModerationPage() {
  const [tab, setTab] = useState<Tab>('history')

  return (
    <div className="space-y-5">
      <PageHeader
        title="מודרציה"
        description="לוג מחיקות תגובות והערות קהילה ע״י אדמינים ומודרטורים."
      />

      <FilterTabs value={tab} onChange={setTab} options={TAB_OPTIONS} />

      {tab === 'history' ? <ModerationHistoryTab /> : <ModerationStatsTab />}
    </div>
  )
}
