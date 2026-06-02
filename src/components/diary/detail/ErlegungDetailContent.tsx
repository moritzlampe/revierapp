'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera } from '@phosphor-icons/react'
import { DetailField } from './DetailField'
import { DetailHero } from './DetailHero'
import { DetailTopBar } from './DetailTopBar'
import { KillPhotoEditor } from './KillPhotoEditor'
import { getWildArtLabelSingle } from '@/lib/wildArt'
import { HIT_LOCATION_LABEL, GESCHLECHT_LABEL } from '@/lib/diary/labels'
import { extractLatLng } from '@/lib/diary/geo'
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
  // Hunt-Name enthält i.d.R. das Datum ("Jagd am 14.5.2026") — keine
  // Datums-Doppelung. Solo: Datum + Kontext (kein hunt.name vorhanden).
  if (hunt) return `Teil von ${hunt.name}`
  return `${formatDateGerman(kill.erlegt_am)} · Solo-Ansitz`
}

/**
 * Detailseite einer einzelnen Erlegung (Mockup V3, Sektion 1).
 * Server-kompatibel (kein 'use client' — keine Interaktivität in v1;
 * der "Auf Karte"-Button ist ein Stub ohne Handler, Modal ist v2).
 *
 * Foto-Konvention (Phase 4, Phase 7 verfeinert): photos[0] = Hero,
 * photos[1..] = "Weitere Fotos"-Stack (kein Doppel-Render des Hero-Fotos).
 */
export function ErlegungDetailContent({
  detail,
  userId,
}: {
  detail: ErlegungDetail
  userId: string
}) {
  const router = useRouter()
  const { kill, hunt } = detail

  // Lokaler Foto-State für Sofort-Commit-Edits. Add/Remove pflegen ihn direkt.
  // detail.photos ist die Server-Wahrheit; nach router.refresh() (Editor-Close)
  // kommt eine neue Referenz mit frischer Hero/Cover-Sortierung — wir spiegeln
  // sie per „adjust state during render"-Pattern (kein Effect → kein
  // kaskadierender Re-Render), siehe react.dev/learn/you-might-not-need-an-effect.
  const [serverPhotos, setServerPhotos] = useState(detail.photos)
  const [photos, setPhotos] = useState(detail.photos)
  if (serverPhotos !== detail.photos) {
    setServerPhotos(detail.photos)
    setPhotos(detail.photos)
  }

  const [editorOpen, setEditorOpen] = useState(false)

  // Foto-Bearbeiten braucht einen Hunt-Anker (hunt_photos.hunt_id ist NOT
  // NULL). hunt_id == null ist in der Praxis ~nie (count=0) — defensiv (E4).
  const canEditPhotos = kill.hunt_id !== null

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
      <DetailTopBar title="Erlegung" />
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
                  kill.distance_m !== null
                    ? `ca. ${kill.distance_m} m`
                    : DASH
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

        {canEditPhotos && (
          <button
            type="button"
            className="anblick-edit-tile"
            onClick={() => setEditorOpen(true)}
            aria-label={photos.length === 0 ? 'Foto hinzufügen' : 'Fotos bearbeiten'}
            style={{ marginTop: weitereFotos.length > 0 ? '0.875rem' : undefined }}
          >
            <div className="anblick-edit-tile-label">Fotos</div>
            <div className="anblick-edit-tile-row">
              <div
                className="anblick-edit-tile-value"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Camera size={20} weight="duotone" style={{ color: 'var(--bronze)' }} />
                {photos.length === 0
                  ? 'Foto hinzufügen'
                  : `${photos.length} Foto${photos.length === 1 ? '' : 's'}`}
              </div>
              <span className="anblick-edit-tile-action">
                {photos.length === 0 ? 'hinzufügen' : 'bearbeiten'}
              </span>
            </div>
          </button>
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
          <div className="map-card-info">
            <div className="detail-field-label">Erlegungsort</div>
            <div className="map-value">
              {latLng.lat.toFixed(3)}, {latLng.lng.toFixed(3)}
            </div>
          </div>
          <button type="button" className="diary-map-btn">
            Auf Karte
          </button>
        </section>
      )}

      {kill.hunt_id && (
        <KillPhotoEditor
          open={editorOpen}
          onOpenChange={(o) => {
            setEditorOpen(o)
            // Beim Schließen Server-Stand synchronisieren (Hero/Cover-Sortierung).
            if (!o) router.refresh()
          }}
          photos={photos}
          killId={kill.id}
          huntId={kill.hunt_id}
          userId={userId}
          onAdded={(p) => setPhotos((prev) => [...prev, p])}
          onRemoved={(id) => setPhotos((prev) => prev.filter((x) => x.id !== id))}
        />
      )}
    </>
  )
}
