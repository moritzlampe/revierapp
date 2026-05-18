import { DetailField } from './DetailField'
import { DetailHero } from './DetailHero'
import { DetailTopBar } from './DetailTopBar'
import { getSpeciesLabel } from '@/lib/wildArt'
import type { AnblickDetail } from '@/lib/diary/detail-types'

const DATE_FMT = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})
const TIME_FMT = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Berlin',
})

function formatDateGerman(iso: string): string {
  // occurredOn ist "YYYY-MM-DD" (Berlin) — als UTC-Mitternacht geparst,
  // in Berlin formatiert bleibt es derselbe Kalendertag.
  return DATE_FMT.format(new Date(iso))
}

function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso))
}

// species ist Freitext (Gruppen-Key wie "rehwild" ODER Einzelwert wie
// "fuchs"). getSpeciesLabel ist der dafür gebaute Resolver — identisch
// zur AnblickCard, damit Card und Detail dieselben Labels zeigen.
// (Plan-Pseudocode nannte getWildArtLabelSingle; getSpeciesLabel ist die
// für wild_events.species korrekte, mit der Card konsistente Wahl.)
function speciesLabel(species: string): string {
  return getSpeciesLabel(species)
}

function buildAnblickTitle(detail: AnblickDetail): string {
  const bd = detail.speciesBreakdown
  if (bd.length === 0) return 'Anblick'
  if (bd.length === 1) {
    return `${bd[0].count}× ${speciesLabel(bd[0].species)}`
  }
  const parts = bd
    .slice(0, 3)
    .map(({ species, count }) => `${count}× ${speciesLabel(species)}`)
  if (bd.length > 3) parts.push(`+${bd.length - 3}`)
  return parts.join(' · ')
}

function buildAnblickSubtitle(detail: AnblickDetail): string {
  const datum = formatDateGerman(detail.occurredOn)
  if (detail.hunt) return `${datum} · während ${detail.hunt.name}`
  return `${datum} · Solo-Beobachtung`
}

// Wildart-Zelle im Meta-Tier: single-species → ein Label;
// multi-species → nur die Wildarten (Counts stehen schon im Title).
function buildWildartValue(detail: AnblickDetail): string {
  const bd = detail.speciesBreakdown
  if (bd.length === 0) return '—'
  if (bd.length === 1) return speciesLabel(bd[0].species)
  return bd.map((s) => speciesLabel(s.species)).join(' · ')
}

type LatLng = { lat: number; lng: number }

function extractLatLng(position: unknown): LatLng | null {
  if (!position || typeof position !== 'object') return null
  if ('coordinates' in position) {
    const c = (position as { coordinates?: unknown }).coordinates
    if (
      Array.isArray(c) &&
      c.length >= 2 &&
      typeof c[0] === 'number' &&
      typeof c[1] === 'number'
    ) {
      // GeoJSON Point: [lng, lat]
      return { lat: c[1], lng: c[0] }
    }
  }
  if ('lat' in position && 'lng' in position) {
    const p = position as { lat?: unknown; lng?: unknown }
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      return { lat: p.lat, lng: p.lng }
    }
  }
  return null
}

const NOTE_TIME: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  color: 'var(--forest)',
  marginRight: '0.4rem',
}
const NOTE_ROW_GAP: React.CSSProperties = { marginTop: '0.6rem' }

/**
 * Anblick-Detailseite (Mockup V3, Sektion 3). N-zu-1-Aggregat aus
 * mehreren wild_events. Forest-Akzent, kein Foto (v1), kein Privacy-
 * Gating (deshalb keine userId-Prop). Server-kompatibel.
 */
export function AnblickDetailContent({ detail }: { detail: AnblickDetail }) {
  const notizen = detail.sightings
    .filter((s) => s.note && s.note.trim().length > 0)
    .map((s) => ({ time: s.occurred_at, note: s.note!.trim() }))
    .sort((a, b) => a.time.localeCompare(b.time))

  const anchorLocation = detail.sightings.find(
    (s) => s.location,
  )?.location
  const latLng = anchorLocation ? extractLatLng(anchorLocation) : null

  return (
    <>
      <DetailTopBar title="Anblick" />

      <DetailHero
        variant="anblick"
        kicker="Anblick"
        title={buildAnblickTitle(detail)}
        subtitle={buildAnblickSubtitle(detail)}
      />

      <section className="section" aria-label="Anblickdaten">
        <div className="meta-tier" aria-label="Beobachtung">
          <div className="tier-grid-2">
            <DetailField
              label="Anzahl"
              value={`${detail.totalCount} Stück`}
              emphasis="strong"
            />
            <DetailField
              label="Wildart"
              value={buildWildartValue(detail)}
              emphasis="strong"
            />
          </div>
        </div>
      </section>

      {notizen.length > 0 && (
        <section className="note-card forest" aria-label="Notiz">
          <div className="detail-field-label">Notiz</div>
          {notizen.length === 1 ? (
            <p>{notizen[0].note}</p>
          ) : (
            notizen.map((n, i) => (
              <p key={n.time + i} style={i > 0 ? NOTE_ROW_GAP : undefined}>
                <span style={NOTE_TIME}>{formatTime(n.time)} ·</span>
                {n.note}
              </p>
            ))
          )}
        </section>
      )}

      {latLng && (
        <section className="map-card forest" aria-label="Beobachtungsort">
          <div className="map-card-info">
            <div className="detail-field-label">Beobachtungsort</div>
            <div className="map-value">
              {latLng.lat.toFixed(3)}, {latLng.lng.toFixed(3)}
            </div>
          </div>
          <button type="button" className="diary-map-btn">
            Auf Karte
          </button>
        </section>
      )}
    </>
  )
}
