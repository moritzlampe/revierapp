'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CircleNotch } from '@phosphor-icons/react'
import { Sheet, SheetContent } from '@/components/ui/sheet'

/**
 * Wrapper for single-field edits on the Anblick detail page (Sprint 60.5e-2).
 *
 * Renders as a bottom sheet via base-ui Portal — so the sheet lives outside
 * the .tagebuch-surface DOM subtree. Hence all accent tokens used here
 * (--bronze, --slate, …) are referenced from :root (Phase 0 / Phase 2.0).
 */
export type BaseFieldSheetProps = {
  open: boolean
  title: string
  onSave: () => void | Promise<void>
  onCancel: () => void
  saving?: boolean
  saveDisabled?: boolean
  errorMessage?: string
  children: ReactNode
}

export function BaseFieldSheet({
  open,
  title,
  onSave,
  onCancel,
  saving = false,
  saveDisabled = false,
  errorMessage,
  children,
}: BaseFieldSheetProps) {
  // iOS overlaps a `position: fixed; bottom: 0` popup with the on-screen
  // keyboard. visualViewport.height shrinks by exactly the keyboard height,
  // so we lift the whole popup by that amount — input AND footer stay above
  // the keyboard. Lifting the popup (not padding the content) is the fix
  // because the popup itself is what iOS would otherwise hide. (Ansatz B)
  const [keyboardOffset, setKeyboardOffset] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return

    const vv = window.visualViewport

    const handleResize = () => {
      const keyboardHeight = window.innerHeight - vv.height
      // 100px threshold: real keyboard only, not URL-bar shifts.
      setKeyboardOffset(keyboardHeight > 100 ? keyboardHeight : 0)
    }

    vv.addEventListener('resize', handleResize)
    handleResize()

    return () => vv.removeEventListener('resize', handleResize)
  }, [])

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // base-ui fires onOpenChange(false) for backdrop tap, Esc, and the
        // built-in X. Funnel all of them through onCancel so dismissal is
        // semantically identical regardless of trigger.
        if (!next) onCancel()
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton
        className="gap-0"
        style={{
          maxHeight: '90dvh',
          minHeight: '40dvh',
          background: 'var(--surface)',
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          // Lift the whole popup over the keyboard. Overrides the popup's
          // `bottom: 0` only when a keyboard is actually open.
          bottom: keyboardOffset > 0 ? `${keyboardOffset}px` : undefined,
        }}
      >
        {/* Sticky header. base-ui's built-in X (top-3 right-3) sits over it. */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            padding: '1rem 3rem 0.75rem 1.25rem',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 500,
              color: 'var(--text)',
              margin: 0,
              letterSpacing: '-0.005em',
            }}
          >
            {title}
          </h2>
        </header>

        {/* Scrollable content slot */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.25rem',
          }}
        >
          {children}
        </div>

        {/* Inline error banner sits above the footer when present */}
        {errorMessage && (
          <div
            role="alert"
            style={{
              margin: '0 1.25rem 0.75rem',
              padding: '0.625rem 0.75rem',
              borderRadius: '0.625rem',
              background: 'color-mix(in srgb, var(--danger) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
              color: 'var(--danger)',
              fontSize: '0.8125rem',
              fontWeight: 500,
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Sticky footer with Cancel (slate ghost) + Save (bronze primary) */}
        <footer
          style={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            gap: '0.625rem',
            padding: '0.75rem 1.25rem calc(0.75rem + var(--safe-bottom)) 1.25rem',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              flex: 1,
              minHeight: '2.75rem',
              borderRadius: '0.75rem',
              background: 'transparent',
              border: '1px solid var(--slate-edge)',
              color: 'var(--slate)',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            Abbrechen
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || saving}
            style={{
              flex: 2,
              minHeight: '2.75rem',
              borderRadius: '0.75rem',
              background: 'var(--bronze)',
              border: 'none',
              color: '#ffffff',
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: saveDisabled || saving ? 'not-allowed' : 'pointer',
              opacity: saveDisabled || saving ? 0.5 : 1,
              transition: 'opacity 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            {saving && (
              <CircleNotch
                size={16}
                weight="bold"
                style={{ animation: 'spin 1s linear infinite' }}
              />
            )}
            <span>Speichern</span>
          </button>
        </footer>
      </SheetContent>
    </Sheet>
  )
}
