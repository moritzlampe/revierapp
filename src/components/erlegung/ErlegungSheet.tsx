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
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // GPS-Position beim Öffnen holen
  useEffect(() => {
    if (!open) {
      setGpsPosition(null)
      setGpsLoading(false)
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsLoading(false)
      },
      () => {
        setGpsPosition(null)
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
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
