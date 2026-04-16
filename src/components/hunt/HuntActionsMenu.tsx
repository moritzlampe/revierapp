'use client'

import { MoreVertical } from 'lucide-react'
import { useState } from 'react'

interface Props {
  huntKind: 'group' | 'solo'
  isCreator: boolean
  onEndHunt: () => void
  onLeaveHunt: () => void
}

export function HuntActionsMenu({ huntKind, isCreator, onEndHunt, onLeaveHunt }: Props) {
  const [open, setOpen] = useState(false)

  const canEnd = huntKind === 'solo' || isCreator
  const canLeave = huntKind === 'group' && !isCreator

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Jagd-Aktionen"
        className="flex items-center justify-center rounded-lg"
        style={{
          background: 'var(--surface-2)',
          minWidth: '2.75rem',
          minHeight: '2.75rem',
          color: 'var(--text-2)',
        }}
      >
        <MoreVertical size={20} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 100,
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed',
            bottom: 'var(--bottom-bar-space, 5rem)',
            left: 0,
            right: 0,
            background: 'var(--surface-2)',
            borderTopLeftRadius: 'var(--radius)',
            borderTopRightRadius: 'var(--radius)',
            padding: '1rem',
            zIndex: 101,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {canEnd && (
                <button
                  onClick={() => { setOpen(false); onEndHunt() }}
                  style={{
                    padding: '0.875rem 1rem',
                    textAlign: 'left',
                    borderRadius: 'var(--radius)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--red)',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '2.75rem',
                  }}
                >
                  {huntKind === 'solo' ? 'Einzeljagd beenden' : 'Jagd für alle beenden'}
                </button>
              )}
              {canLeave && (
                <button
                  onClick={() => { setOpen(false); onLeaveHunt() }}
                  style={{
                    padding: '0.875rem 1rem',
                    textAlign: 'left',
                    borderRadius: 'var(--radius)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--orange)',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '2.75rem',
                  }}
                >
                  Jagd verlassen
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '0.875rem 1rem',
                  marginTop: '0.5rem',
                  textAlign: 'center',
                  borderRadius: 'var(--radius)',
                  background: 'var(--surface-3)',
                  border: 'none',
                  color: 'var(--text-2)',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  minHeight: '2.75rem',
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
