'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BaseFieldSheet } from './BaseFieldSheet'
import { updateWildEvent, validateWildEventUpdate } from '@/lib/erlegung/updateWildEvent'

export type DistanceSheetProps = {
  open: boolean
  currentValue: number | null
  wildEventId: string
  onSaved: () => void
  onCancel: () => void
}

/**
 * Edit sheet for wild_events.distance_m.
 *
 * Integer input. Empty string saves NULL. Range guard 0–500 m matches
 * validateWildEventUpdate; decimal entries also fail validation because the
 * DB column is integer.
 */
export function DistanceSheet({
  open,
  currentValue,
  wildEventId,
  onSaved,
  onCancel,
}: DistanceSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState<string>(currentValue !== null ? String(currentValue) : '')
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | undefined>(undefined)

  // iOS Safari overlaps the input with the on-screen keyboard. Wait for the
  // keyboard slide-in (~300ms), then scroll the input into the center of the
  // visible viewport so the user can see what they type. Ansatz A.
  const handleFocus = () => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 300)
  }

  useEffect(() => {
    if (open) {
      setRaw(currentValue !== null ? String(currentValue) : '')
      setServerError(undefined)
    }
  }, [open, currentValue])

  const parsed = useMemo<{ value: number | null; valid: boolean; error: string | null }>(() => {
    const trimmed = raw.trim()
    if (trimmed === '') return { value: null, valid: true, error: null }
    // Numeric inputMode never produces a comma in practice, but be defensive.
    const num = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(num)) {
      return { value: null, valid: false, error: 'Entfernung muss eine Zahl sein.' }
    }
    const validationError = validateWildEventUpdate({ distance_m: num })
    if (validationError !== null) {
      return { value: num, valid: false, error: validationError }
    }
    return { value: num, valid: true, error: null }
  }, [raw])

  const handleSave = async () => {
    if (!parsed.valid) return
    setSaving(true)
    setServerError(undefined)
    const { error: updateError } = await updateWildEvent(wildEventId, {
      distance_m: parsed.value,
    })
    setSaving(false)
    if (updateError) {
      setServerError(updateError.message)
      return
    }
    onSaved()
  }

  const showInlineError = !parsed.valid && raw.trim() !== ''

  return (
    <BaseFieldSheet
      open={open}
      title="Entfernung"
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      saveDisabled={!parsed.valid}
      errorMessage={serverError}
    >
      <label
        htmlFor="distance-input"
        style={{
          display: 'block',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-2)',
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.03125rem',
        }}
      >
        Geschätzte Entfernung
      </label>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <input
          ref={inputRef}
          id="distance-input"
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          max="500"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onFocus={handleFocus}
          disabled={saving}
          placeholder="0"
          autoFocus
          style={{
            width: '100%',
            background: 'var(--surface-2)',
            border: showInlineError ? '1.5px solid var(--danger)' : '1.5px solid var(--border)',
            borderRadius: '0.75rem',
            padding: '0.875rem 3rem 0.875rem 1rem',
            color: 'var(--text)',
            fontSize: '1.125rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '1rem',
            color: 'var(--text-3)',
            fontSize: '0.9375rem',
            fontWeight: 500,
            pointerEvents: 'none',
          }}
        >
          m
        </span>
      </div>

      {showInlineError && (
        <p
          role="alert"
          style={{
            marginTop: '0.5rem',
            fontSize: '0.8125rem',
            color: 'var(--danger)',
            lineHeight: 1.4,
          }}
        >
          {parsed.error}
        </p>
      )}

      <p
        style={{
          marginTop: '0.75rem',
          fontSize: '0.75rem',
          color: 'var(--text-3)',
          lineHeight: 1.5,
        }}
      >
        Leer lassen, um die Entfernung auf „unbekannt" zurückzusetzen.
      </p>
    </BaseFieldSheet>
  )
}
