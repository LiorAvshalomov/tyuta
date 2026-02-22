'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import {
  getStoredTheme,
  setStoredTheme,
  resolveTheme,
  applyTheme,
  type ThemePreference,
} from '@/lib/theme'

const LABELS: Record<ThemePreference, string> = {
  system: 'מערכת',
  dark: 'כהה',
  light: 'בהיר',
}

// Cycle order: system → dark → light → system
const CYCLE: Record<ThemePreference, ThemePreference> = {
  system: 'dark',
  dark: 'light',
  light: 'system',
}

function ThemeIcon({ pref }: { pref: ThemePreference }) {
  const cls = 'text-muted-foreground'
  if (pref === 'dark') return <Moon size={18} className={cls} />
  if (pref === 'light') return <Sun size={18} className={cls} />
  return <Monitor size={18} className={cls} />
}

export default function ThemeToggle() {
  // Initialise from localStorage after mount to avoid SSR/hydration mismatch.
  const [pref, setPref] = useState<ThemePreference>('system')

  useEffect(() => {
    setPref(getStoredTheme())
  }, [])

  function cycle() {
    const next = CYCLE[pref]
    setPref(next)
    setStoredTheme(next)
    applyTheme(resolveTheme(next))
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="w-full flex items-center justify-between gap-3 px-4 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border text-sm transition-all"
    >
      <span className="flex items-center gap-3">
        <ThemeIcon pref={pref} />
        <span>ערכת נושא</span>
      </span>
      <span className="text-xs text-muted-foreground">{LABELS[pref]}</span>
    </button>
  )
}
