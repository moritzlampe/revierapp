import { DetailTopBar } from './DetailTopBar'
import { WildIcon } from '@/components/icons/WildIcon'
import { getWildArtLabelSingle } from '@/lib/wildArt'
import type { BestiariumDetail } from '@/lib/diary/detail-types'

const HERO: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '0.875rem',
  padding: '1.75rem 1.5rem 1.5rem',
  borderBottom: '1px solid var(--border)',
}

const HERO_KICKER: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '9.5px',
  fontWeight: 500,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--bronze)',
}

const HERO_TITLE: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: '2rem',
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
  color: 'var(--text)',
  fontVariationSettings: '"opsz" 144',
  margin: 0,
}

const HERO_COUNT: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  fontSize: '1.5rem',
  color: 'var(--bronze)',
  letterSpacing: '0.01em',
  lineHeight: 1,
}

const HERO_COUNT_UNIT: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: 'var(--text-dim)',
  marginLeft: '0.375rem',
  letterSpacing: '0.04em',
}

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '0.875rem 0',
  borderBottom: '1px solid var(--border)',
}

const ROW_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.9375rem',
  fontWeight: 500,
  color: 'var(--text)',
  letterSpacing: '0.005em',
}

const ROW_COUNT: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  fontSize: '0.9375rem',
  color: 'var(--bronze)',
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
}

const ROW_COUNT_UNIT: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
  fontWeight: 500,
  color: 'var(--text-dim)',
  marginLeft: '0.25rem',
  letterSpacing: '0.04em',
}

const ZERO: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.9375rem',
  color: 'var(--text-muted)',
  lineHeight: 1.6,
  textAlign: 'center',
  margin: 0,
  padding: '2.5rem 1.5rem',
  maxWidth: '22rem',
  marginLeft: 'auto',
  marginRight: 'auto',
}

/**
 * Detailseite einer Bestiarium-Wildgruppe (Sprint 60.5f).
 *
 * V1 = nur Wildart-Aufschlüsselung. Trophäen/Erstlinge/Charts sind out of
 * scope (60.6+) — diese Seite ist der strukturelle Andockpunkt dafür.
 * Bewusst eine eigene editorial-Seite (kein gefilterter Listen-Sprung):
 * zentriertes Specimen-Hero mit großem WildIcon (Bronze), Fraunces-Label,
 * Mono-Count; darunter die Aufschlüsselung als Zeilen mit Mono-Zahlen.
 */
export function BestiariumDetailContent({
  detail,
}: {
  detail: BestiariumDetail
}) {
  const { group, label, jagdjahrLabel, totalCount, speciesBreakdown } = detail
  const isEmpty = totalCount === 0

  return (
    <>
      <DetailTopBar title="Bestiarium" />

      <header style={HERO}>
        <WildIcon type={group} size={88} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={HERO_KICKER}>Bestiarium · {jagdjahrLabel}</div>
          <h1 style={HERO_TITLE}>{label}</h1>
        </div>
        <div style={HERO_COUNT}>
          {totalCount}
          <span style={HERO_COUNT_UNIT}>Stück</span>
        </div>
      </header>

      {isEmpty ? (
        <p style={ZERO}>Noch keine Erlegung in dieser Wildgruppe.</p>
      ) : (
        <section className="section" aria-label="Aufschlüsselung nach Wildart">
          <div className="detail-field-label">Aufschlüsselung</div>
          <div style={{ marginTop: '0.25rem' }}>
            {speciesBreakdown.map((entry, i) => (
              <div
                key={entry.species}
                style={{
                  ...ROW,
                  borderBottom:
                    i === speciesBreakdown.length - 1
                      ? 'none'
                      : ROW.borderBottom,
                }}
              >
                <span style={ROW_LABEL}>
                  {getWildArtLabelSingle(entry.species)}
                </span>
                <span style={ROW_COUNT}>
                  {entry.count}
                  <span style={ROW_COUNT_UNIT}>Stück</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
