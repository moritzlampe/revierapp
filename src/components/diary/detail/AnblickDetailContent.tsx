'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Info } from '@phosphor-icons/react'
import { DetailField } from './DetailField'
import { DetailHero } from './DetailHero'
import { DetailTopBar } from './DetailTopBar'
import { GenderSheet } from '@/components/diary/edit-sheets/GenderSheet'
import { WeightSheet } from '@/components/diary/edit-sheets/WeightSheet'
import { DistanceSheet } from '@/components/diary/edit-sheets/DistanceSheet'
import { PhotoSheet } from '@/components/diary/edit-sheets/PhotoSheet'
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
  return DATE_FMT.format(new Date(iso))
}

function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso))
}

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

type EditField = 'gender' | 'weight' | 'distance' | 'photo' | null

function formatGender(value: string | null): string {
  if (value === 'male') return 'Männlich'
  if (value === 'female') return 'Weiblich'
  return '—'
}

function formatWeight(value: number | null): string {
  if (value === null) return '—'
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
}

function formatDistance(value: number | null): string {
  if (value === null) return '—'
  return `${value} m`
}

/**
 * Anblick-Detailseite (Mockup V3, Sektion 3). N-zu-1-Aggregat aus mehreren
 * wild_events. Bei N=1 erlaubt 60.5e-2 das Editieren von gender, weight,
 * distance und photo_url via Field-Sheets. Bei N>1 zeigen wir nur einen
 * dezenten Hinweis-Block — Detail-Edit auf Aggregaten ist semantisch nicht
 * eindeutig (welche Sighting würde geändert?).
 */
export function AnblickDetailContent({ detail }: { detail: AnblickDetail }) {
  const router = useRouter()
  const [editingField, setEditingField] = useState<EditField>(null)

  const sightings = detail.sightings
  const hasSingle = sightings.length === 1
  const singleSighting = hasSingle ? sightings[0] : null

  const notizen = detail.sightings
    .filter((s) => s.note && s.note.trim().length > 0)
    .map((s) => ({ time: s.occurred_at, note: s.note!.trim() }))
    .sort((a, b) => a.time.localeCompare(b.time))

  const anchorLocation = detail.sightings.find((s) => s.location)?.location
  const latLng = anchorLocation ? extractLatLng(anchorLocation) : null

  // Close the sheet and let the server loader re-fetch the row. router.refresh()
  // triggers a server roundtrip; the new Props arrive and the tiles show the
  // updated values without a page reload.
  const handleSaved = () => {
    router.refresh()
    setEditingField(null)
  }
  const handleCancel = () => setEditingField(null)

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

      {/* Edit-Tiles (N=1) or Hinweis-Block (N>1) */}
      {singleSighting ? (
        <section className="section" aria-label="Beobachtungsdetails">
          <div className="anblick-edit-tiles">
            <EditTile
              label="Geschlecht"
              value={formatGender(singleSighting.gender)}
              empty={singleSighting.gender === null}
              onTap={() => setEditingField('gender')}
            />
            <EditTile
              label="Gewicht"
              value={formatWeight(singleSighting.weight_estimate_kg)}
              empty={singleSighting.weight_estimate_kg === null}
              onTap={() => setEditingField('weight')}
            />
            <EditTile
              label="Entfernung"
              value={formatDistance(singleSighting.distance_m)}
              empty={singleSighting.distance_m === null}
              onTap={() => setEditingField('distance')}
            />
            <PhotoEditTile
              photoUrl={singleSighting.photo_url}
              onTap={() => setEditingField('photo')}
            />
          </div>
        </section>
      ) : (
        <section className="section" aria-label="Hinweis Detail-Bearbeitung">
          <div
            style={{
              display: 'flex',
              gap: '0.625rem',
              padding: '0.875rem 1rem',
              background: 'color-mix(in srgb, var(--slate) 12%, transparent)',
              border: '1px solid var(--slate-edge)',
              borderRadius: '0.75rem',
              color: 'var(--slate)',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
            }}
          >
            <Info size={18} weight="duotone" style={{ flexShrink: 0, marginTop: '0.0625rem' }} />
            <span>
              Detail-Bearbeitung verfügbar bei einzelnen Anblicken
              {` (${sightings.length} Anblicke aggregiert).`}
            </span>
          </div>
        </section>
      )}

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

      {/* Field-Sheets — mounted only when N=1, conditional on editingField */}
      {singleSighting && (
        <>
          <GenderSheet
            open={editingField === 'gender'}
            currentValue={
              singleSighting.gender as 'male' | 'female' | null
            }
            wildEventId={singleSighting.id}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
          <WeightSheet
            open={editingField === 'weight'}
            currentValue={singleSighting.weight_estimate_kg}
            wildEventId={singleSighting.id}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
          <DistanceSheet
            open={editingField === 'distance'}
            currentValue={singleSighting.distance_m}
            wildEventId={singleSighting.id}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
          <PhotoSheet
            open={editingField === 'photo'}
            currentPhotoUrl={singleSighting.photo_url}
            wildEventId={singleSighting.id}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        </>
      )}
    </>
  )
}

type EditTileProps = {
  label: string
  value: string
  empty: boolean
  onTap: () => void
}

function EditTile({ label, value, empty, onTap }: EditTileProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="anblick-edit-tile"
      aria-label={`${label}: ${empty ? 'hinzufügen' : 'ändern'}`}
    >
      <div className="anblick-edit-tile-label">{label}</div>
      <div className="anblick-edit-tile-row">
        <div
          className="anblick-edit-tile-value"
          style={{ color: empty ? 'var(--text-3)' : 'var(--text)' }}
        >
          {value}
        </div>
        <span className="anblick-edit-tile-action">
          {empty ? 'hinzufügen' : 'ändern'}
        </span>
      </div>
    </button>
  )
}

function PhotoEditTile({
  photoUrl,
  onTap,
}: {
  photoUrl: string | null
  onTap: () => void
}) {
  const empty = !photoUrl
  return (
    <button
      type="button"
      onClick={onTap}
      className="anblick-edit-tile"
      aria-label={empty ? 'Foto hinzufügen' : 'Foto ändern'}
    >
      <div className="anblick-edit-tile-label">Foto</div>
      <div className="anblick-edit-tile-row">
        {empty ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-3)',
              fontSize: '0.9375rem',
              fontWeight: 600,
            }}
          >
            <Camera size={20} weight="duotone" />
            Foto hinzufügen
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            style={{
              width: '3.75rem',
              height: '3.75rem',
              borderRadius: '0.625rem',
              objectFit: 'cover',
              border: '1px solid var(--border)',
            }}
          />
        )}
        <span className="anblick-edit-tile-action">
          {empty ? 'hinzufügen' : 'ändern'}
        </span>
      </div>
    </button>
  )
}
