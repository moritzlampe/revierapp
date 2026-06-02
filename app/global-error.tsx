'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Faengt Fehler im Root-Layout ab (ersetzt das gesamte Layout, rendert daher
// eigenes <html><body>). Bewusst robust: keine fragilen Imports, Farben/Fonts
// inline mit System-Fallback — der Boundary muss auch dann tragen, wenn das
// Stylesheet selbst die Ursache war.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#E7DDC7',
          color: '#1F2618',
          fontFamily: "'Inter Variable', system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: '24rem', textAlign: 'center' }}>
          <p
            style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: '0.75rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#5D634F',
              margin: '0 0 1rem',
            }}
          >
            Unerwarteter Fehler
          </p>
          <h1
            style={{
              fontFamily: "'Fraunces Variable', Georgia, serif",
              fontSize: '1.75rem',
              fontWeight: 500,
              lineHeight: 1.2,
              margin: '0 0 0.75rem',
            }}
          >
            Etwas ist schiefgelaufen
          </h1>
          <p
            style={{
              fontSize: '0.95rem',
              lineHeight: 1.55,
              color: '#4E543F',
              margin: '0 0 1.75rem',
            }}
          >
            Der Fehler wurde aufgezeichnet. Bitte lade die Seite neu — meist
            genügt das schon.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              minHeight: '44px',
              minWidth: '44px',
              padding: '0 1.5rem',
              background: '#4A5A2A',
              color: '#E7DDC7',
              border: 'none',
              borderRadius: '14px',
              fontFamily: "'Inter Variable', system-ui, -apple-system, sans-serif",
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Seite neu laden
          </button>
        </div>
      </body>
    </html>
  )
}
