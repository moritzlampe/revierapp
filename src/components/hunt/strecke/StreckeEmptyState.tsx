'use client'

export type StreckeEmptyRole = 'jagdleiter' | 'schuetze' | 'gast'

interface StreckeEmptyStateProps {
  role: StreckeEmptyRole
  onStartErlegung?: () => void
}

export default function StreckeEmptyState({ role, onStartErlegung }: StreckeEmptyStateProps) {
  const content = COPY[role]
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        gap: '1.25rem',
      }}
    >
      <AntlerIllustration />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '22rem' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
          }}
        >
          {content.title}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}
        >
          {content.subtext}
        </p>
      </div>
      {content.cta && onStartErlegung && (
        <button
          type="button"
          onClick={onStartErlegung}
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem 1.5rem',
            background: 'var(--accent-primary)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '12px',
            fontSize: '0.9375rem',
            fontWeight: 600,
            minHeight: '2.75rem',
            minWidth: '12rem',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
          }}
        >
          {content.cta}
        </button>
      )}
    </div>
  )
}

const COPY: Record<StreckeEmptyRole, { title: string; subtext: string; cta: string | null }> = {
  jagdleiter: {
    title: 'Noch keine Strecke',
    subtext: 'Hier erscheinen alle gemeldeten Stücke — deine und die des Teams.',
    cta: 'Erstes Stück melden',
  },
  schuetze: {
    title: 'Noch nichts gemeldet',
    subtext: 'Sobald du oder das Team Stücke meldet, siehst du sie hier live.',
    cta: 'Stück melden',
  },
  gast: {
    title: 'Noch keine Strecke',
    subtext: 'Die Jagd läuft. Gemeldete Stücke erscheinen hier automatisch.',
    cta: null,
  },
}

function AntlerIllustration() {
  // Schlichter Rehkopf-Umriss mit Geweih, monochrom --text-secondary.
  // Custom-SVG-Feinschliff kommt in Sprint 58.1h.e.
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g
        stroke="var(--text-secondary)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      >
        {/* Geweih links */}
        <path d="M40 40 L30 18" />
        <path d="M30 18 L22 22" />
        <path d="M30 18 L24 10" />
        <path d="M30 18 L34 8" />
        <path d="M40 40 L26 28" />
        {/* Geweih rechts */}
        <path d="M80 40 L90 18" />
        <path d="M90 18 L98 22" />
        <path d="M90 18 L96 10" />
        <path d="M90 18 L86 8" />
        <path d="M80 40 L94 28" />
        {/* Kopf-Umriss (abstrakter Rehkopf) */}
        <path d="M40 40 C 40 32, 48 28, 60 28 C 72 28, 80 32, 80 40 L 80 68 C 80 82, 72 92, 60 96 C 48 92, 40 82, 40 68 Z" />
        {/* Augen-Andeutung */}
        <circle cx="50" cy="54" r="1.5" fill="var(--text-secondary)" stroke="none" />
        <circle cx="70" cy="54" r="1.5" fill="var(--text-secondary)" stroke="none" />
        {/* Nase */}
        <path d="M56 76 Q60 80 64 76" />
      </g>
    </svg>
  )
}
