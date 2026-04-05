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

function getScrollBounds(metrics: Metrics, topOffset: number) {
  return {
    start: metrics.containerTop - topOffset,
    end: metrics.containerTop + metrics.containerHeight - metrics.sidebarHeight - topOffset,
  }
}

export default function StickySidebar({ children, className, topOffset = 80, containerId }: Props) {
  const outerRef = React.useRef<HTMLDivElement | null>(null)
  const innerRef = React.useRef<HTMLDivElement | null>(null)
  const frameRef = React.useRef<number | null>(null)
  const metricsRef = React.useRef<Metrics | null>(null)
  const modeRef = React.useRef<Mode>('static')
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

    const nextMetrics = {
      containerTop: containerRect.top + scrollY,
      containerHeight: container.offsetHeight,
      sidebarHeight,
      sidebarWidth,
    }

    metricsRef.current = nextMetrics
    setMetrics(prev => (
      prev &&
      prev.containerTop === nextMetrics.containerTop &&
      prev.containerHeight === nextMetrics.containerHeight &&
      prev.sidebarHeight === nextMetrics.sidebarHeight &&
      prev.sidebarWidth === nextMetrics.sidebarWidth
    ) ? prev : nextMetrics)

    // שומר מקום בפריסה כשאנחנו עוברים ל-fixed
    outer.style.height = `${sidebarHeight}px`
  }, [containerId])

  const recomputeMode = React.useCallback(() => {
    const m = metricsRef.current
    if (!m) return

    const scrollY = window.scrollY || window.pageYOffset
    const { start, end } = getScrollBounds(m, topOffset)

    // אם הסיידבר גבוה מהקונטיינר – אין מה "להדביק"
    const nextMode: Mode = m.sidebarHeight >= m.containerHeight
      ? 'static'
      : scrollY < start
        ? 'static'
        : scrollY < end
          ? 'fixed'
          : 'absolute'

    if (modeRef.current !== nextMode) {
      modeRef.current = nextMode
      setMode(nextMode)
    }
  }, [topOffset])

  const shouldScheduleForScroll = React.useCallback((scrollY: number) => {
    const m = metricsRef.current
    if (!m || m.sidebarHeight >= m.containerHeight) return false

    const { start, end } = getScrollBounds(m, topOffset)
    const currentMode = modeRef.current

    if (currentMode === 'static') return scrollY >= start
    if (currentMode === 'fixed') return scrollY < start || scrollY >= end
    return scrollY < end
  }, [topOffset])

  const scheduleRecompute = React.useCallback(() => {
    if (frameRef.current !== null) return

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      recomputeMode()
    })
  }, [recomputeMode])

  React.useEffect(() => {
    measure()
    scheduleRecompute()

    if (typeof ResizeObserver === 'undefined') {
      const t = window.setTimeout(() => {
        measure()
        scheduleRecompute()
      }, 50)
      return () => window.clearTimeout(t)
    }

    const container = document.getElementById(containerId)
    const inner = innerRef.current
    const observer = new ResizeObserver(() => {
      measure()
      scheduleRecompute()
    })

    if (container) observer.observe(container)
    if (inner) observer.observe(inner)

    return () => {
      observer.disconnect()
    }
  }, [containerId, measure, scheduleRecompute])

  React.useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset
      if (!shouldScheduleForScroll(scrollY)) return
      scheduleRecompute()
    }

    const onResize = () => {
      measure()
      scheduleRecompute()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [measure, scheduleRecompute, shouldScheduleForScroll])

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
