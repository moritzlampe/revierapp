'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BaseFieldSheet } from './BaseFieldSheet'
import { updateWildEvent, validateWildEventUpdate } from '@/lib/erlegung/updateWildEvent'

export type WeightSheetProps = {
  open: boolean
  currentValue: number | null
  wildEventId: string
  onSaved: () => void
  onCancel: () => void
}

/**
 * Edit sheet for wild_events.weight_estimate_kg.
 *
 * Decimal input (one decimal place). Empty string saves NULL. Range guard
 * 0.1–300 kg matches validateWildEventUpdate; inline error surfaces below
 * the input while the Save button stays disabled until the value is valid.
 */
export function WeightSheet({
  open,
  currentValue,
  wildEventId,
  onSaved,
  onCancel,
}: WeightSheetProps) {
  // Local input as string so the user can type freely (including empty / "0.").
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

  // Parse the local string into the patch value (null when empty).
  const parsed = useMemo<{ value: number | null; valid: boolean; error: string | null }>(() => {
    const trimmed = raw.trim().replace(',', '.')
    if (trimmed === '') return { value: null, valid: true, error: null }
    const num = Number(trimmed)
    if (!Number.isFinite(num)) {
      return { value: null, valid: false, error: 'Gewicht muss eine Zahl sein.' }
    }
    const validationError = validateWildEventUpdate({ weight_estimate_kg: num })
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
      weight_estimate_kg: parsed.value,
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
      title="Gewicht"
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      saveDisabled={!parsed.valid}
      errorMessage={serverError}
    >
      <label
        htmlFor="weight-input"
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
        Geschätztes Gewicht
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
          id="weight-input"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0.1"
          max="300"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onFocus={handleFocus}
          disabled={saving}
          placeholder="0,0"
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
          kg
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
        Leer lassen, um das Gewicht auf „unbekannt" zurückzusetzen.
      </p>
    </BaseFieldSheet>
  )
}
