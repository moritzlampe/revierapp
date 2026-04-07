'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { distanceInMeters } from '@/lib/geo-utils'

const LOCK_ACCURACY = 10       // Meter — Genauigkeit für Lock
const GEOFENCE_RADIUS = 10     // Meter — Bewegung erkannt wenn > 10m vom Lock
const FALLBACK_TIMEOUT = 120000 // 2 Minuten Fallback-Timer

export interface GeoPosition {
  lat: number
  lng: number
}

export interface GeolocationState {
  position: GeoPosition | null
  accuracy: number | null
  isLocked: boolean
  mode: 'searching' | 'locked' | 'moving'
  error: string | null
  lastUpdate: Date | null
}

interface UseGeolocationOptions {
  onPositionChange?: (position: GeoPosition) => void
}

export function useGeolocation(options?: UseGeolocationOptions) {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    accuracy: null,
    isLocked: false,
    mode: 'searching',
    error: null,
    lastUpdate: null,
  })

  const lockedPosition = useRef<GeoPosition | null>(null)
  const bestMeasurement = useRef<{ position: GeoPosition; accuracy: number } | null>(null)
  const watchId = useRef<number | null>(null)
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onPositionChangeRef = useRef(options?.onPositionChange)

  // Callback-Ref aktuell halten ohne Re-Render
  useEffect(() => {
    onPositionChangeRef.current = options?.onPositionChange
  }, [options?.onPositionChange])

  const reportPosition = useCallback((pos: GeoPosition, accuracy: number, locked: boolean) => {
    setState({
      position: pos,
      accuracy,
      isLocked: locked,
      mode: locked ? 'locked' : 'moving',
      error: null,
      lastUpdate: new Date(),
    })
    onPositionChangeRef.current?.(pos)
  }, [])

  const useFallback = useCallback(() => {
    if (bestMeasurement.current && !lockedPosition.current) {
      const { position, accuracy } = bestMeasurement.current
      lockedPosition.current = position
      reportPosition(position, accuracy, true)
    }
  }, [reportPosition])

  useEffect(() => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: 'GPS wird von diesem Browser nicht unterstützt.' }))
      return
    }

    // Fallback-Timer starten
    fallbackTimer.current = setTimeout(useFallback, FALLBACK_TIMEOUT)

    watchId.current = navigator.geolocation.watchPosition(
      (geo) => {
        const { latitude, longitude, accuracy } = geo.coords
        const pos: GeoPosition = { lat: latitude, lng: longitude }
        const acc = accuracy

        // Beste Messung merken (für Fallback)
        if (!bestMeasurement.current || acc < bestMeasurement.current.accuracy) {
          bestMeasurement.current = { position: pos, accuracy: acc }
        }

        if (acc < LOCK_ACCURACY) {
          // Gute Messung — Fallback-Timer zurücksetzen
          if (fallbackTimer.current) {
            clearTimeout(fallbackTimer.current)
            fallbackTimer.current = null
          }

          if (!lockedPosition.current) {
            // Erster Lock
            lockedPosition.current = pos
            reportPosition(pos, acc, true)
          } else {
            const dist = distanceInMeters(
              lockedPosition.current.lat, lockedPosition.current.lng,
              pos.lat, pos.lng
            )
            if (dist > GEOFENCE_RADIUS) {
              // Bewegt — Re-Lock
              lockedPosition.current = pos
              reportPosition(pos, acc, true)
            }
            // dist <= GEOFENCE_RADIUS → nichts tun (Position stabil)
          }
        } else {
          // Schlechte Messung — Position trotzdem sofort lokal anzeigen
          if (!lockedPosition.current) {
            setState({
              position: pos,
              accuracy: acc,
              isLocked: false,
              mode: 'searching',
              error: null,
              lastUpdate: new Date(),
            })
          }
        }
      },
      (err) => {
        let errorMsg = 'GPS-Fehler aufgetreten.'
        if (err.code === err.PERMISSION_DENIED) {
          errorMsg = 'GPS-Zugriff verweigert. Bitte in den Browser-Einstellungen aktivieren.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMsg = 'GPS-Position nicht verfügbar.'
        } else if (err.code === err.TIMEOUT) {
          errorMsg = 'GPS-Zeitüberschreitung.'
        }
        setState(prev => ({ ...prev, error: errorMsg, mode: 'searching' }))
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      }
    )

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
      }
      if (fallbackTimer.current) {
        clearTimeout(fallbackTimer.current)
      }
    }
  }, [reportPosition, useFallback])

  return state
}
