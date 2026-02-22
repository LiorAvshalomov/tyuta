'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { event as gaEvent } from '@/lib/gtag'
import ProfilePersonalInfoCard from '@/components/ProfilePersonalInfoCard'

type PersonalInfo = {
  personal_is_shared: boolean
  personal_about: string | null
  personal_age: number | null
  personal_occupation: string | null
  personal_writing_about: string | null
  personal_books: string | null
  personal_favorite_category: string | null
}

const LIMITS = {
  about: 90,
  occupation: 35,
  writingAbout: 35,
  books: 80,
  favoriteCategory: 10,
}

function clampStr(v: string, max: number) {
  const s = (v ?? '').toString()
  return s.length > max ? s.slice(0, max) : s
}

function InputShell({
  label,
  hint,
  children,
  counter,
}: {
  label: string
  hint?: string
  counter?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-800 dark:text-foreground">{label}</div>
          {hint ? <div className="text-[11px] text-neutral-500 dark:text-muted-foreground">{hint}</div> : null}
        </div>
        {counter ? <div className="text-[11px] text-neutral-400 dark:text-muted-foreground/70 shrink-0">{counter}</div> : null}
      </div>
      {children}
    </div>
  )
}

export default function ProfilePersonalInfoCardClient({
  profileId,
  initial,
  onHeightChange,
}: {
  profileId: string
  initial: PersonalInfo
  onHeightChange?: (height: number) => void
}) {
  const [isOwner, setIsOwner] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const [info, setInfo] = useState<PersonalInfo>(initial)

  const [isShared, setIsShared] = useState<boolean>(initial.personal_is_shared)
  const [about, setAbout] = useState<string>(initial.personal_about ?? '')
  const [age, setAge] = useState<string>(initial.personal_age?.toString() ?? '')
  const [occupation, setOccupation] = useState<string>(initial.personal_occupation ?? '')
  const [writingAbout, setWritingAbout] = useState<string>(initial.personal_writing_about ?? '')
  const [books, setBooks] = useState<string>(initial.personal_books ?? '')
  const [favoriteCategory, setFavoriteCategory] = useState<string>(initial.personal_favorite_category ?? '')

  const favoriteCategoryOptions = useMemo(
    () => [
      { value: '', label: 'בחר' },
      { value: 'פריקה', label: 'פריקה' },
      { value: 'סיפורים', label: 'סיפורים' },
      { value: 'מגזין', label: 'מגזין' },
    ],
    []
  )

  useEffect(() => {
    let mounted = true
    const run = async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data?.user?.id
      if (!mounted) return
      setIsOwner(Boolean(uid && uid === profileId))
    }
    run()
    return () => { mounted = false }
  }, [profileId])

  // Report height changes
  useEffect(() => {
    if (cardRef.current && onHeightChange) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          onHeightChange(entry.contentRect.height + 32) // Add padding
        }
      })
      observer.observe(cardRef.current)
      return () => observer.disconnect()
    }
  }, [onHeightChange])

  const cardRight = useMemo(() => {
    if (isOwner) {
      return (
        <button
          type="button"
          onClick={() => {
            setIsShared(info.personal_is_shared)
            setAbout(info.personal_about ?? '')
            setAge(info.personal_age?.toString() ?? '')
            setOccupation(info.personal_occupation ?? '')
            setWritingAbout(info.personal_writing_about ?? '')
            setBooks(info.personal_books ?? '')
            setFavoriteCategory(info.personal_favorite_category ?? '')
            setError(null)
            setOpen(true)
          }}
          className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700 hover:underline"
        >
          עריכה
        </button>
      )
    }
    return !info.personal_is_shared ? (
      <span className="text-xs text-neutral-400">פרטי</span>
    ) : null
  }, [info, isOwner])

  const save = async () => {
    setSaving(true)
    setError(null)

    const payload = {
      personal_is_shared: Boolean(isShared),
      personal_about: about.trim() ? clampStr(about.trim(), LIMITS.about) : null,
      personal_age: age.trim() ? Number(age) : null,
      personal_occupation: occupation.trim() ? clampStr(occupation.trim(), LIMITS.occupation) : null,
      personal_writing_about: writingAbout.trim() ? clampStr(writingAbout.trim(), LIMITS.writingAbout) : null,
      personal_books: books.trim() ? clampStr(books.trim(), LIMITS.books) : null,
      personal_favorite_category: favoriteCategory.trim() ? clampStr(favoriteCategory.trim(), LIMITS.favoriteCategory) : null,
      personal_updated_at: new Date().toISOString(),
    }

    if (payload.personal_age !== null) {
      if (Number.isNaN(payload.personal_age) || payload.personal_age < 0 || payload.personal_age > 150) {
        setSaving(false)
        setError('גיל חייב להיות מספר בין 0 ל-150')
        return
      }
    }

    const { error: upErr } = await supabase.from('profiles').update(payload).eq('id', profileId)

    if (upErr) {
      setSaving(false)
      setError(upErr.message)
      return
    }

    gaEvent('profile_updated')

    setInfo(prev => ({
      ...prev,
      personal_is_shared: payload.personal_is_shared,
      personal_about: payload.personal_about,
      personal_age: payload.personal_age,
      personal_occupation: payload.personal_occupation,
      personal_writing_about: payload.personal_writing_about,
      personal_books: payload.personal_books,
      personal_favorite_category: payload.personal_favorite_category,
    }))

    setSaving(false)
    setOpen(false)
  }

  return (
    <>
      <div ref={cardRef}>
        <ProfilePersonalInfoCard
          isShared={info.personal_is_shared}
          about={info.personal_about}
          age={info.personal_age}
          occupation={info.personal_occupation}
          writingAbout={info.personal_writing_about}
          books={info.personal_books}
          favoriteCategory={info.personal_favorite_category}
          rightSlot={cardRight}
        />
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center sm:items-center justify-center pt-14" dir="rtl">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !saving && setOpen(false)}
          />

          {/* Modal Content - mobile: bottom sheet, desktop: centered */}
          <div className="relative z-10 flex max-h-[85vh] sm:max-h-[90vh] w-full sm:max-w-md flex-col rounded-t-2xl sm:rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:bg-card dark:border-border">
            {/* Header - Fixed */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 p-4 dark:border-border">
              <h3 className="text-base font-bold text-neutral-900 dark:text-foreground">עריכת מידע אישי</h3>
              <button
                type="button"
                className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
                onClick={() => !saving && setOpen(false)}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4">
              {/* Share toggle */}
              <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-3 mb-4 dark:border-border dark:bg-muted/50">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-800 dark:text-foreground">שיתוף מידע</div>
                  <div className="text-[11px] text-neutral-500 dark:text-muted-foreground">אם כבוי — יוצג &quot;לא להציג&quot;</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsShared(v => !v)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${isShared
                    ? 'bg-neutral-900 text-white dark:bg-foreground dark:text-background'
                    : 'border border-neutral-300 bg-white text-neutral-600 dark:border-border dark:bg-muted dark:text-muted-foreground'
                    }`}
                >
                  {isShared ? 'משותף' : 'פרטי'}
                </button>
              </div>

              {/* Form fields */}
              <div className="space-y-3">
                <InputShell label="קצת עליי" hint="עד 90 תווים" counter={`${about.length}/${LIMITS.about}`}>
                  <textarea
                    className="w-full rounded-lg border border-neutral-200 p-2.5 text-sm leading-relaxed transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 bg-background text-foreground placeholder:text-muted-foreground dark:border-border"
                    rows={2}
                    maxLength={LIMITS.about}
                    value={about}
                    onChange={e => setAbout(e.target.value)}
                    placeholder="כתוב קצת על עצמך…"
                  />
                </InputShell>

                <div className="grid grid-cols-2 gap-3">
                  <InputShell label="גיל">
                    <input
                      className="w-full rounded-lg border border-neutral-200 p-2.5 text-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 bg-background text-foreground placeholder:text-muted-foreground dark:border-border"
                      inputMode="numeric"
                      value={age}
                      onChange={e => setAge(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="24"
                    />
                  </InputShell>

                  <InputShell label="עיסוק" counter={`${occupation.length}/${LIMITS.occupation}`}>
                    <input
                      className="w-full rounded-lg border border-neutral-200 p-2.5 text-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 bg-background text-foreground placeholder:text-muted-foreground dark:border-border"
                      maxLength={LIMITS.occupation}
                      value={occupation}
                      onChange={e => setOccupation(e.target.value)}
                      placeholder="סטודנט"
                    />
                  </InputShell>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InputShell label="כותב על" counter={`${writingAbout.length}/${LIMITS.writingAbout}`}>
                    <input
                      className="w-full rounded-lg border border-neutral-200 p-2.5 text-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 bg-background text-foreground placeholder:text-muted-foreground dark:border-border"
                      maxLength={LIMITS.writingAbout}
                      value={writingAbout}
                      onChange={e => setWritingAbout(e.target.value)}
                      placeholder="אהבה, חרדות…"
                    />
                  </InputShell>

                  <InputShell label="קטגוריה">
                    <select
                      className="w-full rounded-lg border border-neutral-200 bg-white p-2.5 text-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 dark:bg-card dark:border-border dark:text-foreground"
                      value={favoriteCategory}
                      onChange={e => setFavoriteCategory(e.target.value)}
                    >
                      {favoriteCategoryOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </InputShell>
                </div>

                <InputShell label="ספרים" hint="עד 80 תווים" counter={`${books.length}/${LIMITS.books}`}>
                  <textarea
                    className="w-full rounded-lg border border-neutral-200 p-2.5 text-sm leading-relaxed transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 bg-background text-foreground placeholder:text-muted-foreground dark:border-border"
                    rows={2}
                    maxLength={LIMITS.books}
                    value={books}
                    onChange={e => setBooks(e.target.value)}
                    placeholder="שמות ספרים / סופרים…"
                  />
                </InputShell>
              </div>

              {error && (
                <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>
              )}
            </div>

            {/* Footer - Fixed */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 p-4 dark:border-border">
              <button
                type="button"
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                ביטול
              </button>
              <button
                type="button"
                className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
                disabled={saving}
                onClick={save}
              >
                {saving ? 'שומר…' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
