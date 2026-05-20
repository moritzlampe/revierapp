import Link from 'next/link'
import type { TimelineStrecke } from '@/lib/diary/timeline'
import { getWildArtLabelSingle, getWildGroupLabel } from '@/lib/wildArt'
import { toBerlinDateKey } from '@/lib/diary/time'

interface Props {
  item: TimelineStrecke
}

const DATE_FMT = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Berlin',
})
const TIME_FMT = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Berlin',
})

function formatDay(d: Date): string {
  return DATE_FMT.format(d).replace(/\.$/, '')
}

const CARD_BG: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '13px',
  marginBottom: '0.5rem',
  position: 'relative',
}

const TYPE_DOT: React.CSSProperties = {
  position: 'absolute',
  left: '-1rem',
  top: '1rem',
  width: '9px',
  height: '9px',
  borderRadius: '50%',
  background: 'var(--bronze)',
  boxShadow: '0 0 0 3px var(--bg)',
  zIndex: 2,
  pointerEvents: 'none',
}

const CARD_INNER: React.CSSProperties = { padding: '0.6875rem 0.75rem' }

const CARD_KIND: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: 'var(--bronze)',
  lineHeight: 1,
  marginBottom: '0.25rem',
}

const CARD_META: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
  color: 'var(--text-dim)',
  letterSpacing: '0.04em',
  lineHeight: 1.3,
}

const CARD_META_SEP: React.CSSProperties = {
  color: 'var(--text-faint)',
  margin: '0 0.25rem',
}

const TITLE_ROW: React.CSSProperties = {
  marginTop: '0.25rem',
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '0.75rem',
}

const CARD_TITLE: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: '1.125rem',
  lineHeight: 1.15,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
  fontVariationSettings: '"opsz" 144',
  margin: 0,
}

const COUNT_BLOCK: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  fontSize: '1.125rem',
  color: 'var(--bronze)',
  letterSpacing: '0.02em',
  lineHeight: 1.15,
  whiteSpace: 'nowrap',
}

const COUNT_UNIT: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-dim)',
  marginLeft: '0.25rem',
  letterSpacing: '0.04em',
}

const BREAKDOWN: React.CSSProperties = {
  marginTop: '0.5rem',
  paddingTop: '0.5rem',
  borderTop: '1px dashed var(--border-2)',
  fontFamily: 'var(--font-body)',
  fontSize: '12.5px',
  fontWeight: 500,
  color: 'var(--text)',
  lineHeight: 1.3,
  letterSpacing: '0.005em',
}

const BREAKDOWN_NUM: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  color: 'var(--text-muted)',
  fontSize: '12px',
  marginRight: '1px',
}

const BREAKDOWN_SEP: React.CSSProperties = {
  color: 'var(--text-faint)',
  margin: '0 6px',
}

/**
 * Strecke-Card im Tagebuch. Aggregat von ≥1 Solo-Kill derselben
 * Wildgruppe an einem Tag (Schwelle siehe SOLO_AGGREGATE_THRESHOLD /
 * aggregatePerDay in species-config.ts). Bronze-Rail wie Erlegung.
 *
 * Text-Konvention (Sprint 60.5a Vorab-Entscheidung):
 *  - Gesamt-Count immer als "N Stück" (auch 1)
 *  - Breakdown bei Single-Wildart + totalCount===1: nur Label ("Hase")
 *  - Sonst: "N× Label", Mittelpunkt als Separator
 */
export default function StreckeCard({ item }: Props) {
  // Single-Wildart-Strecke → konkrete Wildart als Title (z.B. "Hase").
  // Multi-Wildart → abstrakte Wildgruppe (z.B. "Federwild" bei 3 Enten + 2 Tauben).
  const title =
    item.speciesBreakdown.length === 1
      ? getWildArtLabelSingle(item.speciesBreakdown[0].species)
      : getWildGroupLabel(item.species_group)
  const day = formatDay(item.occurredAt)
  const time = TIME_FMT.format(item.occurredAt)
  const place = item.huntName

  const dateKey = toBerlinDateKey(item.occurredAt)
  const href = `/app/du/tagebuch/strecke/${item.huntId}?d=${dateKey}&g=${item.species_group}`

  const isSingleSpeciesOne =
    item.totalCount === 1 && item.speciesBreakdown.length === 1

  return (
    <Link href={href} className="diary-card-link">
      <div data-card-kind="strecke" style={CARD_BG}>
        <span aria-hidden="true" style={TYPE_DOT} />
        <div style={CARD_INNER}>
          <div style={CARD_KIND}>Strecke</div>
          <div style={CARD_META}>
            <span>{day}</span>
            <span style={CARD_META_SEP}>·</span>
            <span>{time}</span>
            {place ? (
              <>
                <span style={CARD_META_SEP}>·</span>
                <span>{place}</span>
              </>
            ) : null}
          </div>

          <div style={TITLE_ROW}>
            <h2 style={CARD_TITLE}>{title}</h2>
            <span style={COUNT_BLOCK}>
              {item.totalCount}
              <span style={COUNT_UNIT}>Stück</span>
            </span>
          </div>

          <div style={BREAKDOWN}>
            {isSingleSpeciesOne ? (
              <span>{getWildArtLabelSingle(item.speciesBreakdown[0].species)}</span>
            ) : (
              item.speciesBreakdown.map((entry, i) => (
                <span key={`${entry.species}-${i}`}>
                  {i > 0 ? <span style={BREAKDOWN_SEP}>·</span> : null}
                  <span style={BREAKDOWN_NUM}>{entry.count}×</span>
                  {getWildArtLabelSingle(entry.species)}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
