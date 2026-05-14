import type { TimelineAnblick } from '@/lib/diary/timeline'
import { getSpeciesLabel } from '@/lib/wildArt'
import { AutoCompletedChip } from '@/components/hunt/AutoCompletedChip'

interface Props {
  item: TimelineAnblick
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

const HUNT_TYPE_LABEL: Record<string, string> = {
  ansitz: 'Ansitz',
  pirsch: 'Pirsch',
  drueckjagd: 'Drückjagd',
  erntejagd: 'Erntejagd',
}

function formatDay(d: Date): string {
  return DATE_FMT.format(d).replace(/\.$/, '')
}

function formatTimeRange(start: Date | null, end: Date | null): string | null {
  if (!start && !end) return null
  if (start && end) {
    const s = TIME_FMT.format(start)
    const e = TIME_FMT.format(end)
    return s === e ? s : `${s}–${e}`
  }
  return TIME_FMT.format((start ?? end) as Date)
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
  background: 'var(--forest)',
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
  color: 'var(--forest)',
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

const META_SEP: React.CSSProperties = {
  color: 'var(--text-faint)',
  margin: '0 0.25rem',
}

const CARD_TITLE: React.CSSProperties = {
  marginTop: '0.25rem',
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: '1.125rem',
  lineHeight: 1.15,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
  fontVariationSettings: '"opsz" 144',
}

const CARD_SUBSTATUS: React.CSSProperties = {
  marginTop: '0.125rem',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  color: 'var(--text-dim)',
  letterSpacing: '0.04em',
}

const ANBLICK_LIST: React.CSSProperties = {
  marginTop: '0.5rem',
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text)',
  lineHeight: 1.3,
}

const AX: React.CSSProperties = {
  color: 'var(--forest)',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  marginRight: '1px',
}

const AX_SEP: React.CSSProperties = {
  color: 'var(--text-faint)',
  margin: '0 6px',
}

const NOTE: React.CSSProperties = {
  marginTop: '0.5rem',
  fontFamily: 'var(--font-body)',
  fontSize: '12.5px',
  lineHeight: 1.5,
  color: 'var(--text-muted)',
  borderLeft: '2px solid rgba(110,138,82,0.55)',
  paddingLeft: '9px',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

function isVisibleNote(raw: string | null): raw is string {
  if (!raw) return false
  const trimmed = raw.trim()
  if (trimmed === '') return false
  // Skip Test-Marker-Notes wie "Test-Anblick Solo, Rehwild [TEST 60.3.4 / A1]"
  // (volle TEST-Notizen werden auch dann gefiltert, wenn der Marker mid-string steht).
  if (trimmed.startsWith('[TEST') || trimmed.includes('[TEST ')) return false
  return true
}

export default function AnblickCard({ item }: Props) {
  const day = formatDay(item.occurredAt)
  const timeRange = formatTimeRange(item.startedAt, item.endedAt)
  const isHuntContext = item.huntId !== null

  const typeLabel = item.huntType
    ? (HUNT_TYPE_LABEL[item.huntType] ?? item.huntType)
    : null

  const note = isVisibleNote(item.notiz) ? item.notiz : null

  const sightingsLine = item.sightings.length > 0 ? (
    <div style={ANBLICK_LIST}>
      {item.sightings.map((s, i) => (
        <span key={s.species}>
          {i > 0 ? <span style={AX_SEP}>·</span> : null}
          <span style={AX}>{s.count}×</span>
          {getSpeciesLabel(s.species)}
        </span>
      ))}
    </div>
  ) : null

  return (
    <div data-card-kind="anblick" style={CARD_BG}>
      <span aria-hidden="true" style={TYPE_DOT} />
      <div style={CARD_INNER}>
        <div style={CARD_KIND}>Anblick</div>
        <div style={CARD_META}>
          <span>{day}</span>
          {timeRange ? (
            <>
              <span style={META_SEP}>·</span>
              <span>{timeRange}</span>
            </>
          ) : null}
          {item.huntId ? <AutoCompletedChip status={item.huntStatus} /> : null}
        </div>

        {isHuntContext ? (
          <>
            <h2 style={CARD_TITLE}>{item.huntName}</h2>
            <div style={CARD_SUBSTATUS}>
              {typeLabel ? `${typeLabel} · ohne Strecke` : 'ohne Strecke'}
            </div>
          </>
        ) : null}

        {sightingsLine}

        {note ? <div style={NOTE}>{note}</div> : null}
      </div>
    </div>
  )
}
