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
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        gap: '1.25rem',
      }}
    >
      {/* Signature-Motif als dezenter Watermark hinter dem Content */}
      <BullseyeWatermark />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '22rem' }}>
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
            position: 'relative',
            zIndex: 1,
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

/**
 * Dezenter Bullseye-Watermark als Signature-Motif im Empty-State.
 * Drei konzentrische Kreise (320/220/120 px Durchmesser), 1px Stroke,
 * opacity 0.05 — Grenzwert der Anti-Kitsch-Guard. Über 0.06 kippt es
 * Richtung Vereinsheim-Optik.
 */
function BullseyeWatermark() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '320px',
        height: '320px',
        pointerEvents: 'none',
        color: 'var(--text-secondary)',
        opacity: 0.05,
      }}
    >
      <svg width="320" height="320" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="160" cy="160" r="159" stroke="currentColor" strokeWidth="1" />
        <circle cx="160" cy="160" r="110" stroke="currentColor" strokeWidth="1" />
        <circle cx="160" cy="160" r="60" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  )
}
