'use client'

import { useEffect, useState } from 'react'

/**
 * Setzt --keyboard-offset und --bottom-bar-space auf <html>.
 * Zwei unabhängige Signale:
 * 1. Visual Viewport API (klassische Browser ohne resizes-content)
 * 2. Custom Event 'quickhunt:keyboard' (Focus/Blur vom Chat-Input)
 *
 * --bottom-bar-space wird auf 0 gesetzt, wenn EINES der Signale aktiv ist.
 * Das deckt resizes-content-Browser ab (Offset ≈ 0, aber Focus-Event feuert).
 */
export default function KeyboardOffset() {
  const [viewportOffset, setViewportOffset] = useState(0)
  const [inputFocused, setInputFocused] = useState(false)

  // Visual Viewport listener
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setViewportOffset(offset)
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // Custom Event listener für Focus-State
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { open?: boolean } | undefined
      setInputFocused(!!detail?.open)
    }
    window.addEventListener('quickhunt:keyboard', handler)
    return () => window.removeEventListener('quickhunt:keyboard', handler)
  }, [])

  // CSS-Variablen setzen wenn sich einer der States ändert
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--keyboard-offset', `${viewportOffset}px`)

    const keyboardActive = viewportOffset > 50 || inputFocused
    if (keyboardActive) {
      root.setProperty('--bottom-bar-space', '0px')
    } else {
      root.setProperty('--bottom-bar-space', 'calc(3.5rem + var(--safe-bottom))')
    }
  }, [viewportOffset, inputFocused])

  return null
}
