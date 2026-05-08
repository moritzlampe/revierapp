import {
  Scales,
  ArrowsHorizontal,
  ThermometerSimple,
  LinkSimpleHorizontal,
} from '@phosphor-icons/react/dist/ssr'
import type { TimelineErlegung } from '@/lib/diary/timeline'
import { getWildArtLabelSingle } from '@/lib/wildArt'

interface Props {
  item: TimelineErlegung
  /**
   * Hunt-Name to render in the "Teil von: …" breadcrumb. Pass null to omit.
   * Caller (tagebuch-content) decides this: only set when the hunt itself is
   * NOT independently rendered as a GesellCard in the current view (Konzept V3 §3).
   */
  breadcrumbText: string | null
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
  // Intl gives "24. Apr." — strip trailing dot for the mockup look.
  return DATE_FMT.format(d).replace(/\.$/, '')
}

function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(/\.0$/, '')
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

const PILLS_ROW: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.25rem',
  marginTop: '0.5rem',
}

const PILL: React.CSSProperties = {
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

const PILL_UNIT: React.CSSProperties = {
  color: 'var(--text-muted)',
  marginLeft: '1px',
  fontSize: 'inherit',
}

const NOTE: React.CSSProperties = {
  marginTop: '0.5rem',
  fontFamily: 'var(--font-body)',
  fontSize: '12.5px',
  lineHeight: 1.5,
  color: 'var(--text-muted)',
  borderLeft: '2px solid var(--bronze-dim)',
  paddingLeft: '9px',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const BREADCRUMB: React.CSSProperties = {
  marginTop: '0.5rem',
  paddingTop: '0.5rem',
  borderTop: '1px dashed var(--border-2)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  color: 'var(--text-dim)',
  letterSpacing: '0.04em',
}

const PHOTO_WRAPPER: React.CSSProperties = {
  display: 'flex',
  gap: '0.6875rem',
}

const PHOTO_TILE: React.CSSProperties = {
  flex: '0 0 70px',
  width: '70px',
  alignSelf: 'stretch',
  minHeight: '70px',
  borderRadius: '9px',
  border: '1px solid var(--border)',
  position: 'relative',
  overflow: 'hidden',
  background: 'var(--surface-2)',
}

const PHOTO_IMG: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
}

const PHOTO_BODY: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

export default function ErlegungCard({ item, breadcrumbText }: Props) {
  const title = getWildArtLabelSingle(item.species)
  const day = formatDay(item.occurredAt)
  const time = TIME_FMT.format(item.occurredAt)
  const place = item.place

  const tempC = item.weatherSnapshot?.temp_c
  const hasWeight = item.gewichtKg !== null && item.gewichtKg > 0
  const hasDistance = item.distanceM !== null && item.distanceM > 0
  const hasTemp = typeof tempC === 'number'
  const hasAnyPill = hasWeight || hasDistance || hasTemp

  const meta = (
    <div style={CARD_META}>
      <span className="when">{day}</span>
      <span className="sep" style={CARD_META_SEP}>·</span>
      <span className="time">{time}</span>
      {place ? (
        <>
          <span className="sep" style={CARD_META_SEP}>·</span>
          <span className="place">{place}</span>
        </>
      ) : null}
    </div>
  )

  const pills = hasAnyPill ? (
    <div style={PILLS_ROW}>
      {hasWeight ? (
        <span style={PILL}>
          <Scales size={11} weight="regular" color="var(--text-muted)" />
          {formatWeight(item.gewichtKg as number)}
          <small style={PILL_UNIT}>kg</small>
        </span>
      ) : null}
      {hasDistance ? (
        <span style={PILL}>
          <ArrowsHorizontal size={11} weight="regular" color="var(--text-muted)" />
          {item.distanceM}
          <small style={PILL_UNIT}>m</small>
        </span>
      ) : null}
      {hasTemp ? (
        <span style={PILL}>
          <ThermometerSimple size={11} weight="regular" color="var(--text-muted)" />
          {Math.round(tempC as number)}°C
        </span>
      ) : null}
    </div>
  ) : null

  const note = item.notiz ? <div style={NOTE}>{item.notiz}</div> : null

  const breadcrumb = breadcrumbText ? (
    <div style={BREADCRUMB}>
      <LinkSimpleHorizontal size={11} weight="regular" color="var(--text-faint)" />
      <span>
        Teil von:{' '}
        <b style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{breadcrumbText}</b>
      </span>
    </div>
  ) : null

  const body = (
    <>
      <div style={CARD_KIND}>Erlegung</div>
      {meta}
      <h2 style={CARD_TITLE}>{title}</h2>
      {pills}
      {note}
      {breadcrumb}
    </>
  )

  return (
    <div data-card-kind="erlegung" style={CARD_BG}>
      <span aria-hidden="true" style={TYPE_DOT} />
      <div style={CARD_INNER}>
        {item.fotoUrl ? (
          <div style={PHOTO_WRAPPER}>
            <div style={PHOTO_TILE}>
              {/* iOS Safari Bug: NEVER set loading="lazy" inside a deferred-visible
                  container — images then sometimes fail to load. */}
              <img
                src={item.fotoUrl}
                alt=""
                style={PHOTO_IMG}
                decoding="async"
              />
            </div>
            <div style={PHOTO_BODY}>{body}</div>
          </div>
        ) : (
          body
        )}
      </div>
    </div>
  )
}
