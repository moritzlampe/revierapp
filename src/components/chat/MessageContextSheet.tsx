'use client'

import { useEffect } from 'react'

type Props = {
  isOpen: boolean
  isOwn: boolean
  hasText: boolean
  onReply: () => void
  onForward: () => void
  onCopy: () => void
  onDelete: () => void
  onClose: () => void
}

export function MessageContextSheet({ isOpen, isOwn, hasText, onReply, onForward, onCopy, onDelete, onClose }: Props) {
  // ESC-Taste schließt das Sheet (Desktop)
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleAction = (action: () => void) => {
    action()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
        }}
      />

      {/* Bottom Sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'var(--surface-2)',
          borderRadius: '1rem 1rem 0 0',
          padding: '0.75rem 0 max(1.5rem, env(safe-area-inset-bottom)) 0',
          animation: 'context-sheet-slide-in 0.25s ease-out',
        }}
      >
        {/* Drag Handle */}
        <div style={{
          width: '2.5rem',
          height: '0.25rem',
          background: 'var(--text-2)',
          opacity: 0.4,
          borderRadius: '0.125rem',
          margin: '0 auto 0.75rem auto',
        }} />

        {/* Antworten */}
        <button onClick={() => handleAction(onReply)} style={actionStyle}>
          <span style={iconStyle}>↩️</span>
          <span>Antworten</span>
        </button>

        {/* Weiterleiten */}
        <button onClick={() => handleAction(onForward)} style={actionStyle}>
          <span style={iconStyle}>↗️</span>
          <span>Weiterleiten</span>
        </button>

        {/* Kopieren — nur bei Text */}
        {hasText && (
          <button onClick={() => handleAction(onCopy)} style={actionStyle}>
            <span style={iconStyle}>📋</span>
            <span>Kopieren</span>
          </button>
        )}

        {/* Löschen — nur eigene Nachrichten */}
        {isOwn && (
          <button onClick={() => handleAction(onDelete)} style={{ ...actionStyle, color: '#ef4444' }}>
            <span style={iconStyle}>🗑️</span>
            <span>Löschen</span>
          </button>
        )}

        {/* Trennlinie */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />

        {/* Abbrechen */}
        <button onClick={onClose} style={{ ...actionStyle, justifyContent: 'center', color: 'var(--text-2)' }}>
          <span>Abbrechen</span>
        </button>
      </div>
    </>
  )
}

const actionStyle: React.CSSProperties = {
  width: '100%',
  padding: '1rem 1.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.875rem',
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontSize: '1rem',
  cursor: 'pointer',
  textAlign: 'left',
  minHeight: '3rem',
}

const iconStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  width: '1.5rem',
  textAlign: 'center',
}
