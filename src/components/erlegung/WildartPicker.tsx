'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ArrowLeft } from '@phosphor-icons/react'
import {
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
  WILD_ART_TO_GROUP,
  type WildArt,
  type WildGroup,
  type Geschlecht,
  type WildGroupConfig,
  type AltersklasseEntry,
} from '@/lib/species-config'
import { getWildArtLabelSingle } from '@/lib/wildArt'
import { insertKillBatch } from '@/lib/erlegung/insertKill'
import { insertSighting } from '@/lib/erlegung/insertSighting'
import { showToast } from '@/lib/erlegung/toast'
import PhotoCapture from '@/components/photo/PhotoCapture'
import { uploadPendingPhotosForHunt } from '@/lib/photos/upload-batch'
import { createClient } from '@/lib/supabase/client'
import { getGroupIcon } from '@/components/icons/SpeciesIcons'

const noSelectStyle: React.CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  WebkitTapHighlightColor: 'transparent',
}

type PendingKill = {
  id: string
  wild_art: WildArt
  geschlecht: Geschlecht | null
  position: { lat: number; lng: number; accuracy: number; captured_at: string }
  tapped_at: string
}

function CounterBadge({ count }: { count: number }) {
  if (count === 0) return null
  const display = count > 99 ? '99+' : String(count)
  return (
    <span style={{
      position: 'absolute',
      top: '-0.4rem',
      right: '-0.4rem',
      minWidth: '1.4rem',
      height: '1.4rem',
      padding: '0 0.35rem',
      borderRadius: '0.7rem',
      background: 'var(--green)',
      color: 'var(--text)',
      fontSize: '0.75rem',
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 1,
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      pointerEvents: 'none',
    }}>{display}</span>
  )
}

/** Erfassungs-Modus des Pickers: Erlegung (Batch-Tap) oder Anblick (Single-Select). */
export type ErfassungsModus = 'erlegung' | 'sighting'

interface WildartPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  position?: { lat: number; lng: number; accuracy?: number; captured_at?: string } | null
  huntId?: string | null
  /** Hunt-Zuordnung für Anblicke — activeHunt?.id ?? null. KEIN Auto-Solo-Hunt. */
  sightingHuntId?: string | null
  /** Aktueller Erfassungs-Modus. Default 'erlegung'. */
  mode?: ErfassungsModus
  /** Setzt der Parent den Modus-Toggle. Fehlt der Handler, gibt es keinen Toggle. */
  onModeChange?: (mode: ErfassungsModus) => void
  onSuccess?: (killId: string) => void
  onKillSuccess?: (killIds: string[], pendingPhotos: File[]) => void
  gpsLoading?: boolean
}

export function WildartPicker({
  open,
  onOpenChange,
  position = null,
  huntId = null,
  sightingHuntId = null,
  mode = 'erlegung',
  onModeChange,
  onKillSuccess,
  gpsLoading,
}: WildartPickerProps) {
  const router = useRouter()
  const [step, setStep] = useState<'group' | 'detail' | 'flat'>('group')
  const [selectedGroup, setSelectedGroup] = useState<WildGroup | null>(null)
  const [selectedGeschlecht, setSelectedGeschlecht] = useState<Geschlecht | null>(null)
  const [selectedWildArt, setSelectedWildArt] = useState<WildArt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [krankMode, setKrankMode] = useState(false)
  const [pendingKills, setPendingKills] = useState<PendingKill[]>([])
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  // Anblick-Modus: Anzahl beobachteter Stücke (1 wild_events-Row mit count=N)
  const [sightingCount, setSightingCount] = useState(1)

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  // User-ID einmalig laden (für Foto-Upload)
  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data.user?.id ?? null)
    })
    return () => { mounted = false }
  }, [])

  // Zurücksetzen beim Öffnen
  useEffect(() => {
    if (open) {
      setStep('group')
      setSelectedGroup(null)
      setSelectedGeschlecht(null)
      setSelectedWildArt(null)
      setSubmitting(false)
      setKrankMode(false)
      setPendingKills([])
      setPendingPhotos([])
      setPhotoUploading(false)
      setUploadProgress(null)
      setSightingCount(1)
    }
  }, [open])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // --- Modus-Wechsel (nur im sauberen Einstiegszustand erreichbar) ---
  const handleModeChange = useCallback((next: ErfassungsModus) => {
    if (next === mode) return
    // Defensiver Reset des Picker-States — verhindert Mid-Flow-Reste
    setStep('group')
    setSelectedGroup(null)
    setSelectedGeschlecht(null)
    setSelectedWildArt(null)
    setKrankMode(false)
    setSightingCount(1)
    setPendingKills([])
    setPendingPhotos([])
    onModeChange?.(next)
  }, [mode, onModeChange])

  // --- Counter-Helpers ---
  const addPendingKill = useCallback((wildArt: WildArt, geschlecht: Geschlecht | null) => {
    if (!position) {
      showToast('Warte auf GPS…', 'warning')
      return
    }
    setPendingKills(prev => [...prev, {
      id: crypto.randomUUID(),
      wild_art: wildArt,
      geschlecht,
      position: {
        lat: position.lat,
        lng: position.lng,
        accuracy: position.accuracy ?? 0,
        captured_at: position.captured_at ?? new Date().toISOString(),
      },
      tapped_at: new Date().toISOString(),
    }])
    if (navigator.vibrate) navigator.vibrate(20)
  }, [position])

  const removePendingKillByWildArt = useCallback((wildArt: WildArt) => {
    setPendingKills(prev => {
      const lastIdx = prev.findLastIndex(pk => pk.wild_art === wildArt)
      if (lastIdx === -1) return prev
      const next = [...prev]
      next.splice(lastIdx, 1)
      return next
    })
    if (navigator.vibrate) navigator.vibrate([40, 40])
  }, [])

  const countFor = (wildArt: WildArt): number =>
    pendingKills.filter(pk => pk.wild_art === wildArt).length

  const countForGroup = (group: WildGroup): number =>
    pendingKills.filter(pk => WILD_ART_TO_GROUP[pk.wild_art] === group).length

  const totalCount = pendingKills.length

  // --- Long-Press end (shared) ---
  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // --- Stufe 1: Wildgruppen-Tile: Tap ---
  const handleGroupTap = useCallback((config: WildGroupConfig) => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (config.group === 'sonstiges') {
      if (mode === 'sighting') {
        // Single-Select: Tap toggelt die Auswahl (keine weitere Stufe, kein Zurück)
        setSelectedWildArt(prev => (prev === 'sonstiges' ? null : 'sonstiges'))
      } else {
        addPendingKill('sonstiges', null)
      }
      return
    }
    if (config.hasGeschlecht) {
      setSelectedGroup(config.group)
      setSelectedWildArt(null)
      setSelectedGeschlecht(null)
      setStep('detail')
    } else if (FLAT_GROUP_TIERE[config.group]) {
      setSelectedGroup(config.group)
      setStep('flat')
    }
  }, [addPendingKill, mode])

  // --- Stufe 1: Wildgruppen-Tile: Long-Press ---
  const handleGroupLongPressStart = useCallback((config: WildGroupConfig) => {
    if (mode === 'sighting') return  // Long-Press hat im Anblick-Modus keine Funktion
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      if (config.unspezValue) {
        longPressFired.current = true
        addPendingKill(config.unspezValue, null)
        if (navigator.vibrate) navigator.vibrate(50)
      } else if (config.group === 'sonstiges') {
        longPressFired.current = true
        addPendingKill('sonstiges', null)
        if (navigator.vibrate) navigator.vibrate(50)
      }
      // Flat-Gruppen ohne unspezValue: longPressFired bleibt false → normaler Tap navigiert
    }, 500)
  }, [addPendingKill, mode])

  // --- Stufe 2a: Geschlecht (manuell) ---
  const handleGeschlechtSelect = useCallback((g: Geschlecht) => {
    setSelectedGeschlecht(prev => prev === g ? null : g)
  }, [])

  // --- Stufe 2a: Altersklasse Tap (Erlegung: zählt — Anblick: selektiert) ---
  const handleAltersklasseTap = useCallback((entry: AltersklasseEntry) => {
    const geschlecht = entry.impliedGeschlecht ?? selectedGeschlecht
    if (mode === 'sighting') {
      // Single-Select: Tap selektiert die Wildart, zählt nicht
      setSelectedWildArt(entry.value)
      if (entry.impliedGeschlecht) {
        setSelectedGeschlecht(entry.impliedGeschlecht)
      }
      return
    }
    addPendingKill(entry.value, geschlecht)
    if (entry.impliedGeschlecht) {
      setSelectedGeschlecht(entry.impliedGeschlecht)
    }
    setSelectedWildArt(entry.value)
  }, [selectedGeschlecht, addPendingKill, mode])

  // --- Stufe 2a: Altersklasse Long-Press (Decrement) ---
  const handleAltersklasseLongPressStart = useCallback((entry: AltersklasseEntry) => {
    if (mode === 'sighting') return  // Long-Press hat im Anblick-Modus keine Funktion
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      removePendingKillByWildArt(entry.value)
    }, 500)
  }, [removePendingKillByWildArt, mode])

  // --- Stufe 2b: Flat Tier Tap (Erlegung: zählt — Anblick: selektiert) ---
  const handleFlatTierTap = useCallback((wildArt: WildArt) => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (mode === 'sighting') {
      // Single-Select: Tap toggelt die Auswahl
      setSelectedWildArt(prev => (prev === wildArt ? null : wildArt))
      return
    }
    addPendingKill(wildArt, null)
  }, [addPendingKill, mode])

  // --- Stufe 2b: Flat Tier Long-Press (Decrement) ---
  const handleFlatLongPressStart = useCallback((wildArt: WildArt) => {
    if (mode === 'sighting') return  // Long-Press hat im Anblick-Modus keine Funktion
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      removePendingKillByWildArt(wildArt)
    }, 500)
  }, [removePendingKillByWildArt, mode])

  // --- Zurück (pendingKills + krankMode bleiben erhalten) ---
  const handleBack = useCallback(() => {
    setStep('group')
    setSelectedGroup(null)
    setSelectedGeschlecht(null)
    setSelectedWildArt(null)
  }, [])

  // --- Photo-Buffer Handlers ---
  const handlePhotoBuffer = useCallback((file: File) => {
    setPendingPhotos(prev => {
      const next = [...prev, file]
      showToast('Foto hinzugefügt', 'success', `${next.length} Foto${next.length === 1 ? '' : 's'} bereit`)
      return next
    })
  }, [])

  const handlePhotoError = useCallback((err: Error) => {
    showToast('Foto-Fehler', 'warning', err.message)
  }, [])

  // --- Batch Confirm ---
  const handleConfirmBatch = useCallback(async () => {
    if (pendingKills.length === 0 || submitting) return
    setSubmitting(true)

    try {
      const killIds = await insertKillBatch({
        items: pendingKills.map(pk => ({
          wild_art: pk.wild_art,
          geschlecht: pk.geschlecht,
          position: pk.position,
          erlegt_am: pk.tapped_at,
        })),
        huntId,
        status: krankMode ? 'wounded' : 'harvested',
      })

      // Foto-Upload (nur wenn huntId + userId + Fotos vorhanden).
      // Im Auto-Solo-Hunt-Flow ist huntId hier null — die Fotos werden
      // dann vom ErlegungSheet nach createSoloHunt hochgeladen.
      let uploadedCount = 0
      let failedCount = 0
      if (pendingPhotos.length > 0 && huntId && userId) {
        const { uploaded, failed } = await uploadPendingPhotosForHunt({
          huntId,
          killIds,
          photos: pendingPhotos,
          userId,
          onProgress: (current, total) => setUploadProgress({ current, total }),
          onItemError: (i, total, err) => {
            showToast(
              `Foto ${i + 1} von ${total} fehlgeschlagen`,
              'warning',
              err instanceof Error ? err.message : 'Unbekannter Fehler',
            )
          },
        })
        uploadedCount = uploaded
        failedCount = failed
        setUploadProgress(null)
      }

      const total = pendingKills.length
      const uniqueArten = [...new Set(pendingKills.map(pk => pk.wild_art))]
      let subtext: string
      if (uniqueArten.length === 1) {
        const label = getWildArtLabelSingle(uniqueArten[0])
        subtext = total === 1 ? label : `${total}× ${label}`
      } else {
        subtext = `${total} Stück`
      }
      if (uploadedCount > 0) {
        subtext = `${subtext} · +${uploadedCount} Foto${uploadedCount === 1 ? '' : 's'}`
      }
      showToast(
        krankMode ? '🩹 Nachsuche gemeldet' : '🎯 Waidmannsheil!',
        failedCount > 0 ? 'warning' : 'success',
        subtext,
      )

      // Fotos, die der Parent ggf. noch hochladen muss (Auto-Solo-Hunt-Flow).
      // Im Gruppen-Flow (huntId vorhanden) wurden sie oben bereits hochgeladen
      // und wir reichen ein leeres Array weiter.
      const photosForParent = huntId ? [] : pendingPhotos
      setPendingPhotos([])

      // Router-Cache invalidieren — sonst sieht das Tagebuch (und die
      // Hunt-Strecke-Ansicht) den neuen Kill erst nach PWA-Neustart.
      // Im Auto-Solo-Hunt-Flow ruft der Parent (ErlegungSheet) zusätzlich
      // refresh nach createSoloHunt; doppelter Refresh ist harmlos.
      router.refresh()

      if (onKillSuccess) {
        onKillSuccess(killIds, photosForParent)
      } else {
        handleClose()
      }
    } catch (err) {
      console.error('[WildartPicker] batch insert failed', err)
      showToast('Fehler beim Melden', 'warning', err instanceof Error ? err.message : 'Unbekannter Fehler')
      setSubmitting(false)
      setUploadProgress(null)
    }
  }, [pendingKills, pendingPhotos, submitting, huntId, userId, krankMode, handleClose, onKillSuccess, router])

  // --- Anblick Confirm ---
  const handleConfirmSighting = useCallback(async () => {
    if (!selectedWildArt || submitting) return
    if (!position) {
      showToast('Warte auf GPS…', 'warning')
      return
    }
    setSubmitting(true)

    try {
      await insertSighting({
        species: selectedWildArt,
        count: sightingCount,
        huntId: sightingHuntId ?? null,
        location: { lat: position.lat, lng: position.lng },
      })

      const label = getWildArtLabelSingle(selectedWildArt)
      showToast(
        'Anblick gespeichert',
        'success',
        sightingCount === 1 ? label : `${sightingCount}× ${label}`,
      )

      // Router-Cache invalidieren, damit die AnblickCard im Tagebuch sofort
      // erscheint (Lehre aus Sprint 60.5a) — vor dem Schließen aufrufen.
      router.refresh()
      handleClose()
    } catch (err) {
      console.error('[WildartPicker] sighting insert failed', err)
      showToast('Fehler beim Speichern', 'warning', err instanceof Error ? err.message : 'Unbekannter Fehler')
      setSubmitting(false)
    }
  }, [selectedWildArt, sightingCount, position, sightingHuntId, submitting, handleClose, router])

  // --- Abgeleitete Werte ---
  const groupConfig = selectedGroup
    ? WILD_GROUP_CONFIG.find(g => g.group === selectedGroup)
    : null
  const groupDetails = selectedGroup
    ? WILD_GROUP_DETAILS[selectedGroup]
    : undefined
  const flatTiere = selectedGroup
    ? FLAT_GROUP_TIERE[selectedGroup]
    : undefined
  const altersklassen = groupDetails?.altersklassen ?? []

  const impliedForSelected = selectedWildArt
    ? altersklassen.find(a => a.value === selectedWildArt)?.impliedGeschlecht ?? null
    : null

  // --- Modus-abhängige Sticky-Bar-Sichtbarkeit ---
  const wildartSelected = selectedWildArt !== null
  // Toggle nur im sauberen Einstiegszustand: Stufe 1, nichts getippt, nichts selektiert
  const showToggle =
    !!onModeChange && step === 'group' && totalCount === 0 && !wildartSelected
  const showErlegungActions = mode === 'erlegung' && totalCount > 0
  const showSightingActions = mode === 'sighting' && wildartSelected
  const stickyVisible = showToggle || showErlegungActions || showSightingActions
  // Auswahl-Akzent: Erlegung = Moos-Grün (wie bisher), Anblick = Forest
  const selectAccent = mode === 'sighting' ? 'var(--forest)' : 'var(--green)'

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <SheetContent side="bottom" showCloseButton className="max-h-[85vh] gap-0">
        {/* Header */}
        <SheetHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {step !== 'group' && (
              <button
                onClick={handleBack}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <SheetTitle>
              {step === 'group' ? (
                'Wildart wählen'
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  {groupConfig && (() => {
                    const Icon = getGroupIcon(groupConfig.group)
                    return <Icon size={20} style={{ color: 'var(--accent-primary)' }} />
                  })()}
                  <span>{groupConfig?.label}</span>
                </span>
              )}
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 1rem 1rem' }}>
          {gpsLoading && step === 'group' && (
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-3)',
              marginBottom: '0.5rem',
              textAlign: 'center',
            }}>
              GPS-Position wird ermittelt…
            </div>
          )}

          {/* === Stufe 1: Wildgruppen-Grid === */}
          {step === 'group' && (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.625rem',
                marginTop: '0.25rem',
              }}>
                {WILD_GROUP_CONFIG.map(config => {
                  const Icon = getGroupIcon(config.group)
                  // Anblick-Modus: 'Sonstiges' bleibt auf Stufe 1 selektierbar
                  const groupTileSelected =
                    mode === 'sighting' && config.group === 'sonstiges'
                    && selectedWildArt === 'sonstiges'
                  return (
                  <button
                    key={config.group}
                    disabled={submitting}
                    onClick={() => handleGroupTap(config)}
                    onPointerDown={(e) => {
                      if (!e.isPrimary) return
                      handleGroupLongPressStart(config)
                    }}
                    onPointerUp={handleLongPressEnd}
                    onPointerCancel={handleLongPressEnd}
                    onPointerLeave={handleLongPressEnd}
                    style={{
                      ...noSelectStyle,
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.375rem',
                      padding: '0.75rem 0.25rem',
                      background: groupTileSelected ? 'var(--surface-3)' : 'var(--surface-2)',
                      border: '1px solid ' + (groupTileSelected ? selectAccent : 'var(--border)'),
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      minHeight: '4.5rem',
                      minWidth: '2.75rem',
                      touchAction: 'manipulation',
                      opacity: submitting ? 0.5 : 1,
                    }}
                  >
                    <CounterBadge count={
                      config.group === 'sonstiges'
                        ? countFor('sonstiges')
                        : countForGroup(config.group)
                    } />
                    <Icon size={32} style={{ color: 'var(--text)' }} />
                    <span style={{
                      fontSize: '0.6875rem',
                      color: 'var(--text-2)',
                      lineHeight: 1.2,
                    }}>
                      {config.label}
                    </span>
                  </button>
                  )
                })}
              </div>
              <p style={{
                fontSize: '0.625rem',
                color: 'var(--text-3)',
                textAlign: 'center',
                marginTop: '0.5rem',
              }}>
                Gedrückt halten = Schnellzähler
              </p>
            </>
          )}

          {/* === Stufe 2a: Detail (Schalenwild) === */}
          {step === 'detail' && groupDetails && (
            <div style={{ marginTop: '0.25rem' }}>
              {/* Altersklasse */}
              {altersklassen.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{
                    fontSize: '0.6875rem',
                    color: 'var(--text-3)',
                    marginBottom: '0.375rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Altersklasse
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {altersklassen.map(a => (
                      <button
                        key={a.value}
                        onClick={() => {
                          if (longPressFired.current) {
                            longPressFired.current = false
                            return
                          }
                          handleAltersklasseTap(a)
                        }}
                        onPointerDown={(e) => {
                          if (!e.isPrimary) return
                          handleAltersklasseLongPressStart(a)
                        }}
                        onPointerUp={handleLongPressEnd}
                        onPointerCancel={handleLongPressEnd}
                        onPointerLeave={handleLongPressEnd}
                        style={{
                          ...noSelectStyle,
                          position: 'relative',
                          padding: '0.5rem 1rem',
                          borderRadius: 'var(--radius)',
                          border: '2px solid ' + (selectedWildArt === a.value
                            ? selectAccent
                            : 'transparent'),
                          background: selectedWildArt === a.value
                            ? 'var(--surface-3)'
                            : 'var(--surface-2)',
                          boxShadow: selectedWildArt === a.value
                            ? 'none'
                            : 'inset 0 0 0 1px var(--border)',
                          color: selectedWildArt === a.value
                            ? 'var(--text)'
                            : 'var(--text-2)',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: selectedWildArt === a.value ? 600 : 400,
                          minHeight: '2.75rem',
                          transition: 'all 0.15s',
                          touchAction: 'manipulation',
                        }}
                      >
                        <CounterBadge count={countFor(a.value)} />
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <p style={{
                    fontSize: '0.625rem',
                    color: 'var(--text-3)',
                    marginTop: '0.375rem',
                  }}>
                    Gedrückt halten = Abziehen
                  </p>
                </div>
              )}

              {/* Geschlecht — immer sichtbar, gedämpft wenn keine Altersklasse gewählt */}
              {groupDetails.geschlechter && (() => {
                const isDimmed = selectedWildArt === null
                return (
                  <div style={{
                    opacity: isDimmed ? 0.4 : 1,
                    transition: 'opacity 0.15s ease',
                    pointerEvents: isDimmed ? 'none' : 'auto',
                  }}>
                    <div style={{
                      fontSize: '0.6875rem',
                      color: 'var(--text-3)',
                      marginBottom: '0.375rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Geschlecht
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {groupDetails.geschlechter.map(g => {
                        const isLocked = !isDimmed && impliedForSelected !== null && impliedForSelected !== g.value
                        const isActive = !isDimmed && selectedGeschlecht === g.value

                        return (
                          <button
                            key={g.value}
                            onClick={() => { if (!isLocked) handleGeschlechtSelect(g.value) }}
                            style={{
                              flex: 1,
                              padding: '0.625rem',
                              borderRadius: 'var(--radius)',
                              border: '2px solid ' + (isActive
                                ? 'var(--green)'
                                : 'transparent'),
                              background: isActive
                                ? 'var(--surface-3)'
                                : 'var(--surface-2)',
                              boxShadow: isActive
                                ? 'none'
                                : 'inset 0 0 0 1px var(--border)',
                              color: isActive
                                ? 'var(--text)'
                                : 'var(--text-2)',
                              cursor: isLocked ? 'not-allowed' : 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: isActive ? 600 : 400,
                              minHeight: '2.75rem',
                              transition: 'all 0.15s',
                              opacity: isLocked ? 0.35 : 1,
                              pointerEvents: isLocked ? 'none' : 'auto',
                            }}
                          >
                            {g.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* === Stufe 2b: Flat (Raubwild/Hasenartig/Federwild) === */}
          {step === 'flat' && flatTiere && (
            <div style={{ marginTop: '0.25rem' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.625rem',
              }}>
                {flatTiere.map(tier => {
                  // Anblick-Modus: Single-Select markiert die getippte Wildart
                  const flatTileSelected =
                    mode === 'sighting' && selectedWildArt === tier.value
                  return (
                  <button
                    key={tier.value}
                    disabled={submitting}
                    onClick={() => handleFlatTierTap(tier.value)}
                    onPointerDown={(e) => {
                      if (!e.isPrimary) return
                      handleFlatLongPressStart(tier.value)
                    }}
                    onPointerUp={handleLongPressEnd}
                    onPointerCancel={handleLongPressEnd}
                    onPointerLeave={handleLongPressEnd}
                    style={{
                      ...noSelectStyle,
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.75rem 0.5rem',
                      background: flatTileSelected ? 'var(--surface-3)' : 'var(--surface-2)',
                      border: flatTileSelected
                        ? '2px solid ' + selectAccent
                        : '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      minHeight: '2.75rem',
                      touchAction: 'manipulation',
                      opacity: submitting ? 0.5 : 1,
                      fontSize: '0.875rem',
                      fontWeight: flatTileSelected ? 600 : 400,
                      color: 'var(--text)',
                    }}
                  >
                    <CounterBadge count={countFor(tier.value)} />
                    {tier.label}
                  </button>
                  )
                })}
              </div>
              <p style={{
                fontSize: '0.625rem',
                color: 'var(--text-3)',
                textAlign: 'center',
                marginTop: '0.5rem',
              }}>
                Gedrückt halten = Abziehen
              </p>
            </div>
          )}
        </div>

        {/* === Sticky Bottom Bar — immer gerendert, visibility steuert Sichtbarkeit ===
            Drei sich gegenseitig ausschließende Zustände:
            Modus-Toggle (sauberer Einstieg) · Erlegung-Aktionen · Anblick-Aktionen */}
        <div style={{
          borderTop: stickyVisible ? '1px solid var(--border)' : '1px solid transparent',
          padding: '0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom))',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          visibility: stickyVisible ? 'visible' : 'hidden',
        }}>
            {/* --- Modus-Toggle: kompaktes Segmented Control --- */}
            {showToggle && (
              <div style={{
                display: 'flex',
                flex: 1,
                gap: '0.1875rem',
                padding: '0.1875rem',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: '0.625rem',
              }}>
                {([
                  { value: 'erlegung' as const, label: 'Erlegung', accent: 'var(--green)' },
                  { value: 'sighting' as const, label: 'Nur gesehen', accent: 'var(--forest)' },
                ]).map(opt => {
                  const active = mode === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleModeChange(opt.value)}
                      style={{
                        flex: 1,
                        minHeight: '2.75rem',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        background: active ? opt.accent : 'transparent',
                        color: active ? 'var(--text)' : 'var(--text-2)',
                        fontSize: '0.875rem',
                        fontWeight: active ? 600 : 500,
                        cursor: 'pointer',
                        transition: 'background 0.15s, color 0.15s',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* --- Erlegung-Aktionen (unverändert gegenüber Sprint 60.5d) --- */}
            {showErlegungActions && (
              <>
            {/* Krank-Toggle */}
            <button
              onClick={() => setKrankMode(m => !m)}
              style={{
                padding: '0.5rem 0.75rem',
                background: krankMode ? 'rgba(255,143,0,0.15)' : 'transparent',
                color: krankMode ? 'var(--orange)' : 'var(--text-2)',
                border: `1px solid ${krankMode ? 'var(--orange)' : 'var(--border)'}`,
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                minHeight: '2.75rem',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              🩹 Krank
            </button>

            {/* Reset */}
            <button
              onClick={() => { setPendingKills([]); setPendingPhotos([]) }}
              aria-label="Alle Counter zurücksetzen"
              style={{
                padding: '0.5rem 0.75rem',
                background: 'transparent',
                color: 'var(--text-2)',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                minHeight: '2.75rem',
                WebkitTapHighlightColor: 'transparent',
              }}
            >↻</button>

            {/* Foto — im Auto-Solo-Hunt-Flow (huntId === null) übernimmt
                ErlegungSheet den Upload nach createSoloHunt. */}
            <PhotoCapture
              quality="documentation"
              mode="camera"
              disabled={photoUploading || submitting}
              onCapture={handlePhotoBuffer}
              onError={handlePhotoError}
            >
              <button
                type="button"
                aria-label="Foto hinzufügen"
                disabled={photoUploading || submitting}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: pendingPhotos.length > 0 ? 'rgba(107,159,58,0.15)' : 'transparent',
                  color: pendingPhotos.length > 0 ? 'var(--green)' : 'var(--text-2)',
                  border: `1px solid ${pendingPhotos.length > 0 ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  minHeight: '2.75rem',
                  opacity: (photoUploading || submitting) ? 0.5 : 1,
                  WebkitTapHighlightColor: 'transparent',
                  cursor: (photoUploading || submitting) ? 'not-allowed' : 'pointer',
                }}
              >
                📸{pendingPhotos.length > 0 ? ` (${pendingPhotos.length})` : ''}
              </button>
            </PhotoCapture>

            {/* Melden — dominant */}
            <button
              onClick={handleConfirmBatch}
              disabled={submitting}
              className="btn-primary-tap"
              style={{
                flex: 1,
                padding: '0.875rem 1rem',
                background: krankMode ? 'var(--orange)' : 'var(--green)',
                color: 'var(--text)',
                border: 'none',
                borderRadius: '0.75rem',
                fontSize: '1rem',
                fontWeight: 600,
                minHeight: '2.75rem',
                opacity: submitting ? 0.6 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {submitting
                ? (uploadProgress
                    ? `Lade Foto ${uploadProgress.current}/${uploadProgress.total}…`
                    : 'Melde…')
                : `${totalCount} Stück ${krankMode ? 'krank ' : ''}melden`}
            </button>
              </>
            )}

            {/* --- Anblick-Aktionen: Count-Stepper + Speichern --- */}
            {showSightingActions && (
              <>
                {/* Count-Stepper [−] N [+] */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => setSightingCount(c => Math.max(1, c - 1))}
                    disabled={submitting || sightingCount <= 1}
                    aria-label="Anzahl verringern"
                    style={{
                      minWidth: '2.75rem',
                      minHeight: '2.75rem',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text)',
                      fontSize: '1.25rem',
                      lineHeight: 1,
                      cursor: (submitting || sightingCount <= 1) ? 'not-allowed' : 'pointer',
                      opacity: (submitting || sightingCount <= 1) ? 0.35 : 1,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >−</button>
                  <span style={{
                    minWidth: '2.25rem',
                    textAlign: 'center',
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: 'var(--text)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{sightingCount}</span>
                  <button
                    onClick={() => setSightingCount(c => Math.min(99, c + 1))}
                    disabled={submitting || sightingCount >= 99}
                    aria-label="Anzahl erhöhen"
                    style={{
                      minWidth: '2.75rem',
                      minHeight: '2.75rem',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text)',
                      fontSize: '1.25rem',
                      lineHeight: 1,
                      cursor: (submitting || sightingCount >= 99) ? 'not-allowed' : 'pointer',
                      opacity: (submitting || sightingCount >= 99) ? 0.35 : 1,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >+</button>
                </div>

                {/* Anblick speichern — dominant, Forest */}
                <button
                  onClick={handleConfirmSighting}
                  disabled={submitting}
                  className="btn-primary-tap"
                  style={{
                    flex: 1,
                    padding: '0.875rem 1rem',
                    background: 'var(--forest)',
                    color: 'var(--text)',
                    border: 'none',
                    borderRadius: '0.75rem',
                    fontSize: '1rem',
                    fontWeight: 600,
                    minHeight: '2.75rem',
                    opacity: submitting ? 0.6 : 1,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {submitting ? 'Speichere…' : 'Anblick speichern'}
                </button>
              </>
            )}
          </div>
      </SheetContent>
    </Sheet>
  )
}
