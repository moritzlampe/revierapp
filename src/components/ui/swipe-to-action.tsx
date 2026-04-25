'use client'

import { useRef, useCallback, type ReactNode } from 'react'

type SwipeToActionProps = {
  actionIcon: ReactNode
  actionColor: string
  onAction: () => void
  disabled?: boolean
  children: ReactNode
  /** Wird aufgerufen wenn Swipe einrastet. Übergibt close()-Funktion damit der Parent andere Instanzen schließen kann. */
  onSwipeOpen?: (close: () => void) => void
  /** Reply-Callback bei RIGHT-Swipe über Trigger-Schwelle */
  onReply?: () => void
  /** Icon für Reply-Indikator (default ↩) */
  replyIcon?: string
  /** Pixel nach rechts für Reply-Trigger (default 60) */
  replyTriggerPx?: number
  /** Maximale Pixel nach rechts (default 100) */
  replyMaxPx?: number
  /** Wird bei Start jeder horizontalen Geste gefeuert (z.B. Long-Press-Timer canceln) */
  onDragStart?: () => void
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
  onReply,
  replyIcon,
  replyTriggerPx = 60,
  replyMaxPx = 100,
  onDragStart,
}: SwipeToActionProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const deleteActionRef = useRef<HTMLDivElement>(null)
  const replyIndicatorRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const currentX = useRef(0)
  const isOpen = useRef(false)
  const directionLocked = useRef<'horizontal' | 'vertical' | null>(null)
  const isDragging = useRef(false)
  const didSwipe = useRef(false)
  // DEBUG (Sprint 58.1r.3): Drosselung für handleMove-Logging — alle 50px
  const lastLoggedX = useRef(0)

  const close = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    el.style.transition = 'transform 0.3s ease'
    el.style.transform = 'translateX(0)'
    currentX.current = 0
    isOpen.current = false
    // Defensiv: Drag-/Direction-Flags mitresetten, falls close() aus
    // einem inkonsistenten State (z.B. abgebrochene Geste) gerufen wird.
    isDragging.current = false
    directionLocked.current = null
    didSwipe.current = false
    const deleteEl = deleteActionRef.current
    if (deleteEl) deleteEl.style.opacity = '0'
    const indicator = replyIndicatorRef.current
    if (indicator) indicator.style.opacity = '0'
  }, [])

  const handleStart = useCallback((clientX: number, clientY: number) => {
    const el = contentRef.current
    if (!el) return
    // DEBUG (Sprint 58.1r.3): State VOR dem Reset + Computed-Transform aus dem DOM
    const computed = window.getComputedStyle(el).transform
    console.log('[swipe] start | pre-reset',
      'isOpen=', isOpen.current,
      'currentX=', currentX.current,
      'directionLocked=', directionLocked.current,
      'isDragging=', isDragging.current,
      'computedTransform=', computed)
    el.style.transition = 'none'
    startX.current = clientX
    startY.current = clientY
    directionLocked.current = null
    isDragging.current = true
    didSwipe.current = false
    lastLoggedX.current = currentX.current
  }, [])

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return
    const el = contentRef.current
    if (!el) return

    const diffX = clientX - startX.current
    const diffY = clientY - startY.current

    // Richtungserkennung: erste 10px entscheiden
    if (!directionLocked.current) {
      if (Math.abs(diffX) > DIRECTION_LOCK_DISTANCE || Math.abs(diffY) > DIRECTION_LOCK_DISTANCE) {
        directionLocked.current = Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical'
        // DEBUG (Sprint 58.1r.3): Direction-Lock-Entscheidung
        console.log('[swipe] move | direction-lock=', directionLocked.current,
          'diffX=', diffX, 'diffY=', diffY, 'isOpen=', isOpen.current)
        if (directionLocked.current === 'horizontal') {
          onDragStart?.()
        }
      }
      return
    }

    if (directionLocked.current === 'vertical') return

    didSwipe.current = true

    const baseOffset = isOpen.current ? -ACTION_WIDTH : 0
    let offset = baseOffset + diffX

    // Links: Delete (nur wenn nicht disabled)
    // Rechts: Reply (nur wenn onReply vorhanden)
    if (offset < 0 && !disabled) {
      offset = Math.max(-ACTION_WIDTH, offset)
    } else if (offset > 0 && onReply) {
      offset = Math.min(replyMaxPx, offset)
    } else {
      offset = 0
    }

    currentX.current = offset
    el.style.transform = `translateX(${offset}px)`

    // DEBUG (Sprint 58.1r.3): Drossel — alle 50px ein Log
    if (Math.abs(offset - lastLoggedX.current) >= 50) {
      console.log('[swipe] move | currentX=', offset,
        'baseOffset=', baseOffset, 'diffX=', diffX, 'isOpen=', isOpen.current)
      lastLoggedX.current = offset
    }

    // Delete-Action sichtbar machen bei Links-Swipe
    const deleteEl = deleteActionRef.current
    if (deleteEl) {
      deleteEl.style.opacity = offset < 0 ? '1' : '0'
    }

    // Reply-Indicator Opacity aktualisieren
    const indicator = replyIndicatorRef.current
    if (indicator) {
      indicator.style.opacity = String(Math.min(Math.max(offset, 0) / replyTriggerPx, 1))
    }
  }, [disabled, onReply, replyMaxPx, replyTriggerPx, onDragStart])

  const handleEnd = useCallback(() => {
    if (!isDragging.current) {
      // DEBUG (Sprint 58.1r.3): early-return weil isDragging schon false
      console.log('[swipe] end | EARLY-RETURN isDragging=false currentX=', currentX.current,
        'isOpen=', isOpen.current)
      return
    }
    isDragging.current = false
    const el = contentRef.current
    if (!el) return

    el.style.transition = 'transform 0.3s ease'

    // Reply: RIGHT-Swipe über Trigger-Schwelle → sofort feuern + zurücksnappen
    if (currentX.current >= replyTriggerPx && onReply) {
      // DEBUG (Sprint 58.1r.3)
      console.log('[swipe] end | REPLY currentX=', currentX.current, 'trigger=', replyTriggerPx)
      el.style.transform = 'translateX(0)'
      currentX.current = 0
      navigator.vibrate?.(15)
      onReply()
      const indicator = replyIndicatorRef.current
      if (indicator) indicator.style.opacity = '0'
      return
    }

    // Delete: LEFT-Swipe über Threshold → einrasten
    if (!disabled && currentX.current <= -THRESHOLD) {
      // DEBUG (Sprint 58.1r.3)
      console.log('[swipe] end | LATCH currentX=', currentX.current,
        'threshold=', -THRESHOLD, 'wasOpen=', isOpen.current)
      el.style.transform = `translateX(-${ACTION_WIDTH}px)`
      currentX.current = -ACTION_WIDTH
      if (!isOpen.current) {
        isOpen.current = true
        onSwipeOpen?.(close)
      }
      // Delete-Action bleibt sichtbar
      const deleteEl = deleteActionRef.current
      if (deleteEl) deleteEl.style.opacity = '1'
    } else {
      // DEBUG (Sprint 58.1r.3)
      console.log('[swipe] end | ABORT currentX=', currentX.current,
        'threshold=', -THRESHOLD, 'disabled=', disabled, 'wasOpen=', isOpen.current)
      el.style.transform = 'translateX(0)'
      currentX.current = 0
      isOpen.current = false
      // Delete-Action ausblenden
      const deleteEl = deleteActionRef.current
      if (deleteEl) deleteEl.style.opacity = '0'
    }

    // Reply-Indicator zurücksetzen
    const indicator = replyIndicatorRef.current
    if (indicator) indicator.style.opacity = '0'
  }, [onSwipeOpen, close, onReply, replyTriggerPx, disabled])

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

  // touchcancel feuert auf iOS bei Konflikt mit System-Gesten oder
  // Scroll-Heuristiken des Parents. Ohne diesen Handler bleibt isDragging=true
  // mit veraltetem currentX/isOpen — die nächste Geste startet aus inkonsistentem State.
  const onTouchCancel = useCallback(() => {
    // DEBUG (Sprint 58.1r.3): zeigt ob iOS die Geste killt
    console.log('[swipe] TOUCH CANCEL FIRED | isDragging=', isDragging.current,
      'currentX=', currentX.current, 'isOpen=', isOpen.current,
      'directionLocked=', directionLocked.current)
    if (!isDragging.current) return
    const el = contentRef.current
    if (!el) return
    el.style.transition = 'transform 0.3s ease'
    el.style.transform = 'translateX(0)'
    currentX.current = 0
    isOpen.current = false
    isDragging.current = false
    directionLocked.current = null
    didSwipe.current = false
    const deleteEl = deleteActionRef.current
    if (deleteEl) deleteEl.style.opacity = '0'
    const indicator = replyIndicatorRef.current
    if (indicator) indicator.style.opacity = '0'
  }, [])

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

  // Klick auf Content verhindern wenn geswiped wurde
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    if (didSwipe.current) {
      e.preventDefault()
      e.stopPropagation()
      didSwipe.current = false
      return
    }
    if (isOpen.current) {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }, [close])

  // Komplett deaktiviert: kein Delete UND kein Reply möglich
  if (disabled && !onReply) {
    return <>{children}</>
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Reply-Indicator (links, erscheint bei RIGHT-Swipe) */}
      {onReply && (
        <div
          ref={replyIndicatorRef}
          style={{
            position: 'absolute',
            left: '0.5rem',
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: 0,
            pointerEvents: 'none',
            fontSize: '1.4rem',
            color: 'var(--green)',
            zIndex: 0,
          }}
        >
          {replyIcon ?? '\u21A9'}
        </div>
      )}

      {/* Delete-Action-Feld (liegt hinter dem Content, rechts) */}
      {!disabled && (
        <div
          ref={deleteActionRef}
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
            opacity: 0,
          }}
        >
          {actionIcon}
        </div>
      )}

      {/* Verschiebbarer Content */}
      <div
        ref={contentRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
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
          // pan-y signalisiert iOS: vertikales Scrollen bleibt System-Sache,
          // horizontale Gesten gehören uns. Verhindert mid-gesture touchcancel
          // durch System-Heuristiken (Edge-Swipe, Scroll-Hijack).
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
