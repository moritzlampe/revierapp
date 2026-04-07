'use client'

import { useEffect, useState } from 'react'
import type { GeolocationState } from '@/hooks/useGeolocation'

/**
 * GPS-Status-Badge: Zeigt den aktuellen GPS-Zustand als Pill-Overlay.
 *
 * - Kein Fix nach 5s → "GPS wird gesucht..."
 * - Kein Fix nach 30s → "GPS nicht verfügbar — Standort aktivieren?"
 * - Fix mit >30m Accuracy → "GPS ungenau (Xm)"
 * - Fix mit 10–30m Accuracy → "GPS (Xm)"
 * - Locked → "Position fixiert"
 * - Moving → "Unterwegs"
 * - Error → "GPS nicht verfügbar"
 */
export default function GpsStatusBadge({ geo }: { geo: GeolocationState }) {
  const [noFixSeconds, setNoFixSeconds] = useState(0)

  // Timer: Sekunden ohne Fix zählen
  useEffect(() => {
    if (geo.position) {
      setNoFixSeconds(0)
      return
    }
    const interval = setInterval(() => {
      setNoFixSeconds(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [geo.position])

  let icon: string
  let label: string
  let bgColor: string
  let textColor: string
  let showSpinner = false

  if (geo.error) {
    icon = '❌'; label = 'GPS nicht verfügbar'
    bgColor = 'rgba(239, 83, 80, 0.15)'; textColor = 'var(--red)'
  } else if (!geo.position) {
    // Kein Fix — erst nach 5s Badge zeigen
    if (noFixSeconds < 5) return null
    showSpinner = true
    if (noFixSeconds >= 30) {
      icon = '⚠️'; label = 'GPS nicht verfügbar — Standort aktivieren?'
      bgColor = 'rgba(239, 83, 80, 0.15)'; textColor = 'var(--red)'
    } else {
      icon = '🔍'; label = 'GPS wird gesucht...'
      bgColor = 'rgba(255, 255, 255, 0.1)'; textColor = 'var(--text-2)'
    }
  } else if (geo.mode === 'searching' && geo.accuracy && geo.accuracy > 30) {
    // Position da, aber sehr ungenau
    icon = '📡'; label = `GPS ungenau (${Math.round(geo.accuracy)}m)`
    bgColor = 'rgba(255, 143, 0, 0.12)'; textColor = 'var(--orange)'
  } else if (geo.mode === 'searching' && geo.accuracy && geo.accuracy > 10) {
    // Position da, mittlere Genauigkeit
    icon = '📡'; label = `GPS (${Math.round(geo.accuracy)}m)`
    bgColor = 'rgba(255, 255, 255, 0.1)'; textColor = 'var(--text-2)'
  } else if (geo.mode === 'locked') {
    icon = '📍'; label = 'Position fixiert'
    bgColor = 'rgba(107, 159, 58, 0.15)'; textColor = 'var(--green-bright)'
  } else {
    icon = '🚶'; label = 'Unterwegs'
    bgColor = 'rgba(255, 143, 0, 0.15)'; textColor = 'var(--orange)'
  }

  return (
    <div style={{
      position: 'absolute',
      top: '0.75rem',
      left: '0.75rem',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      background: bgColor,
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '0.375rem 0.75rem',
      fontSize: '0.75rem',
      fontWeight: 600,
      color: textColor,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {showSpinner && <span className="gps-spinner" />}
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  )
}
