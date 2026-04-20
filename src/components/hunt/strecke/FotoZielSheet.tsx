'use client'

import { useCallback, useRef } from 'react'
import { ChevronRight } from 'lucide-react'

export type FotoZiel = 'streckenfoto' | 'stimmung' | 'erlegung'

interface FotoZielSheetProps {
  open: boolean
  onClose: () => void
  onSelect: (ziel: FotoZiel) => void
}

interface OptionSpec {
  id: FotoZiel
  emoji: string
  title: string
  subtext: string
}

const OPTIONS: OptionSpec[] = [
  {
    id: 'streckenfoto',
    emoji: '🎯',
    title: 'Streckenfoto',
    subtext: 'Gruppenbild der gelegten Strecke.',
  },
  {
    id: 'stimmung',
    emoji: '🌅',
    title: 'Jagd-Stimmung',
    subtext: 'Landschaft, Hund, Sonnenaufgang — das Drumherum.',
  },
  {
    id: 'erlegung',
    emoji: '🦌',
    title: 'Zu einer Erlegung',
    subtext: 'Foto einem Stück zuordnen.',
  },
]

export default function FotoZielSheet({ open, onClose, onSelect }: FotoZielSheetProps) {
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

  if (!open) return null

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onClose} />
      <div
        ref={sheetRef}
        className="map-object-sheet"
        style={{
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          maxHeight: '60dvh',
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

        <div style={{ padding: '0 1rem 0.5rem' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Foto hinzufügen
          </h2>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
            }}
          >
            Wohin gehört dieses Foto?
          </p>
        </div>

        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {OPTIONS.map(opt => (
            <OptionRow
              key={opt.id}
              option={opt}
              onClick={() => {
                onSelect(opt.id)
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function OptionRow({ option, onClick }: { option: OptionSpec; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        padding: '1rem',
        background: 'var(--bg-base)',
        border: '1px solid var(--border-default)',
        borderRadius: '12px',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        minHeight: '3.5rem',
        boxSizing: 'border-box',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: '1.75rem',
          lineHeight: 1,
          width: '2.25rem',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {option.emoji}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
        <span
          style={{
            fontSize: '1rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          {option.title}
        </span>
        <span
          style={{
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
          }}
        >
          {option.subtext}
        </span>
      </div>
      <ChevronRight size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
    </button>
  )
}
