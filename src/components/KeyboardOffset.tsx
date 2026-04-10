'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Setzt --keyboard-offset, --bottom-bar-space und --safe-bottom auf <html>.
 * Zwei unabhängige Signale:
 * 1. Visual Viewport API (klassische Browser ohne resizes-content)
 * 2. Custom Event 'quickhunt:keyboard' (Focus/Blur vom Chat-Input)
 *
 * CSS-Variablen werden SYNCHRON im Event-Handler gesetzt (kein Frame-Delay),
 * plus als Backup im useEffect für Viewport-Änderungen.
 */
export default function KeyboardOffset() {
  const [viewportOffset, setViewportOffset] = useState(0)
  const [inputFocused, setInputFocused] = useState(false)
  const viewportOffsetRef = useRef(0)

  // Visual Viewport listener
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      viewportOffsetRef.current = offset
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

  // Custom Event listener — setzt CSS-Variablen SYNCHRON im Handler
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { open?: boolean } | undefined
      const open = !!detail?.open

      // Synchroner CSS-Update OHNE Wartezeit auf Re-Render
      const root = document.documentElement.style
      if (open) {
        root.setProperty('--bottom-bar-space', '0px')
        root.setProperty('--safe-bottom', '0px')
      } else if (viewportOffsetRef.current <= 50) {
        root.setProperty('--bottom-bar-space', 'calc(3.5rem + env(safe-area-inset-bottom, 0px))')
        root.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)')
      }

      // React-State zusätzlich aktualisieren für Backup-useEffect
      setInputFocused(open)
    }
    window.addEventListener('quickhunt:keyboard', handler)
    return () => window.removeEventListener('quickhunt:keyboard', handler)
  }, [])

  // Backup: CSS-Variablen setzen wenn sich Viewport-Offset ändert
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--keyboard-offset', `${viewportOffset}px`)

    const keyboardActive = viewportOffset > 50 || inputFocused
    if (keyboardActive) {
      root.setProperty('--safe-bottom', '0px')
      root.setProperty('--bottom-bar-space', '0px')
    } else {
      root.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)')
      root.setProperty('--bottom-bar-space', 'calc(3.5rem + env(safe-area-inset-bottom, 0px))')
    }
  }, [viewportOffset, inputFocused])

  return null
}
