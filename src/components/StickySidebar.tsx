'use client'

import * as React from 'react'

type Props = {
  children: React.ReactNode
  className?: string
  /** גובה ה-header + רווח. ברירת מחדל: 80px */
  topOffset?: number
  /** id של ה-wrapper היחסי שמכיל את עמודת הסיידבר */
  containerId: string
}

type Mode = 'static' | 'fixed' | 'absolute'

type Metrics = {
  containerTop: number
  containerHeight: number
  sidebarHeight: number
  sidebarWidth: number
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export default function StickySidebar({ children, className, topOffset = 80, containerId }: Props) {
  const outerRef = React.useRef<HTMLDivElement | null>(null)
  const innerRef = React.useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = React.useState<Metrics | null>(null)
  const [mode, setMode] = React.useState<Mode>('static')

  const measure = React.useCallback(() => {
    const container = document.getElementById(containerId)
    const outer = outerRef.current
    const inner = innerRef.current
    if (!container || !outer || !inner) return

    const containerRect = container.getBoundingClientRect()
    const scrollY = window.scrollY || window.pageYOffset

    const innerRect = inner.getBoundingClientRect()
    const sidebarHeight = inner.offsetHeight
    const sidebarWidth = innerRect.width

    setMetrics({
      containerTop: containerRect.top + scrollY,
      containerHeight: container.offsetHeight,
      sidebarHeight,
      sidebarWidth,
    })

    // שומר מקום בפריסה כשאנחנו עוברים ל-fixed
    outer.style.height = `${sidebarHeight}px`
  }, [containerId])

  const recomputeMode = React.useCallback(() => {
    const m = metrics
    if (!m) return

    const scrollY = window.scrollY || window.pageYOffset
    const start = m.containerTop - topOffset
    const end = m.containerTop + m.containerHeight - m.sidebarHeight - topOffset

    // אם הסיידבר גבוה מהקונטיינר – אין מה “להדביק”
    if (m.sidebarHeight >= m.containerHeight) {
      setMode('static')
      return
    }

    if (scrollY < start) setMode('static')
    else if (scrollY >= start && scrollY < end) setMode('fixed')
    else setMode('absolute')
  }, [metrics, topOffset])

  React.useEffect(() => {
    measure()
    const t = window.setTimeout(() => measure(), 50) // תמונות/פונטים יכולים לשנות גובה
    return () => window.clearTimeout(t)
  }, [measure])

  React.useEffect(() => {
    recomputeMode()
  }, [recomputeMode])

  React.useEffect(() => {
    const onScroll = () => recomputeMode()
    const onResize = () => {
      measure()
      window.setTimeout(() => recomputeMode(), 0)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [measure, recomputeMode])

  const style: React.CSSProperties = React.useMemo(() => {
    if (!metrics) return {}

    if (mode === 'fixed') {
      return { position: 'fixed', top: topOffset, width: metrics.sidebarWidth }
    }

    if (mode === 'absolute') {
      const topWithin = clamp(metrics.containerHeight - metrics.sidebarHeight, 0, metrics.containerHeight)
      return { position: 'absolute', top: topWithin, width: '100%' }
    }

    return { position: 'static' }
  }, [metrics, mode, topOffset])

  return (
    <div ref={outerRef} className={['w-full', className].filter(Boolean).join(' ')}>
      <div ref={innerRef} style={style}>
        {children}
      </div>
    </div>
  )
}
