'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import PageHeader from '@/components/admin/PageHeader'
import FilterTabs from '@/components/admin/FilterTabs'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import { Mail, CheckCircle2, RotateCcw, RefreshCw, Inbox } from 'lucide-react'

type MiniProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type ContactMessage = {
  id: string
  created_at: string
  user_id: string | null
  email: string | null
  subject: string | null
  message: string
  status: 'open' | 'resolved'
  attachment_paths: string[] | null
  user_profile: MiniProfile | null
}

function fmtName(p: MiniProfile | null | undefined, fallbackId?: string) {
  if (!p) return fallbackId ? fallbackId.slice(0, 8) : '—'
  return p.display_name || (p.username ? `@${p.username}` : p.id?.slice(0, 8) || '—')
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_OPTIONS: { value: 'open' | 'resolved'; label: string }[] = [
  { value: 'open', label: 'פתוחים' },
  { value: 'resolved', label: 'טופלו' },
]

export default function AdminContactPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [active, setActive] = useState<ContactMessage | null>(null)
  const [openingThread, setOpeningThread] = useState(false)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const r = await adminFetch(`/api/admin/contact?status=${status}&limit=200`)
      const j = await r.json()
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'Failed'))
      setMessages(j.messages ?? [])
      if (active) {
        const refreshed = (j.messages ?? []).find((m: ContactMessage) => m.id === active.id)
        setActive(refreshed ?? null)
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  async function setResolved(id: string, next: 'open' | 'resolved') {
    const r = await adminFetch('/api/admin/contact/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: next }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      alert(getAdminErrorMessage(j, 'שגיאה'))
      return
    }
    await load()
  }

  async function openInboxThread() {
    if (!active?.user_id) return
    setOpeningThread(true)
    try {
      const r = await adminFetch('/api/admin/inbox/thread', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: active.user_id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה בפתיחת שיחה'))
      const conversationId = String(j.conversation_id ?? '')
      router.push(`/admin/inbox${conversationId ? `?c=${encodeURIComponent(conversationId)}` : ''}`)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setOpeningThread(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div className="space-y-5">
      <PageHeader
        title="צור קשר"
        description="Inbox לפניות מהעמוד 'צור קשר'."
        actions={
          <div className="flex items-center gap-2">
            <FilterTabs value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            <button
              type="button"
              onClick={load}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-400 dark:hover:bg-muted/50"
              aria-label="רענון"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      {err && <ErrorBanner message={err} onRetry={load} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* List */}
        <div className="grid gap-2">
          {loading ? (
            <TableSkeleton rows={4} />
          ) : messages.length === 0 ? (
            <EmptyState
              title="אין פניות בסטטוס הזה"
              icon={<Mail size={36} strokeWidth={1.5} />}
            />
          ) : (
            messages.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(m)}
                className={
                  'w-full rounded-xl border bg-white p-4 text-right shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-md dark:bg-card ' +
                  (m.status === 'open'
                    ? 'border-neutral-200 border-r-[3px] border-r-[#c4923a] dark:border-neutral-700 dark:border-r-[#e0ad5a] '
                    : 'border-neutral-200 border-r-[3px] border-r-[#4a7c59] dark:border-neutral-700 dark:border-r-[#6dbb8a] ') +
                  (active?.id === m.id ? 'ring-1 ring-neutral-300 dark:ring-neutral-600' : '')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-neutral-400 dark:text-neutral-500">{fmtDateTime(m.created_at)}</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-foreground">
                      {m.subject || 'ללא נושא'}
                    </div>
                    <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-neutral-500 dark:text-neutral-400">
                      {m.message}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Avatar src={m.user_profile?.avatar_url} name={fmtName(m.user_profile, m.user_id ?? undefined)} size={28} />
                    <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      {fmtName(m.user_profile, m.user_id ?? undefined)}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-border dark:bg-card">
          {!active ? (
            <EmptyState
              title="בחר פנייה"
              description="לחץ על פנייה כדי לראות פירוט."
              icon={<Mail size={32} strokeWidth={1.5} />}
            />
          ) : (
            <div className="space-y-4">
              {/* Header section */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-neutral-900 dark:text-foreground">
                    {active.subject || 'ללא נושא'}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                    {fmtDateTime(active.created_at)}
                  </div>
                </div>
                <span
                  className={
                    'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ' +
                    (active.status === 'resolved'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400')
                  }
                >
                  {active.status === 'resolved' ? 'טופל' : 'פתוח'}
                </span>
              </div>

              {/* Sender info section */}
              <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-border dark:bg-muted/20">
                <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">פרטי שולח/ת</div>
                <div className="flex items-center gap-2.5">
                  <Avatar
                    src={active.user_profile?.avatar_url}
                    name={fmtName(active.user_profile, active.user_id ?? undefined)}
                    size={32}
                  />
                  <div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-foreground">
                      {fmtName(active.user_profile, active.user_id ?? undefined)}
                    </div>
                    {active.email && (
                      <div className="text-xs text-neutral-400 dark:text-neutral-500">{active.email}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Message section */}
              <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-border dark:bg-muted/20">
                <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">הודעה</div>
                <div className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-foreground">{active.message}</div>
              </div>

              {/* Attachment section */}
              {active.attachment_paths && active.attachment_paths.length > 0 && (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-border dark:bg-muted/20">
                  <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    תמונות מצורפות ({active.attachment_paths.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {active.attachment_paths.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50"
                        onClick={() => {
                          void (async () => {
                            const { adminFetch } = await import('@/lib/admin/adminFetch')
                            const r = await adminFetch(`/api/admin/contact/${active.id}/attachment?index=${i}`)
                            if (r.ok) {
                              const j = await r.json() as { url?: string }
                              if (j.url) window.open(j.url, '_blank', 'noopener,noreferrer')
                            }
                          })()
                        }}
                      >
                        תמונה {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions section */}
              <div className="flex flex-wrap gap-2">
                {active.status === 'open' ? (
                  <button
                    type="button"
                    onClick={() => setResolved(active.id, 'resolved')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                  >
                    <CheckCircle2 size={14} />
                    סמן כטופל
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setResolved(active.id, 'open')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50"
                  >
                    <RotateCcw size={14} />
                    החזר לפתוח
                  </button>
                )}

                {active.user_id && (
                  <button
                    type="button"
                    onClick={openInboxThread}
                    disabled={openingThread}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-neutral-300 dark:hover:bg-muted/50 disabled:opacity-50"
                  >
                    <Inbox size={14} />
                    {openingThread ? 'פותח…' : 'פתח שיחה באינבוקס'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
