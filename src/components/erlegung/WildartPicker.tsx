'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ArrowLeft } from 'lucide-react'
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
import { insertKillBatch } from '@/lib/erlegung/insertKill'
import { showToast } from '@/lib/erlegung/toast'

const noSelectStyle: React.CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  WebkitTapHighlightColor: 'transparent',
}

function getWildArtLabel(wildArt: WildArt): string {
  for (const details of Object.values(WILD_GROUP_DETAILS)) {
    if (!details) continue
    const found = details.altersklassen.find(a => a.value === wildArt)
    if (found) return found.label
  }
  for (const list of Object.values(FLAT_GROUP_TIERE)) {
    const found = list?.find(a => a.value === wildArt)
    if (found) return found.label
  }
  const group = WILD_GROUP_CONFIG.find(g => g.unspezValue === wildArt)
  if (group) return group.label
  return wildArt
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
      color: '#fff',
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

interface WildartPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  position?: { lat: number; lng: number; accuracy?: number; captured_at?: string } | null
  huntId?: string | null
  onSuccess?: (killId: string) => void
  gpsLoading?: boolean
  noHuntHint?: boolean
}

export function WildartPicker({
  open,
  onOpenChange,
  position = null,
  huntId = null,
  gpsLoading,
  noHuntHint,
}: WildartPickerProps) {
  const [step, setStep] = useState<'group' | 'detail' | 'flat'>('group')
  const [selectedGroup, setSelectedGroup] = useState<WildGroup | null>(null)
  const [selectedGeschlecht, setSelectedGeschlecht] = useState<Geschlecht | null>(null)
  const [selectedWildArt, setSelectedWildArt] = useState<WildArt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [krankMode, setKrankMode] = useState(false)
  const [pendingKills, setPendingKills] = useState<PendingKill[]>([])

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

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
    }
  }, [open])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

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
      addPendingKill('sonstiges', null)
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
  }, [addPendingKill])

  // --- Stufe 1: Wildgruppen-Tile: Long-Press ---
  const handleGroupLongPressStart = useCallback((config: WildGroupConfig) => {
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
  }, [addPendingKill])

  // --- Stufe 2a: Geschlecht (manuell) ---
  const handleGeschlechtSelect = useCallback((g: Geschlecht) => {
    setSelectedGeschlecht(prev => prev === g ? null : g)
  }, [])

  // --- Stufe 2a: Altersklasse Tap (addiert zum Counter) ---
  const handleAltersklasseTap = useCallback((entry: AltersklasseEntry) => {
    const geschlecht = entry.impliedGeschlecht ?? selectedGeschlecht
    addPendingKill(entry.value, geschlecht)
    if (entry.impliedGeschlecht) {
      setSelectedGeschlecht(entry.impliedGeschlecht)
    }
    setSelectedWildArt(entry.value)
  }, [selectedGeschlecht, addPendingKill])

  // --- Stufe 2a: Altersklasse Long-Press (Decrement) ---
  const handleAltersklasseLongPressStart = useCallback((entry: AltersklasseEntry) => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      removePendingKillByWildArt(entry.value)
    }, 500)
  }, [removePendingKillByWildArt])

  // --- Stufe 2b: Flat Tier Tap (addiert zum Counter) ---
  const handleFlatTierTap = useCallback((wildArt: WildArt) => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    addPendingKill(wildArt, null)
  }, [addPendingKill])

  // --- Stufe 2b: Flat Tier Long-Press (Decrement) ---
  const handleFlatLongPressStart = useCallback((wildArt: WildArt) => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      removePendingKillByWildArt(wildArt)
    }, 500)
  }, [removePendingKillByWildArt])

  // --- Zurück (pendingKills + krankMode bleiben erhalten) ---
  const handleBack = useCallback(() => {
    setStep('group')
    setSelectedGroup(null)
    setSelectedGeschlecht(null)
    setSelectedWildArt(null)
  }, [])

  // --- Batch Confirm ---
  const handleConfirmBatch = useCallback(async () => {
    if (pendingKills.length === 0 || submitting) return
    setSubmitting(true)

    try {
      await insertKillBatch({
        items: pendingKills.map(pk => ({
          wild_art: pk.wild_art,
          geschlecht: pk.geschlecht,
          position: pk.position,
          erlegt_am: pk.tapped_at,
        })),
        huntId,
        status: krankMode ? 'wounded' : 'harvested',
      })

      const total = pendingKills.length
      const uniqueArten = [...new Set(pendingKills.map(pk => pk.wild_art))]
      let subtext: string
      if (uniqueArten.length === 1) {
        const label = getWildArtLabel(uniqueArten[0])
        subtext = total === 1 ? label : `${total}× ${label}`
      } else {
        subtext = `${total} Stück`
      }
      showToast(
        krankMode ? '🩹 Nachsuche gemeldet' : '🎯 Waidmannsheil!',
        'success',
        subtext,
      )

      handleClose()
    } catch (err) {
      console.error('[WildartPicker] batch insert failed', err)
      showToast('Fehler beim Melden', 'warning', err instanceof Error ? err.message : 'Unbekannter Fehler')
      setSubmitting(false)
    }
  }, [pendingKills, submitting, huntId, krankMode, handleClose])

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
              {step === 'group'
                ? 'Wildart wählen'
                : `${groupConfig?.emoji} ${groupConfig?.label}`}
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 1rem 1rem' }}>
          {/* Info-Banner */}
          {noHuntHint && step === 'group' && (
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--orange)',
              background: 'rgba(255,143,0,0.1)',
              borderRadius: 'var(--radius)',
              padding: '0.5rem 0.75rem',
              marginBottom: '0.75rem',
            }}>
              Ohne aktive Jagd — Erlegung wird ohne Hunt-Bezug gespeichert.
            </div>
          )}
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
                {WILD_GROUP_CONFIG.map(config => (
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
                      gap: '0.25rem',
                      padding: '0.75rem 0.25rem',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
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
                    <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>
                      {config.emoji}
                    </span>
                    <span style={{
                      fontSize: '0.6875rem',
                      color: 'var(--text-2)',
                      lineHeight: 1.2,
                    }}>
                      {config.label}
                    </span>
                  </button>
                ))}
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
                          border: selectedWildArt === a.value
                            ? '2px solid var(--green)'
                            : '1px solid var(--border)',
                          background: selectedWildArt === a.value
                            ? 'var(--surface-3)'
                            : 'var(--surface-2)',
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

              {/* Geschlecht */}
              {groupDetails.geschlechter && (
                <div>
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
                      const isLocked = impliedForSelected !== null && impliedForSelected !== g.value
                      const isActive = selectedGeschlecht === g.value

                      return (
                        <button
                          key={g.value}
                          onClick={() => { if (!isLocked) handleGeschlechtSelect(g.value) }}
                          style={{
                            flex: 1,
                            padding: '0.625rem',
                            borderRadius: 'var(--radius)',
                            border: isActive
                              ? '2px solid var(--green)'
                              : '1px solid var(--border)',
                            background: isActive
                              ? 'var(--surface-3)'
                              : 'var(--surface-2)',
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
              )}
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
                {flatTiere.map(tier => (
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
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      minHeight: '2.75rem',
                      touchAction: 'manipulation',
                      opacity: submitting ? 0.5 : 1,
                      fontSize: '0.875rem',
                      color: 'var(--text)',
                    }}
                  >
                    <CounterBadge count={countFor(tier.value)} />
                    {tier.label}
                  </button>
                ))}
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

        {/* === Sticky Bottom Bar === */}
        {totalCount > 0 && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom))',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
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
              onClick={() => setPendingKills([])}
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

            {/* Melden — dominant */}
            <button
              onClick={handleConfirmBatch}
              disabled={submitting}
              style={{
                flex: 1,
                padding: '0.875rem 1rem',
                background: krankMode ? 'var(--orange)' : 'var(--green)',
                color: '#fff',
                border: 'none',
                borderRadius: '0.75rem',
                fontSize: '1rem',
                fontWeight: 600,
                minHeight: '2.75rem',
                opacity: submitting ? 0.6 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {submitting ? 'Melde…' : `${totalCount} Stück ${krankMode ? 'krank ' : ''}melden`}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
