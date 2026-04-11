'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ObjektType } from '@/lib/types/revier'

const TYPE_LABELS: Record<ObjektType, string> = {
  hochsitz: 'Hochsitz',
  kanzel: 'Kanzel',
  drueckjagdstand: 'Drückjagdbock',
  parkplatz: 'Parkplatz',
  kirrung: 'Kirrung',
  salzlecke: 'Salzlecke',
  wildkamera: 'Wildkamera',
  sonstiges: 'Sonstiges',
}

type Props = {
  type: ObjektType
  position: [number, number] // [lat, lng]
  districtId: string
  userId: string
  name: string
  description: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onSaved: () => void
  onBack: () => void
  onDiscard: () => void
}

export default function ObjektEditSheet({
  type,
  position,
  districtId,
  userId,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onSaved,
  onBack,
  onDiscard,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const ewkt = `SRID=4326;POINT(${position[1]} ${position[0]})`

    const { error: insertError } = await supabase
      .from('map_objects')
      .insert({
        district_id: districtId,
        type,
        name: name.trim(),
        description: description.trim() || null,
        position: ewkt,
        created_by: userId,
      })

    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    onSaved()
  }, [name, description, type, position, districtId, userId, onSaved])

  const typeLabel = TYPE_LABELS[type] || type

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onDiscard} />
      <div className="map-object-sheet" style={{ paddingBottom: '1rem', maxHeight: '70dvh' }}>
        <div className="sheet-handle" />
        <div className="sheet-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-2)',
              fontSize: '1.125rem',
              cursor: 'pointer',
              padding: '0.25rem',
              lineHeight: 1,
            }}
          >
            ←
          </button>
          Neuer {typeLabel}
        </div>
        <div style={{ padding: '0.75rem 1rem', overflowY: 'auto' }}>
          {/* Name */}
          <label style={{
            display: 'block',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-2)',
            marginBottom: '0.375rem',
          }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            autoFocus
            placeholder="z.B. Eicheneck"
            style={{
              width: '100%',
              padding: '0.625rem 0.75rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '0.625rem',
              color: 'var(--text)',
              fontSize: '0.9375rem',
              marginBottom: '0.75rem',
            }}
          />

          {/* Beschreibung */}
          <label style={{
            display: 'block',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-2)',
            marginBottom: '0.375rem',
          }}>
            Beschreibung (optional)
          </label>
          <textarea
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            placeholder="z.B. Am Waldrand, 4m"
            rows={2}
            style={{
              width: '100%',
              padding: '0.625rem 0.75rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '0.625rem',
              color: 'var(--text)',
              fontSize: '0.875rem',
              resize: 'none',
              marginBottom: '0.75rem',
            }}
          />

          {error && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--red)', marginBottom: '0.75rem' }}>
              {error}
            </p>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onDiscard}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-2)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: '2.75rem',
              }}
            >
              Verwerfen
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: !name.trim() || saving ? 'var(--green-dim)' : 'var(--green)',
                border: 'none',
                borderRadius: 'var(--radius)',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: !name.trim() || saving ? 'default' : 'pointer',
                opacity: !name.trim() || saving ? 0.5 : 1,
                minHeight: '2.75rem',
              }}
            >
              {saving ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
