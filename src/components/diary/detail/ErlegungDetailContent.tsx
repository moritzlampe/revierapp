import { DetailField } from './DetailField'
import { DetailHero } from './DetailHero'
import { getWildArtLabelSingle } from '@/lib/wildArt'
import { HIT_LOCATION_LABEL, GESCHLECHT_LABEL } from '@/lib/diary/labels'
import type { ErlegungDetail } from '@/lib/diary/detail-types'
import type { Database } from '@/lib/supabase/database.types'

type Kill = Database['public']['Tables']['kills']['Row']
type Hunt = Database['public']['Tables']['hunts']['Row']

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

const DASH = '—'

function dash(v: unknown): string {
  if (v === null || v === undefined) return DASH
  const s = String(v).trim()
  return s === '' ? DASH : s
}

function formatDateGerman(iso: string | null): string {
  if (!iso) return DASH
  return DATE_FMT.format(new Date(iso))
}

function formatTime(iso: string | null): string {
  if (!iso) return DASH
  return TIME_FMT.format(new Date(iso))
}

function formatWeight(kg: number | null): string {
  if (kg === null) return DASH
  return `${kg.toLocaleString('de-DE')} kg`
}

function buildSubtitle(kill: Kill, hunt: Hunt | null): string {
  const datum = formatDateGerman(kill.erlegt_am)
  const kontext =
    hunt && hunt.kind === 'group' ? `Teil von ${hunt.name}` : 'Solo-Ansitz'
  return `${datum} · ${kontext}`
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

/**
 * Detailseite einer einzelnen Erlegung (Mockup V3, Sektion 1).
 * Server-kompatibel (kein 'use client' — keine Interaktivität in v1;
 * der "Auf Karte"-Button ist ein Stub ohne Handler, Modal ist v2).
 *
 * Foto-Konvention (Phase 4, Phase 7 verfeinert): photos[0] = Hero,
 * photos[1..] = "Weitere Fotos"-Stack (kein Doppel-Render des Hero-Fotos).
 */
export function ErlegungDetailContent({ detail }: { detail: ErlegungDetail }) {
  const { kill, hunt, photos } = detail

  const heroPhoto = photos[0]?.url ?? null
  const weitereFotos = photos.slice(1)

  const hasSchussdaten =
    !!kill.erlegt_am || kill.distance_m !== null || !!kill.hit_location
  const hasStueckdaten =
    !!kill.geschlecht || !!kill.altersklasse || kill.gewicht_kg !== null
  const hasWaffendaten = !!kill.waffe || !!kill.kaliber

  const latLng = extractLatLng(kill.position)
  const hasNotiz = !!kill.notiz && kill.notiz.trim() !== ''

  const visibleThumbs = weitereFotos.slice(0, 3)
  const moreCount = weitereFotos.length - visibleThumbs.length

  return (
    <>
      <DetailHero
        variant="erlegung"
        photoUrl={heroPhoto}
        title={getWildArtLabelSingle(kill.wild_art)}
        subtitle={buildSubtitle(kill, hunt)}
        capitalChip={kill.kapital === true}
      />

      <section className="section" aria-label="Erlegungsdaten">
        {hasSchussdaten && (
          <div className="meta-tier" aria-label="Schussdaten">
            <div className="tier-grid-3">
              <DetailField
                label="Schusszeit"
                value={formatTime(kill.erlegt_am)}
                emphasis="strong"
              />
              <DetailField
                label="Schussentfernung"
                value={
                  kill.distance_m !== null ? `${kill.distance_m} m` : DASH
                }
                emphasis="strong"
              />
              <DetailField
                label="Trefferlage"
                value={
                  kill.hit_location
                    ? (HIT_LOCATION_LABEL[kill.hit_location] ??
                      kill.hit_location)
                    : DASH
                }
                emphasis="strong"
              />
            </div>
          </div>
        )}

        {hasStueckdaten && (
          <div className="meta-tier" aria-label="Stückdaten">
            <div className="tier-grid-3">
              <DetailField
                label="Geschlecht"
                value={
                  kill.geschlecht
                    ? (GESCHLECHT_LABEL[kill.geschlecht] ?? kill.geschlecht)
                    : DASH
                }
                emphasis="medium"
              />
              <DetailField
                label="Altersklasse"
                value={dash(kill.altersklasse)}
                emphasis="medium"
              />
              <DetailField
                label="Gewicht"
                value={formatWeight(kill.gewicht_kg)}
                emphasis="medium"
              />
            </div>
          </div>
        )}

        {hasWaffendaten && (
          <div className="meta-tier" aria-label="Waffendaten">
            <div className="tier-grid-2">
              <DetailField
                label="Waffe"
                value={dash(kill.waffe)}
                emphasis="soft"
              />
              <DetailField
                label="Kaliber"
                value={dash(kill.kaliber)}
                emphasis="soft"
              />
            </div>
          </div>
        )}

        {weitereFotos.length > 0 && (
          <div className="photo-stack-wrap" aria-label="Weitere Fotos">
            <div className="detail-field-label">
              Weitere Fotos ({weitereFotos.length})
            </div>
            <div className="photo-stack">
              {visibleThumbs.map((p) => (
                <div className="thumb" key={p.id}>
                  <img src={p.url} alt="" decoding="async" />
                </div>
              ))}
              {moreCount > 0 && (
                <div
                  className="thumb more"
                  aria-label={`Weitere ${moreCount} Fotos`}
                >
                  <span>+{moreCount}</span>
                  <span>Bilder</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {hasNotiz && (
        <section className="note-card" aria-label="Notiz">
          <div className="detail-field-label">Notiz</div>
          <p>{kill.notiz}</p>
        </section>
      )}

      {latLng && (
        <section className="map-card" aria-label="Erlegungsort">
          <div>
            <div className="detail-field-label">Erlegungsort</div>
            <div className="map-value">
              {latLng.lat.toFixed(3)}, {latLng.lng.toFixed(3)}
            </div>
          </div>
          <button type="button" className="map-btn">
            Auf Karte
          </button>
        </section>
      )}
    </>
  )
}
