'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export type ConfirmVariant = 'default' | 'danger'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: ConfirmVariant
}

type Resolver = (ok: boolean) => void

interface ConfirmSheetContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmSheetContext = createContext<ConfirmSheetContextValue | null>(null)

export function useConfirmSheet(): ConfirmSheetContextValue['confirm'] {
  const ctx = useContext(ConfirmSheetContext)
  if (!ctx) {
    throw new Error('useConfirmSheet must be used within <ConfirmSheetProvider>')
  }
  return ctx.confirm
}

interface InternalState {
  options: ConfirmOptions
  resolver: Resolver
}

export function ConfirmSheetProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InternalState | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setState({ options, resolver: resolve })
    })
  }, [])

  const handleResolve = useCallback(
    (ok: boolean) => {
      if (!state) return
      state.resolver(ok)
      setState(null)
    },
    [state],
  )

  const ctxValue = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmSheetContext.Provider value={ctxValue}>
      {children}
      {state && (
        <ConfirmSheet
          options={state.options}
          onConfirm={() => handleResolve(true)}
          onCancel={() => handleResolve(false)}
        />
      )}
    </ConfirmSheetContext.Provider>
  )
}

interface ConfirmSheetProps {
  options: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmSheet({ options, onConfirm, onCancel }: ConfirmSheetProps) {
  const {
    title,
    description,
    confirmLabel = 'Bestätigen',
    cancelLabel = 'Abbrechen',
    confirmVariant = 'default',
  } = options

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
      setTimeout(onCancel, 250)
    } else {
      sheet.style.transition = 'transform 0.2s ease'
      sheet.style.transform = 'translateY(0)'
    }
  }, [onCancel])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel, onConfirm])

  const isDanger = confirmVariant === 'danger'

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onCancel} />
      <div
        ref={sheetRef}
        className="map-object-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
          background: 'var(--bg-elevated)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          style={{ width: '100%', padding: '0.75rem 0', touchAction: 'none' }}
        >
          <div className="sheet-handle" />
        </div>
        <div style={{ padding: '0.5rem 1.25rem 1rem' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '1.125rem',
              fontWeight: 600,
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h2>
          {description && (
            <p
              style={{
                margin: '0.375rem 0 0',
                fontSize: '0.9375rem',
                lineHeight: 1.45,
                color: 'var(--text-secondary)',
              }}
            >
              {description}
            </p>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: '0.625rem',
            padding: '0 1.25rem',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="tap-ripple"
            style={{
              all: 'unset',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.875rem 1rem',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              fontSize: '0.9375rem',
              fontWeight: 500,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              boxSizing: 'border-box',
              minHeight: '2.75rem',
              textAlign: 'center',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="tap-ripple"
            style={{
              all: 'unset',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.875rem 1rem',
              background: isDanger ? 'var(--alert-text)' : 'var(--accent-primary)',
              border: `1px solid ${isDanger ? 'var(--alert-text)' : 'var(--accent-primary)'}`,
              borderRadius: '10px',
              color: '#FFFFFF',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              boxSizing: 'border-box',
              minHeight: '2.75rem',
              textAlign: 'center',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
