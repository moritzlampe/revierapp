'use client'

import { useCallback, useRef } from 'react'
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
}: KillDetailSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipeStartY = useRef(0)
  const swipeStartTime = useRef(0)
  const swipeDeltaY = useRef(0)
  const isSwiping = useRef(false)

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY
    swipeStartTime.current = Date.now()
    swipeDeltaY.current = 0
    isSwiping.current = true
    const sheet = sheetRef.current
    if (sheet) sheet.style.transition = 'none'
  }, [])

  const handleSwipeMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping.current) return
    const delta = e.touches[0].clientY - swipeStartY.current
    swipeDeltaY.current = Math.max(0, delta)
    const sheet = sheetRef.current
    if (sheet) sheet.style.transform = `translateY(${swipeDeltaY.current}px)`
  }, [])

  const handleSwipeEnd = useCallback(() => {
    if (!isSwiping.current) return
    isSwiping.current = false
    const sheet = sheetRef.current
    if (!sheet) return
    const elapsed = Date.now() - swipeStartTime.current
    const velocity = swipeDeltaY.current / Math.max(elapsed, 1)
    if (swipeDeltaY.current > 80 || velocity > 0.5) {
      sheet.style.transition = 'transform 0.25s ease-out'
      sheet.style.transform = 'translateY(100%)'
      setTimeout(onClose, 250)
    } else {
      sheet.style.transition = 'transform 0.2s ease'
      sheet.style.transform = 'translateY(0)'
    }
  }, [onClose])

  if (!open || !kill) return null

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onClose} />
      <div
        ref={sheetRef}
        className="map-object-sheet"
        style={{
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          maxHeight: '85dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          style={{ width: '100%', padding: '0.75rem 0', cursor: 'grab', touchAction: 'none' }}
        >
          <div className="sheet-handle" />
        </div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
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
          />
        </div>
      </div>
    </>
  )
}
