'use client'

import { useEffect } from 'react'
import type { Map as LeafletMap } from 'leaflet'

/**
 * Ruft map.invalidateSize() bei orientationchange und resize auf.
 * Notwendig, weil Leaflet die Canvas-Größe sonst nicht neu misst
 * und Karten-Inhalte bei Rotation geclippt werden.
 *
 * Die 120ms Verzögerung ist bewusst: Browser melden orientationchange
 * oft BEVOR die finalen Viewport-Dimensionen feststehen.
 */
export function useInvalidateOnResize(map: LeafletMap | null) {
  useEffect(() => {
    if (!map) return

    const handler = () => {
      setTimeout(() => {
        map.invalidateSize({ animate: false })
      }, 120)
    }

    window.addEventListener('orientationchange', handler)
    window.addEventListener('resize', handler)

    return () => {
      window.removeEventListener('orientationchange', handler)
      window.removeEventListener('resize', handler)
    }
  }, [map])
}
