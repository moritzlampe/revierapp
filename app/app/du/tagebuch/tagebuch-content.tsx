import Link from 'next/link'
import { Notebook } from '@phosphor-icons/react/dist/ssr'
import type { Jagdjahr } from '@/lib/diary/season'
import type { DiaryStats } from '@/lib/diary/queries'

interface Props {
  jagdjahr: Jagdjahr
  stats: DiaryStats
}

export default function TagebuchContent({ jagdjahr, stats }: Props) {
  const isEmpty = stats.erlegungen === 0 && stats.jagdtage === 0
  // Im aktuellen Sprint wird jagdjahr noch nicht gerendert — DiaryHeader kommt in Phase 2.
  void jagdjahr

  return (
    <div className="tagebuch-surface min-h-dvh flex flex-col">
      {/* App-Header — sticky innerhalb .tagebuch-surface, damit var(--surface)
          auf Tagebuch-Wert zieht. */}
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
        <Link
          href="/app/du"
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
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          Jagdtagebuch
        </h1>
      </div>

      {/* PHASE 2: <DiaryHeader jagdjahr={jagdjahr} stats={stats} /> hier einsetzen */}

      {isEmpty ? (
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
      ) : (
        <div className="flex-1" />
      )}
    </div>
  )
}
