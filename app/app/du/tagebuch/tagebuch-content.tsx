'use client'

import { useRouter } from 'next/navigation'
import { Notebook } from '@phosphor-icons/react'

export default function TagebuchContent() {
  const router = useRouter()

  return (
    <div className="tagebuch-surface min-h-dvh flex flex-col">
      {/* Header — Pattern aus jagdeinstellungen-content.tsx, sticky innerhalb
          .tagebuch-surface, damit var(--surface) auf Tagebuch-Wert zieht. */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          minHeight: '3.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.push('/app/du')}
          aria-label="Zurück"
          className="flex items-center justify-center rounded-lg"
          style={{
            color: 'var(--text-2)',
            background: 'var(--surface-2)',
            minWidth: '2.75rem',
            minHeight: '2.75rem',
            fontSize: '1.125rem',
          }}
        >
          ←
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.01em' }}>
          Jagdtagebuch
        </h1>
      </div>

      {/* Empty State */}
      <div
        className="flex-1 flex flex-col items-center justify-center"
        style={{ padding: '2rem 1.5rem', gap: '1.25rem' }}
      >
        <Notebook size={48} weight="regular" color="var(--text-faint)" />
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'var(--text)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          Dein Tagebuch ist noch leer.
        </h2>
        <p
          style={{
            color: 'var(--text-2)',
            maxWidth: '20rem',
            lineHeight: 1.6,
            textAlign: 'center',
            fontSize: '0.9375rem',
            margin: 0,
          }}
        >
          Hier sammeln sich deine Jagdtage — Ansitze, Anblicke, Erlegungen.
          Nichts geht verloren, niemand sieht mit.
        </p>
      </div>
    </div>
  )
}
