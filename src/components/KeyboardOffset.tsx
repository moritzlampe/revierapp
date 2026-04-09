'use client'

import { useEffect } from 'react'

/**
 * Setzt --keyboard-offset und --bottom-bar-space auf <html> via Visual Viewport API.
 * iOS Safari ändert 100dvh NICHT bei Tastatur — wir müssen den Offset manuell berechnen.
 */
export default function KeyboardOffset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      const style = document.documentElement.style
      style.setProperty('--keyboard-offset', `${offset}px`)
      // Wenn Tastatur offen: kein Platz für Bottom-Bar reservieren
      if (offset > 50) {
        style.setProperty('--bottom-bar-space', '0px')
      } else {
        style.setProperty('--bottom-bar-space', `calc(3.5rem + var(--safe-bottom))`)
      }
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return null
}
