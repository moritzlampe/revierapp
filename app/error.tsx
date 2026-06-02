'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Segment-Fehler-Boundary (innerhalb des Root-Layouts, globals.css verfuegbar,
// daher Design-Tokens via CSS-Variablen). Ruhiger, editorialer Fallback —
// kein roter Crash-Screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ maxWidth: '24rem', textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: '0 0 1rem',
          }}
        >
          Unerwarteter Fehler
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 500,
            lineHeight: 1.2,
            color: 'var(--text-primary)',
            margin: '0 0 0.75rem',
          }}
        >
          Etwas ist schiefgelaufen
        </h1>
        <p
          style={{
            fontSize: '0.95rem',
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            margin: '0 0 1.75rem',
          }}
        >
          Der Fehler wurde aufgezeichnet. Versuch es noch einmal — oft hilft das
          schon.
        </p>
        <button
          onClick={() => reset()}
          style={{
            minHeight: '44px',
            minWidth: '44px',
            padding: '0 1.5rem',
            background: 'var(--accent-primary)',
            color: 'var(--bg-base)',
            border: 'none',
            borderRadius: '14px',
            fontFamily: 'var(--font-body)',
            fontSize: '0.95rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  )
}
