'use client'

import type { ObjektType } from '@/lib/types/revier'

type TypeOption = {
  type: ObjektType
  label: string
  icon: string
  defaultName: string
  defaultDescription?: string
}

const STAND_OPTIONS: TypeOption[] = [
  { type: 'hochsitz', label: 'Hochsitz', icon: '🏠', defaultName: 'Hochsitz' },
  // Vorübergehend: Leiter mappt auf hochsitz mit description.
  // Eigener Enum-Wert via Migration in einem späteren Prompt.
  { type: 'hochsitz', label: 'Leiter', icon: '🪜', defaultName: 'Leiter', defaultDescription: 'Leiter' },
  { type: 'drueckjagdstand', label: 'Drückjagdbock', icon: '🎯', defaultName: 'Drückjagdbock' },
]

const SONSTIGES_OPTIONS: TypeOption[] = [
  { type: 'salzlecke', label: 'Salzlecke', icon: '🧂', defaultName: 'Salzlecke' },
  { type: 'kirrung', label: 'Kirrung', icon: '🌾', defaultName: 'Kirrung' },
  { type: 'wildkamera', label: 'Wildkamera', icon: '📷', defaultName: 'Wildkamera' },
  { type: 'parkplatz', label: 'Parkplatz', icon: '🅿️', defaultName: 'Parkplatz' },
  { type: 'sonstiges', label: 'Sonstiges', icon: '📌', defaultName: '' },
]

type Props = {
  category: 'stand' | 'sonstiges'
  onSelect: (opt: { type: ObjektType; defaultName: string; defaultDescription?: string }) => void
  onBack: () => void
  onCancel: () => void
}

export default function TypeSheet({ category, onSelect, onBack, onCancel }: Props) {
  const options = category === 'stand' ? STAND_OPTIONS : SONSTIGES_OPTIONS
  const title = category === 'stand' ? 'Art des Standes' : 'Was genau?'

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onCancel} />
      <div className="map-object-sheet" style={{ paddingBottom: '1rem' }}>
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
          {title}
        </div>
        <div style={{ padding: '0.5rem 1rem' }}>
          {options.map((opt, i) => (
            <button
              key={`${opt.type}-${i}`}
              onClick={() => onSelect({
                type: opt.type,
                defaultName: opt.defaultName,
                defaultDescription: opt.defaultDescription,
              })}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 0',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                minHeight: '2.75rem',
              }}
            >
              <span style={{ fontSize: '1.25rem', width: '1.5rem', textAlign: 'center' }}>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
          <button
            onClick={onCancel}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginTop: '0.5rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-2)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </>
  )
}
