'use client'
import { useEffect } from 'react'

/** Sets --vvh to window.visualViewport.height on every keyboard/resize event.
 *  Consumers: height: calc(var(--vvh, 100dvh) - <offset>px) */
export default function VisualViewportSync() {
  useEffect(() => {
    function sync() {
      const h = window.visualViewport?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--vvh', `${h}px`)
    }
    sync()
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    return () => {
      window.visualViewport?.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('scroll', sync)
    }
  }, [])
  return null
}
