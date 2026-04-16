'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { WildartPicker } from './WildartPicker'
import { useActiveHunt } from '@/hooks/useActiveHunt'
import { createClient } from '@/lib/supabase/client'
import { waitForAccurateGpsFix } from '@/lib/geo/wait-for-gps-fix'
import { findDistrictsAtPoint } from '@/lib/supabase/districts'
import { reverseGeocode } from '@/lib/geocoding'
import { createSoloHunt } from '@/lib/supabase/hunts'
import type { Revier } from '@/lib/types/revier'

interface ErlegungSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AutoSoloState =
  | { phase: 'idle' }
  | { phase: 'waiting-gps' }
  | { phase: 'looking-up' }
  | { phase: 'picking-district'; districts: Revier[]; lng: number; lat: number }
  | { phase: 'creating' }
  | { phase: 'error'; message: string }

function composeHuntName(
  district: Revier | null,
  placeName: string | null,
): string {
  const dateStr = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  })
  if (district) return `Einzeljagd ${district.name} · ${dateStr}`
  if (placeName) return `Einzeljagd ${placeName} · ${dateStr}`
  return `Einzeljagd · ${dateStr}`
}

export function ErlegungSheet({ open, onOpenChange }: ErlegungSheetProps) {
  const { activeHunt, loading } = useActiveHunt()
  const router = useRouter()

  // GPS-Position via watchPosition solange Sheet offen (für WildartPicker)
  const [gpsPosition, setGpsPosition] = useState<{
    lat: number; lng: number; accuracy: number; captured_at: string
  } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // Auto-Solo-Flow
  const [autoSoloState, setAutoSoloState] = useState<AutoSoloState>({ phase: 'idle' })
  const [soloHuntId, setSoloHuntId] = useState<string | null>(null)
  const autoSoloStarted = useRef(false)

  const effectiveHuntId = activeHunt?.id ?? soloHuntId

  // GPS-Watch für Kill-Position (bestehendes Verhalten)
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

  // Reset bei Sheet-Close
  useEffect(() => {
    if (!open) {
      setAutoSoloState({ phase: 'idle' })
      setSoloHuntId(null)
      autoSoloStarted.current = false
    }
  }, [open])

  // Auto-Solo-Flow starten wenn kein aktiver Hunt
  useEffect(() => {
    if (!open || loading || effectiveHuntId) return
    if (autoSoloStarted.current) return
    autoSoloStarted.current = true
    startAutoSoloFlow()
  }, [open, loading, effectiveHuntId])

  async function startAutoSoloFlow() {
    setAutoSoloState({ phase: 'waiting-gps' })

    let position: { lng: number; lat: number; accuracy: number }
    try {
      position = await waitForAccurateGpsFix(10_000, 15)
    } catch {
      setAutoSoloState({
        phase: 'error',
        message: 'GPS-Position konnte nicht bestimmt werden. Bitte ins Freie gehen und nochmal versuchen.',
      })
      return
    }

    await handleGpsFix(position)
  }

  async function handleGpsFix(position: { lng: number; lat: number }) {
    setAutoSoloState({ phase: 'looking-up' })

    let districts: Revier[]
    try {
      districts = await findDistrictsAtPoint(position.lng, position.lat)
    } catch {
      setAutoSoloState({
        phase: 'error',
        message: 'Reviere konnten nicht geladen werden. Bitte nochmal versuchen.',
      })
      return
    }

    if (districts.length === 0) {
      const { name } = await reverseGeocode(position.lng, position.lat)
      await createAndSetHunt(null, name)
    } else if (districts.length === 1) {
      await createAndSetHunt(districts[0], null)
    } else {
      setAutoSoloState({
        phase: 'picking-district',
        districts,
        lng: position.lng,
        lat: position.lat,
      })
    }
  }

  async function createAndSetHunt(district: Revier | null, placeName: string | null) {
    setAutoSoloState({ phase: 'creating' })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAutoSoloState({ phase: 'error', message: 'Nicht eingeloggt.' })
      return
    }

    const name = composeHuntName(district, placeName)

    try {
      const { id } = await createSoloHunt({
        userId: user.id,
        districtId: district?.id ?? null,
        name,
      })
      setSoloHuntId(id)
      setAutoSoloState({ phase: 'idle' })
    } catch (err) {
      console.error('[ErlegungSheet] createSoloHunt failed:', err)
      setAutoSoloState({
        phase: 'error',
        message: 'Jagd konnte nicht erstellt werden. Bitte nochmal versuchen.',
      })
    }
  }

  function handleRetry() {
    autoSoloStarted.current = false
    setAutoSoloState({ phase: 'idle' })
  }

  function handleKillSuccess() {
    if (soloHuntId) {
      router.push(`/app/hunt/${soloHuntId}?afterKill=1`)
    }
  }

  // Auto-Solo-UI (GPS-Wait, District-Picker, Creating, Error)
  if (autoSoloState.phase !== 'idle' && !effectiveHuntId) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" showCloseButton className="max-h-[85vh] gap-0">
          <SheetHeader>
            <SheetTitle>Einzeljagd starten</SheetTitle>
          </SheetHeader>

          <div style={{ padding: '0 1rem 1rem', minHeight: '10rem' }}>
            {/* Loading: GPS oder Erstellen */}
            {(autoSoloState.phase === 'waiting-gps' ||
              autoSoloState.phase === 'looking-up' ||
              autoSoloState.phase === 'creating') && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                padding: '3rem 0',
              }}>
                <Loader2
                  size={32}
                  style={{ color: 'var(--green)', animation: 'spin 1s linear infinite' }}
                />
                <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>
                  {autoSoloState.phase === 'waiting-gps' && 'GPS wird bestimmt …'}
                  {autoSoloState.phase === 'looking-up' && 'Revier wird gesucht …'}
                  {autoSoloState.phase === 'creating' && 'Einzeljagd wird gestartet …'}
                </p>
              </div>
            )}

            {/* Revier-Auswahl */}
            {autoSoloState.phase === 'picking-district' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                  Du bist in {autoSoloState.districts.length} überlappenden Revieren.
                  Wähle das passende aus.
                </p>
                {autoSoloState.districts.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => createAndSetHunt(d, null)}
                    style={{
                      padding: '0.875rem 1rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '0.9375rem',
                      fontWeight: 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      minHeight: '2.75rem',
                    }}
                  >
                    {d.name}
                  </button>
                ))}
                <button
                  onClick={async () => {
                    const { name } = await reverseGeocode(
                      autoSoloState.lng,
                      autoSoloState.lat,
                    )
                    await createAndSetHunt(null, name)
                  }}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-3)',
                    fontSize: '0.8125rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    minHeight: '2.75rem',
                  }}
                >
                  Keins davon — Auswärtsjagd
                </button>
              </div>
            )}

            {/* Fehler */}
            {autoSoloState.phase === 'error' && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                padding: '2rem 0',
              }}>
                <p style={{
                  color: 'var(--text-2)',
                  fontSize: '0.875rem',
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}>
                  {autoSoloState.message}
                </p>
                <button
                  onClick={handleRetry}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--green)',
                    color: '#fff',
                    border: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: '2.75rem',
                  }}
                >
                  Nochmal versuchen
                </button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Normal: WildartPicker (mit aktiver Hunt oder gerade erstellter Solo-Hunt)
  return (
    <WildartPicker
      open={open}
      onOpenChange={onOpenChange}
      position={gpsPosition}
      huntId={effectiveHuntId}
      gpsLoading={gpsLoading}
      noHuntHint={!loading && !effectiveHuntId}
      onKillSuccess={handleKillSuccess}
    />
  )
}
