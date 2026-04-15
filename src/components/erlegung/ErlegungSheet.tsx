'use client'

import { useState, useEffect } from 'react'
import { WildartPicker } from './WildartPicker'
import { useActiveHunt } from '@/hooks/useActiveHunt'

interface ErlegungSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ErlegungSheet({ open, onOpenChange }: ErlegungSheetProps) {
  const { activeHunt, loading } = useActiveHunt()
  const [gpsPosition, setGpsPosition] = useState<{
    lat: number; lng: number; accuracy: number; captured_at: string
  } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // GPS-Position via watchPosition solange Sheet offen
  useEffect(() => {
    if (!open) {
      setGpsPosition(null)
      setGpsLoading(false)
      return
    }
    if (!navigator.geolocation) return

    setGpsLoading(true)

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          captured_at: new Date().toISOString(),
        })
        setGpsLoading(false)
      },
      (err) => {
        console.warn('[ErlegungSheet] GPS error', err)
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [open])

  return (
    <WildartPicker
      open={open}
      onOpenChange={onOpenChange}
      position={gpsPosition}
      huntId={activeHunt?.id ?? null}
      gpsLoading={gpsLoading}
      noHuntHint={!loading && !activeHunt}
    />
  )
}
