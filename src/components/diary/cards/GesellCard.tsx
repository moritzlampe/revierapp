import {
  Users,
  MagnifyingGlass,
  CaretRight,
} from '@phosphor-icons/react/dist/ssr'
import type { TimelineGesell } from '@/lib/diary/timeline'
import JagdtagBlock from './JagdtagBlock'
import TotalStrecke from './TotalStrecke'

interface Props {
  item: TimelineGesell
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

// Inline-Lookup, identisch zu AnblickCard. Zentralisierung kommt in einem
// späteren Refactor-Mini-Sprint (siehe 2.3.3-Brief).
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

function isVisibleNote(raw: string | null): raw is string {
  if (!raw) return false
  const trimmed = raw.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('[TEST') || trimmed.includes('[TEST ')) return false
  return true
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
  background: 'var(--slate)',
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
  color: 'var(--slate)',
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

const TYPE_PILL_ROW: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.25rem',
  marginTop: '0.375rem',
}

const TYPE_PILL: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '3px 7px',
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
  fontWeight: 500,
  color: 'var(--text)',
  letterSpacing: '0.02em',
}

const NOTE: React.CSSProperties = {
  marginTop: '0.5625rem',
  fontFamily: 'var(--font-body)',
  fontSize: '12.5px',
  lineHeight: 1.5,
  color: 'var(--text-muted)',
  borderLeft: '2px solid var(--slate-edge)',
  paddingLeft: '9px',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const HUNT_FOOT: React.CSSProperties = {
  marginTop: '0.5625rem',
  paddingTop: '0.5rem',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
  color: 'var(--text-muted)',
  letterSpacing: '0.04em',
}

const HUNT_FOOT_STATS: React.CSSProperties = {
  display: 'flex',
  gap: '14px',
}

const HUNT_FOOT_STAT: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
}

function nachsuchePlural(n: number): string {
  return n === 1 ? '1 Nachsuche' : `${n} Nachsuchen`
}

function teilnehmerPlural(n: number): string {
  return n === 1 ? '1 Teilnehmer' : `${n} Teilnehmer`
}

export default function GesellCard({ item }: Props) {
  const day = formatDay(item.occurredAt)
  const timeRange = formatTimeRange(item.startedAt, item.endedAt)
  const typeLabel = HUNT_TYPE_LABEL[item.huntType] ?? item.huntType
  const note = isVisibleNote(item.notiz) ? item.notiz : null

  return (
    <div data-card-kind="gesell" style={CARD_BG}>
      <span aria-hidden="true" style={TYPE_DOT} />
      <div style={CARD_INNER}>
        <div style={CARD_KIND}>Gesellschaftsjagd</div>
        <div style={CARD_META}>
          <span>{day}</span>
          {timeRange ? (
            <>
              <span style={META_SEP}>·</span>
              <span>{timeRange}</span>
            </>
          ) : null}
        </div>

        <h2 style={CARD_TITLE}>{item.huntName}</h2>

        <div style={TYPE_PILL_ROW}>
          <span style={TYPE_PILL}>{typeLabel}</span>
        </div>

        <JagdtagBlock kills={item.deinAnteil} anblicke={item.deineAnblicke} />

        <TotalStrecke data={item.gesamtStrecke} />

        {note ? <div style={NOTE}>{note}</div> : null}

        <div style={HUNT_FOOT}>
          <div style={HUNT_FOOT_STATS}>
            <span style={HUNT_FOOT_STAT}>
              <Users size={12} weight="regular" color="var(--text-dim)" />
              {teilnehmerPlural(item.teilnehmerCount)}
            </span>
            {item.nachsucheCount > 0 ? (
              <span style={HUNT_FOOT_STAT}>
                <MagnifyingGlass size={12} weight="regular" color="var(--text-dim)" />
                {nachsuchePlural(item.nachsucheCount)}
              </span>
            ) : null}
          </div>
          <CaretRight size={14} weight="regular" color="var(--text-dim)" />
        </div>
      </div>
    </div>
  )
}
