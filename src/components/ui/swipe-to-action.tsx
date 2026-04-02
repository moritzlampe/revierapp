'use client'

import { useRef, useCallback, type ReactNode } from 'react'

type SwipeToActionProps = {
  actionIcon: string
  actionColor: string
  onAction: () => void
  disabled?: boolean
  children: ReactNode
  /** Wird aufgerufen wenn Swipe einrastet. Übergibt close()-Funktion damit der Parent andere Instanzen schließen kann. */
  onSwipeOpen?: (close: () => void) => void
}

const ACTION_WIDTH = 80 // px – Breite des aufgedeckten Bereichs
const THRESHOLD = 32   // px – ab hier einrasten (40% von ACTION_WIDTH)
const DIRECTION_LOCK_DISTANCE = 10 // px – entscheidet ob horizontal oder vertikal

export default function SwipeToAction({
  actionIcon,
  actionColor,
  onAction,
  disabled = false,
  children,
  onSwipeOpen,
}: SwipeToActionProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const currentX = useRef(0)
  const isOpen = useRef(false)
  const directionLocked = useRef<'horizontal' | 'vertical' | null>(null)
  const isDragging = useRef(false)
  const didSwipe = useRef(false)

  const close = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    el.style.transition = 'transform 0.3s ease'
    el.style.transform = 'translateX(0)'
    currentX.current = 0
    isOpen.current = false
  }, [])

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (disabled) return
    const el = contentRef.current
    if (!el) return
    el.style.transition = 'none'
    startX.current = clientX
    startY.current = clientY
    directionLocked.current = null
    isDragging.current = true
    didSwipe.current = false
  }, [disabled])

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current || disabled) return
    const el = contentRef.current
    if (!el) return

    const diffX = clientX - startX.current
    const diffY = clientY - startY.current

    // Richtungserkennung: erste 10px entscheiden
    if (!directionLocked.current) {
      if (Math.abs(diffX) > DIRECTION_LOCK_DISTANCE || Math.abs(diffY) > DIRECTION_LOCK_DISTANCE) {
        directionLocked.current = Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical'
      }
      return
    }

    if (directionLocked.current === 'vertical') return

    didSwipe.current = true

    // Nur nach links swipen erlauben
    const baseOffset = isOpen.current ? -ACTION_WIDTH : 0
    let offset = baseOffset + diffX

    // Begrenze auf max -ACTION_WIDTH (links) und 0 (rechts)
    offset = Math.max(-ACTION_WIDTH, Math.min(0, offset))

    currentX.current = offset
    el.style.transform = `translateX(${offset}px)`
  }, [disabled])

  const handleEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    const el = contentRef.current
    if (!el) return

    el.style.transition = 'transform 0.3s ease'

    // Threshold-Check: bei mehr als THRESHOLD px → einrasten, sonst zurück
    if (currentX.current <= -THRESHOLD) {
      el.style.transform = `translateX(-${ACTION_WIDTH}px)`
      currentX.current = -ACTION_WIDTH
      if (!isOpen.current) {
        isOpen.current = true
        onSwipeOpen?.(close)
      }
    } else {
      el.style.transform = 'translateX(0)'
      currentX.current = 0
      isOpen.current = false
    }
  }, [onSwipeOpen, close])

  // Touch Events
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX, e.touches[0].clientY)
  }, [handleStart])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX, e.touches[0].clientY)
  }, [handleMove])

  const onTouchEnd = useCallback(() => {
    handleEnd()
  }, [handleEnd])

  // Mouse Events (Desktop-Testing)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    handleStart(e.clientX, e.clientY)
  }, [handleStart])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    handleMove(e.clientX, e.clientY)
  }, [handleMove])

  const onMouseUp = useCallback(() => {
    handleEnd()
  }, [handleEnd])

  const onMouseLeave = useCallback(() => {
    if (isDragging.current) handleEnd()
  }, [handleEnd])

  // Tap auf Action-Button
  const handleActionTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onAction()
  }, [onAction])

  // Klick auf Content verhindern wenn geswiped wurde (damit Link nicht feuert)
  // Wichtig: Nach einem Touch-Swipe feuert der Browser einen synthetischen Click.
  // Wenn wir gerade geswiped haben (didSwipe=true), darf der Click NICHT close() aufrufen,
  // sonst verschwindet der Button sofort wieder.
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    if (didSwipe.current) {
      // Synthetischer Click nach Swipe-Geste — Link verhindern, aber NICHT schließen
      e.preventDefault()
      e.stopPropagation()
      didSwipe.current = false
      return
    }
    if (isOpen.current) {
      // Echter Tap auf offenen Content → schließen
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }, [close])

  if (disabled) {
    return <>{children}</>
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Action-Feld (liegt hinter dem Content) */}
      <div
        onClick={handleActionTap}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: `${ACTION_WIDTH}px`,
          background: actionColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          cursor: 'pointer',
          zIndex: 0,
          userSelect: 'none',
        }}
      >
        {actionIcon}
      </div>

      {/* Verschiebbarer Content */}
      <div
        ref={contentRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onClickCapture={handleContentClick}
        style={{
          position: 'relative',
          zIndex: 1,
          background: 'var(--bg)',
          willChange: 'transform',
          userSelect: 'none',
        }}
      >
        {children}
      </div>
    </div>
  )
}
