'use client'

import { useEffect } from 'react'
import KillDetailContent, { type KillDetailMode } from '@/components/kill/KillDetailContent'
import type { DisplayKill } from '@/lib/strecke/visibility'

interface KillDetailSheetProps {
  open: boolean
  kill: DisplayKill | null
  mode: KillDetailMode
  heroPhotoUrl?: string | null
  photoCount?: number
  canEdit?: boolean
  canDelete?: boolean
  isReporter?: boolean
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
  onShare?: () => void
  onAddPhoto?: (file: File) => void | Promise<void>
}

export default function KillDetailSheet({
  open,
  kill,
  mode,
  heroPhotoUrl,
  photoCount,
  canEdit,
  canDelete,
  isReporter,
  onClose,
  onEdit,
  onDelete,
  onShare,
  onAddPhoto,
}: KillDetailSheetProps) {
  // Escape schließt Sheet (Desktop/Keyboard-Accessibility)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !kill) return null

  // Fullscreen-Modal über der Hunt-Page. Deckt die Hunt-Topbar ab, damit der
  // einzig sichtbare Back-Button der eigene ist (onClose statt router.push).
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'sheet-slide-up 0.25s ease-out',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border-light)',
          paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Zurück zur Strecke"
          className="flex items-center justify-center rounded-lg"
          style={{
            background: 'var(--surface-2)',
            minWidth: '2.75rem',
            minHeight: '2.75rem',
            fontSize: '1.125rem',
            color: 'var(--text)',
          }}
        >
          ←
        </button>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.0625rem',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'var(--text)',
          }}
        >
          Strecke
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          paddingTop: '0.75rem',
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          background: 'var(--bg-elevated)',
        }}
      >
        <KillDetailContent
          kill={kill}
          mode={mode}
          heroPhotoUrl={heroPhotoUrl}
          photoCount={photoCount}
          canEdit={canEdit}
          canDelete={canDelete}
          isReporter={isReporter}
          onEdit={onEdit}
          onDelete={onDelete}
          onShare={onShare}
          onAddPhoto={onAddPhoto}
        />
      </div>
    </div>
  )
}
