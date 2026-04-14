'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

type CompassPermission = 'idle' | 'pending' | 'granted' | 'denied' | 'unsupported'

const COMPASS_STORAGE_KEY = 'compass_enabled'

/**
 * Device-Heading-Hook: liefert absolute Kompass-Richtung (0°=Nord, clockwise).
 *
 * - rAF-throttled: max 1 Callback pro Frame, immer neuester Wert
 * - Plattform-abstraktion: iOS webkitCompassHeading, Android deviceorientationabsolute
 * - Permission-Flow für iOS 13+ (requestPermission nach User-Geste)
 *
 * @param onHeading Callback mit Heading in Grad — wird im rAF aufgerufen, NICHT in React-State nutzen
 * @param enabled  Wenn false: alle Listener entfernt, kein Akku-Verbrauch
 */
export function useCompassHeading(
  onHeading: (deg: number) => void,
  enabled: boolean,
): {
  permission: CompassPermission
  request: () => Promise<boolean>
} {
  const [permission, setPermission] = useState<CompassPermission>('idle')
  const onHeadingRef = useRef(onHeading)
  const latestHeading = useRef<number>(0)
  const rafScheduled = useRef(false)
  const rafId = useRef<number>(0)
  const listenerCleanup = useRef<(() => void) | null>(null)

  // Callback-Ref aktuell halten ohne Re-Render
  useEffect(() => {
    onHeadingRef.current = onHeading
  }, [onHeading])

  // Heading aus Event extrahieren (plattformübergreifend)
  const extractHeading = useCallback((event: DeviceOrientationEvent): number | null => {
    // iOS: webkitCompassHeading ist absolute Gradzahl von Nord
    if ('webkitCompassHeading' in event) {
      const h = (event as any).webkitCompassHeading as number
      if (typeof h === 'number' && !isNaN(h)) return h
    }
    // Android/Chrome: alpha bei absolutem Event → heading = 360 - alpha
    if (event.absolute && event.alpha != null) {
      return (360 - event.alpha) % 360
    }
    // Fallback: normales alpha (relativ — besser als nichts)
    if (event.alpha != null) {
      return (360 - event.alpha) % 360
    }
    return null
  }, [])

  // rAF-throttled Handler
  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const heading = extractHeading(event)
    if (heading === null) return

    latestHeading.current = heading

    if (!rafScheduled.current) {
      rafScheduled.current = true
      rafId.current = requestAnimationFrame(() => {
        onHeadingRef.current(latestHeading.current)
        rafScheduled.current = false
      })
    }
  }, [extractHeading])

  // Listener registrieren
  const startListening = useCallback(() => {
    // Cleanup falls schon aktiv
    listenerCleanup.current?.()

    // Bevorzugt: deviceorientationabsolute (Chrome/Android)
    const hasAbsolute = 'ondeviceorientationabsolute' in window
    const eventName = hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation'

    window.addEventListener(eventName, handleOrientation as EventListener)

    listenerCleanup.current = () => {
      window.removeEventListener(eventName, handleOrientation as EventListener)
      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
        rafId.current = 0
      }
      rafScheduled.current = false
    }
  }, [handleOrientation])

  // Listener stoppen
  const stopListening = useCallback(() => {
    listenerCleanup.current?.()
    listenerCleanup.current = null
  }, [])

  // Permission-Request (hauptsächlich für iOS)
  const request = useCallback(async (): Promise<boolean> => {
    // Prüfe ob DeviceOrientationEvent überhaupt existiert
    if (typeof DeviceOrientationEvent === 'undefined') {
      setPermission('unsupported')
      return false
    }

    // iOS 13+: explizite Permission nötig
    if ('requestPermission' in DeviceOrientationEvent) {
      try {
        setPermission('pending')
        const result = await (DeviceOrientationEvent as any).requestPermission()
        if (result === 'granted') {
          setPermission('granted')
          return true
        } else {
          setPermission('denied')
          return false
        }
      } catch {
        setPermission('denied')
        return false
      }
    }

    // Android / Desktop: keine Permission nötig
    setPermission('granted')
    return true
  }, [])

  // Haupteffekt: Listener starten/stoppen basierend auf enabled + permission
  useEffect(() => {
    if (!enabled) {
      stopListening()
      return
    }

    // Prüfe Support
    if (typeof DeviceOrientationEvent === 'undefined') {
      setPermission('unsupported')
      return
    }

    // iOS: Permission prüfen
    if ('requestPermission' in DeviceOrientationEvent) {
      // Permission muss erst angefragt werden (nach User-Geste)
      // Auto-Start versuchen: requestPermission OHNE User-Geste
      // schlägt auf iOS fehl → Button muss getappt werden
      if (permission === 'idle') {
        // Versuche direkt — auf iOS wird das ohne Geste fehlschlagen
        ;(DeviceOrientationEvent as any).requestPermission()
          .then((result: string) => {
            if (result === 'granted') {
              setPermission('granted')
            } else {
              setPermission('idle')
            }
          })
          .catch(() => {
            // Erwartet auf iOS ohne Geste — warte auf manuellen request()
            setPermission('idle')
          })
        return
      }
      if (permission !== 'granted') return
    } else {
      // Nicht-iOS: direkt granted
      if (permission === 'idle') {
        setPermission('granted')
      }
    }

    if (permission === 'granted') {
      startListening()
    }

    return () => {
      stopListening()
    }
  }, [enabled, permission, startListening, stopListening])

  return { permission, request }
}

/** localStorage-Helfer für Kompass-Aktivierung */
export function getCompassEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(COMPASS_STORAGE_KEY) === 'true'
  } catch { return false }
}

export function setCompassEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(COMPASS_STORAGE_KEY, 'true')
    } else {
      localStorage.removeItem(COMPASS_STORAGE_KEY)
    }
  } catch { /* ignore */ }
}
