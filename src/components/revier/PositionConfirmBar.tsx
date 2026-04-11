'use client'

type Props = {
  onConfirm: () => void
  onDiscard: () => void
  confirmLabel?: string
  discardLabel?: string
}

export default function PositionConfirmBar({ onConfirm, onDiscard, confirmLabel, discardLabel }: Props) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1100,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      padding: '0.75rem 1rem',
      paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
      display: 'flex',
      gap: '0.5rem',
    }}>
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.375rem',
        }}
      >
        {discardLabel || '✕ Verwerfen'}
      </button>
      <button
        onClick={onConfirm}
        style={{
          flex: 1,
          padding: '0.75rem',
          background: 'var(--green)',
          border: 'none',
          borderRadius: 'var(--radius)',
          color: 'white',
          fontSize: '0.875rem',
          fontWeight: 700,
          cursor: 'pointer',
          minHeight: '2.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.375rem',
        }}
      >
        {confirmLabel || '✓ Position bestätigen'}
      </button>
    </div>
  )
}
