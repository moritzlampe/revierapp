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
import { showToast } from '@/lib/erlegung/toast'
import type { Revier } from '@/lib/types/revier'

interface ErlegungSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Phase = 'wildart' | 'solo-creating' | 'picking-district'

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

  const [phase, setPhase] = useState<Phase>('wildart')

  // GPS-Position via watchPosition solange Sheet offen (für WildartPicker)
  const [gpsPosition, setGpsPosition] = useState<{
    lat: number; lng: number; accuracy: number; captured_at: string
  } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  // Solo-Hunt-ID Ref — überlebt Sheet open/close innerhalb derselben Page
  const soloHuntIdRef = useRef<string | null>(null)

  // Revier-Picker (Promise-basiert)
  const [districtPickerState, setDistrictPickerState] = useState<{
    districts: Revier[]
    resolve: (d: Revier | null) => void
  } | null>(null)

  const effectiveHuntId = activeHunt?.id ?? soloHuntIdRef.current

  // Ref freigeben sobald useActiveHunt die Hunt findet
  useEffect(() => {
    if (activeHunt) {
      soloHuntIdRef.current = null
    }
  }, [activeHunt])

  // GPS-Watch für Kill-Position
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

  // Reset bei Sheet-Close + offenen District-Picker auflösen
  useEffect(() => {
    if (!open) {
      if (districtPickerState) {
        districtPickerState.resolve(null)
        setDistrictPickerState(null)
      }
      setPhase('wildart')
    }
    // districtPickerState bewusst nicht in deps — nur auf open-Change reagieren
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleKillSuccess(killIds: string[]) {
    // Fall 1: Hunt existiert (aktive Hunt oder soloHuntIdRef von vorherigem Kill)
    const existingHuntId = activeHunt?.id ?? soloHuntIdRef.current
    if (existingHuntId) {
      const isSolo = soloHuntIdRef.current || activeHunt?.kind === 'solo'
      onOpenChange(false)
      if (isSolo) {
        router.push(`/app/hunt/${existingHuntId}?afterKill=1`)
      }
      return
    }

    // Fall 2: Keine aktive Hunt → Solo-Hunt im Hintergrund erstellen
    setPhase('solo-creating')

    // 2a: GPS-Fix holen
    let position: { lng: number; lat: number } | null = null
    try {
      const fix = await waitForAccurateGpsFix(10_000, 15)
      position = { lng: fix.lng, lat: fix.lat }
    } catch {
      // GPS-Fehler: Hunt wird trotzdem erstellt, ohne Revier
    }

    // 2b: Revier-Lookup (nur wenn GPS valide)
    let districts: Revier[] = []
    let placeName: string | null = null

    if (position) {
      try {
        districts = await findDistrictsAtPoint(position.lng, position.lat)
      } catch {
        // Fehler beim Revier-Lookup: weiter ohne Revier
      }

      if (districts.length === 0) {
        try {
          placeName = (await reverseGeocode(position.lng, position.lat)).name
        } catch {
          // Fehler beim Geocoding: weiter ohne Ortsname
        }
      }
    }

    // 2c: Revier bestimmen
    let selectedDistrict: Revier | null = null

    if (districts.length === 1) {
      selectedDistrict = districts[0]
    } else if (districts.length > 1) {
      // Überlappende Reviere: User wählen lassen
      setPhase('picking-district')
      selectedDistrict = await new Promise<Revier | null>((resolve) => {
        setDistrictPickerState({ districts, resolve })
      })
      setDistrictPickerState(null)
      setPhase('solo-creating')
    }

    // 2d: Hunt-Name
    const name = composeHuntName(selectedDistrict, placeName)

    // 2e: Solo-Hunt erstellen
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Nicht eingeloggt')

      const { id: huntId } = await createSoloHunt({
        userId: user.id,
        districtId: selectedDistrict?.id ?? null,
        name,
      })

      // 2f: Kills der neuen Hunt zuordnen
      await supabase
        .from('kills')
        .update({ hunt_id: huntId })
        .in('id', killIds)

      // 2g: Ref setzen + Sheet schließen + Redirect
      soloHuntIdRef.current = huntId
      onOpenChange(false)
      router.push(`/app/hunt/${huntId}?afterKill=1`)

    } catch (err) {
      console.error('[handleKillSuccess] Solo-Hunt-Erstellung fehlgeschlagen:', err)
      // Kills bleiben mit hunt_id: null — User kann sie später zuordnen
      onOpenChange(false)
      showToast('Erlegung gespeichert, aber Einzeljagd konnte nicht erstellt werden.', 'warning')
    }
  }

  // --- RENDER ---

  // Phase: WildartPicker (Normalzustand)
  if (phase === 'wildart') {
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

  // Phase: Solo-Creating oder Picking-District
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton className="max-h-[85vh] gap-0">
        <SheetHeader>
          <SheetTitle>
            {phase === 'picking-district' ? 'Welches Revier?' : 'Einzeljagd wird erstellt …'}
          </SheetTitle>
        </SheetHeader>

        <div style={{ padding: '0 1rem 1rem' }}>
          {/* Spinner während GPS/Revier-Lookup/Hunt-Erstellung */}
          {phase === 'solo-creating' && (
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
                Einzeljagd wird gestartet …
              </p>
            </div>
          )}

          {/* Revier-Picker bei überlappenden Revieren */}
          {phase === 'picking-district' && districtPickerState && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{
                fontSize: '0.875rem',
                color: 'var(--text-2)',
                marginBottom: '0.25rem',
                lineHeight: 1.5,
              }}>
                Erlegung gespeichert. Wähle ein Revier für die Einzeljagd.
              </p>
              {districtPickerState.districts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => districtPickerState.resolve(d)}
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
                onClick={() => districtPickerState.resolve(null)}
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
        </div>
      </SheetContent>
    </Sheet>
  )
}
