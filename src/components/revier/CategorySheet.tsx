'use client'

type Props = {
  onSelect: (category: 'stand' | 'sonstiges') => void
  onCancel: () => void
}

export default function CategorySheet({ onSelect, onCancel }: Props) {
  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onCancel} />
      <div className="map-object-sheet" style={{ paddingBottom: '1rem' }}>
        <div className="sheet-handle" />
        <div className="sheet-header">Was möchtest du setzen?</div>
        <div style={{ padding: '0.5rem 1rem' }}>
          {([
            { key: 'stand' as const, icon: '🏗', label: 'Stand' },
            { key: 'sonstiges' as const, icon: '📍', label: 'Sonstiges' },
          ]).map(opt => (
            <button
              key={opt.key}
              onClick={() => onSelect(opt.key)}
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
