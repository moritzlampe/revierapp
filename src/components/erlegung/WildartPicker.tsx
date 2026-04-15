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
import { insertKill } from '@/lib/erlegung/insertKill'
import { showToast } from '@/lib/erlegung/toast'
import type { KillStatus } from '@/lib/types/kill'

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

interface WildartPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  position?: { lat: number; lng: number } | null
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
  onSuccess,
  gpsLoading,
  noHuntHint,
}: WildartPickerProps) {
  const [step, setStep] = useState<'group' | 'detail' | 'flat'>('group')
  const [selectedGroup, setSelectedGroup] = useState<WildGroup | null>(null)
  const [selectedGeschlecht, setSelectedGeschlecht] = useState<Geschlecht | null>(null)
  const [selectedWildArt, setSelectedWildArt] = useState<WildArt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [krankToggle, setKrankToggle] = useState(false)

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
      setKrankToggle(false)
    }
  }, [open])

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // --- Insert ---
  const doInsert = useCallback(async (
    wildArt: WildArt,
    geschlecht: Geschlecht | null,
    status: KillStatus,
  ) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const killId = await insertKill({
        wildArt,
        geschlecht,
        position,
        huntId,
        status,
      })

      if (status === 'wounded') {
        showToast('Krank gemeldet', 'warning', 'Nachsuche im Nachsuche-Tab anlegen')
      } else {
        const group = WILD_ART_TO_GROUP[wildArt]
        const gc = WILD_GROUP_CONFIG.find(g => g.group === group)
        if (position) {
          showToast(`${gc?.emoji ?? '🎯'} Waidmannsheil!`, 'success', getWildArtLabel(wildArt))
        } else {
          showToast(`${gc?.emoji ?? '🎯'} Waidmannsheil!`, 'success', 'Ohne GPS-Position gespeichert')
        }
      }

      onSuccess?.(killId)
      handleClose()
    } catch (err) {
      console.error('Erlegung melden fehlgeschlagen:', err)
      showToast('Fehler beim Melden', 'warning', String(err))
      setSubmitting(false)
    }
  }, [submitting, position, huntId, onSuccess, handleClose])

  // --- Wildgruppen-Tile: Tap ---
  const handleGroupTap = useCallback((config: WildGroupConfig) => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (config.group === 'sonstiges') {
      doInsert('sonstiges', null, 'harvested')
      return
    }
    if (config.hasGeschlecht) {
      setSelectedGroup(config.group)
      setSelectedWildArt(null)
      setStep('detail')
    } else if (FLAT_GROUP_TIERE[config.group]) {
      setSelectedGroup(config.group)
      setStep('flat')
    }
  }, [doInsert])

  // --- Wildgruppen-Tile: Long-Press ---
  const handleLongPressStart = useCallback((config: WildGroupConfig) => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      if (config.unspezValue) {
        doInsert(config.unspezValue, null, 'harvested')
      } else if (FLAT_GROUP_TIERE[config.group]) {
        setSelectedGroup(config.group)
        setStep('flat')
      }
      if (navigator.vibrate) navigator.vibrate(50)
    }, 500)
  }, [doInsert])

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // --- Detail: Geschlecht (manuell) ---
  const handleGeschlechtSelect = useCallback((g: Geschlecht) => {
    setSelectedGeschlecht(prev => prev === g ? null : g)
  }, [])

  // --- Detail: Altersklasse (mit Auto-Geschlecht-Inferenz) ---
  const handleAltersklasseTap = useCallback((entry: AltersklasseEntry) => {
    setSelectedWildArt(prev => prev === entry.value ? null : entry.value)
    if (entry.impliedGeschlecht) {
      setSelectedGeschlecht(entry.impliedGeschlecht)
    }
    // Wenn impliedGeschlecht null: selectedGeschlecht NICHT überschreiben
  }, [])

  // --- Detail: Bestätigen ---
  const handleDetailConfirm = useCallback((status: KillStatus) => {
    if (!selectedGroup) return
    const gc = WILD_GROUP_CONFIG.find(g => g.group === selectedGroup)
    const wildArt = selectedWildArt ?? gc?.unspezValue ?? ('sonstiges' as WildArt)
    doInsert(wildArt, selectedGeschlecht, status)
  }, [selectedGroup, selectedWildArt, selectedGeschlecht, doInsert])

  // --- Flat: Tier-Tap ---
  const handleFlatTierTap = useCallback((wildArt: WildArt) => {
    doInsert(wildArt, null, krankToggle ? 'wounded' : 'harvested')
  }, [doInsert, krankToggle])

  // --- Zurück ---
  const handleBack = useCallback(() => {
    setStep('group')
    setSelectedGroup(null)
    setSelectedGeschlecht(null)
    setSelectedWildArt(null)
    setKrankToggle(false)
  }, [])

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

  // Helper: Geschlecht-Implikation für aktuell gewählte Altersklasse
  const impliedForSelected = selectedWildArt
    ? altersklassen.find(a => a.value === selectedWildArt)?.impliedGeschlecht ?? null
    : null

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <SheetContent side="bottom" showCloseButton>
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

        <div style={{ padding: '0 1rem 1.5rem' }}>
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
                      handleLongPressStart(config)
                    }}
                    onPointerUp={handleLongPressEnd}
                    onPointerCancel={handleLongPressEnd}
                    onPointerLeave={handleLongPressEnd}
                    style={{
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
                      WebkitTapHighlightColor: 'transparent',
                      userSelect: 'none',
                      touchAction: 'manipulation',
                      opacity: submitting ? 0.5 : 1,
                    }}
                  >
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
                Gedrückt halten = direkt melden
              </p>
            </>
          )}

          {/* === Stufe 2a: Detail (Schalenwild) === */}
          {step === 'detail' && groupDetails && (
            <div style={{ marginTop: '0.25rem' }}>
              {/* Altersklasse (OBEN — flache Liste, sofort sichtbar) */}
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
                        onClick={() => handleAltersklasseTap(a)}
                        style={{
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
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Geschlecht (DARUNTER — immer sichtbar, auto-locked bei Implikation) */}
              {groupDetails.geschlechter && (
                <div style={{ marginBottom: '1rem' }}>
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

              {/* Krank geschossen */}
              <button
                disabled={submitting || !selectedWildArt}
                onClick={() => handleDetailConfirm('wounded')}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--orange)',
                  background: 'transparent',
                  color: 'var(--orange)',
                  cursor: !selectedWildArt ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  marginBottom: '0.5rem',
                  minHeight: '2.75rem',
                  opacity: submitting || !selectedWildArt ? 0.5 : 1,
                }}
              >
                ⚠ Krank geschossen
              </button>

              {/* Erlegung melden */}
              <button
                disabled={submitting || !selectedWildArt}
                onClick={() => handleDetailConfirm('harvested')}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  borderRadius: 'var(--radius)',
                  border: 'none',
                  background: 'var(--green)',
                  color: '#fff',
                  cursor: !selectedWildArt ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                  minHeight: '2.75rem',
                  opacity: submitting || !selectedWildArt ? 0.5 : 1,
                }}
              >
                {submitting ? 'Wird gemeldet…' : '✓ Erlegung melden'}
              </button>
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.75rem 0.5rem',
                      background: krankToggle
                        ? 'rgba(255,143,0,0.1)'
                        : 'var(--surface-2)',
                      border: krankToggle
                        ? '1px solid var(--orange)'
                        : '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      minHeight: '2.75rem',
                      WebkitTapHighlightColor: 'transparent',
                      opacity: submitting ? 0.5 : 1,
                      fontSize: '0.875rem',
                      color: 'var(--text)',
                    }}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>

              {/* Krank geschossen Toggle */}
              <button
                onClick={() => setKrankToggle(prev => !prev)}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  borderRadius: 'var(--radius)',
                  border: krankToggle
                    ? '2px solid var(--orange)'
                    : '1px solid var(--border)',
                  background: krankToggle
                    ? 'rgba(255,143,0,0.15)'
                    : 'transparent',
                  color: krankToggle
                    ? 'var(--orange)'
                    : 'var(--text-3)',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  marginTop: '0.75rem',
                  minHeight: '2.75rem',
                  transition: 'all 0.15s',
                }}
              >
                {krankToggle ? '⚠ Krank geschossen (aktiv)' : '⚠ Krank geschossen'}
              </button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
