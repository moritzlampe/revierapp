'use client'

import { useEffect, useState } from 'react'
import { BaseFieldSheet } from './BaseFieldSheet'
import { updateWildEvent } from '@/lib/erlegung/updateWildEvent'

export type GenderValue = 'male' | 'female' | null

export type GenderSheetProps = {
  open: boolean
  currentValue: GenderValue
  wildEventId: string
  onSaved: () => void
  onCancel: () => void
}

const OPTIONS: { value: 'male' | 'female'; label: string }[] = [
  { value: 'male', label: 'Männlich' },
  { value: 'female', label: 'Weiblich' },
]

/**
 * Edit sheet for wild_events.gender.
 *
 * Binary value set ('male' | 'female'). There is no "Unknown" pill — NULL is
 * semantically "unknown". Tapping the currently-active pill deselects it,
 * which sets selectedValue back to null. Saving then writes NULL to the DB.
 */
export function GenderSheet({
  open,
  currentValue,
  wildEventId,
  onSaved,
  onCancel,
}: GenderSheetProps) {
  const [selected, setSelected] = useState<GenderValue>(currentValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  // Reset local state whenever the sheet opens with a fresh row.
  useEffect(() => {
    if (open) {
      setSelected(currentValue)
      setError(undefined)
    }
  }, [open, currentValue])

  const togglePill = (value: 'male' | 'female') => {
    // Tap-to-deselect: tapping the active pill again clears the selection.
    setSelected((prev) => (prev === value ? null : value))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(undefined)
    const { error: updateError } = await updateWildEvent(wildEventId, {
      gender: selected,
    })
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onSaved()
  }

  // Save stays enabled even when nothing changed — keeps UX predictable
  // (user explicitly chose to confirm). Only blocked during the pending call.
  return (
    <BaseFieldSheet
      open={open}
      title="Geschlecht"
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      errorMessage={error}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
        }}
      >
        {OPTIONS.map((opt) => {
          const active = selected === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => togglePill(opt.value)}
              disabled={saving}
              aria-pressed={active}
              style={{
                minHeight: '3rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.875rem',
                background: active ? 'var(--bronze)' : 'var(--surface-2)',
                border: active
                  ? '1px solid var(--bronze)'
                  : '1px solid var(--border)',
                color: active ? '#ffffff' : 'var(--text)',
                fontSize: '0.9375rem',
                fontWeight: active ? 700 : 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Inline hint about the tap-to-deselect semantics — surfaces the
          otherwise hidden "set back to unknown" gesture without an extra link. */}
      <p
        style={{
          marginTop: '1rem',
          fontSize: '0.75rem',
          color: 'var(--text-3)',
          lineHeight: 1.5,
        }}
      >
        Aktive Auswahl erneut tippen, um auf „unbekannt" zurückzusetzen.
      </p>
    </BaseFieldSheet>
  )
}
