'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// ── Types ────────────────────────────────────────────────────────

type ToastVariant = 'error' | 'success' | 'info'

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
  duration: number
}

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void
}

// ── Context ──────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// ── Single toast bubble ──────────────────────────────────────────

function ToastBubble({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: (id: number) => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setVisible(false)
      window.setTimeout(() => onDismiss(item.id), 200)
    }, item.duration)
    return () => window.clearTimeout(t)
  }, [item.id, item.duration, onDismiss])

  const bg =
    item.variant === 'error'
      ? 'bg-red-600'
      : item.variant === 'success'
        ? 'bg-emerald-600'
        : 'bg-neutral-800'

  return (
    <div
      role="alert"
      dir="rtl"
      className={[
        'pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-200',
        bg,
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <span className="flex-1 leading-relaxed whitespace-pre-line">{item.message}</span>
        <button
          type="button"
          onClick={() => {
            setVisible(false)
            setTimeout(() => onDismiss(item.id), 200)
          }}
          className="mt-0.5 shrink-0 text-white/60 hover:text-white"
          aria-label="סגור"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Toast overlay (portaled to document.body) ────────────────────

function ToastOverlay({
  items,
  onDismiss,
}: {
  items: ToastItem[]
  onDismiss: (id: number) => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || items.length === 0) return null

  const overlay = (
    // Full-screen inert wrapper — z above SiteHeader (z-[10000])
    <div className="fixed inset-0 pointer-events-none z-[10001]">
      {/* Positioning container — no transform on this element to avoid new stacking context */}
      <div
        className="absolute flex flex-col gap-2 px-4 w-full max-w-sm
          bottom-6 left-1/2 -translate-x-1/2
          lg:bottom-auto lg:top-6 lg:left-auto lg:right-6 lg:translate-x-0"
      >
        {items.map((item) => (
          <ToastBubble key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

// ── Provider (no children — mounted standalone in layout) ────────

export default function ToastProvider({ children }: { children?: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info', duration = 4000) => {
      const id = nextId.current++
      setItems((prev) => [...prev.slice(-4), { id, message, variant, duration }])
    },
    [],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastOverlay items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}
