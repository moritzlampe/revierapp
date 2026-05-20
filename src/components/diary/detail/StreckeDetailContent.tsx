import Link from 'next/link'
import { DetailField } from './DetailField'
import { DetailHero } from './DetailHero'
import { DetailTopBar } from './DetailTopBar'
import { getWildArtLabelSingle, getWildGroupLabel } from '@/lib/wildArt'
import type { StreckeDetail } from '@/lib/diary/detail-types'

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

function formatTime(iso: string | null): string {
  if (!iso) return DASH
  return TIME_FMT.format(new Date(iso))
}

function formatDateLong(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10))
  if (!y || !m || !d) return dateKey
  // Mittags-UTC vermeidet TZ-Off-by-one in beide Richtungen.
  return DATE_FMT.format(new Date(Date.UTC(y, m - 1, d, 12)))
}

function teilnehmerCount(n: number): string {
  return n === 1 ? '1 Stück' : `${n} Stück`
}

/**
 * Detailseite einer Strecke-Aggregation (Hunt × Tag × Wildgruppe).
 *
 * Hero-Variante: 'neutral' (Brief-Decision 5) — Akzent-Rail aus, damit
 * künftige wildgruppen-spezifische Akzente vom Detail-Layout entkoppelt
 * bleiben. Card behält Bronze-Rail als Sammel-Akzent für "Strecke".
 */
export function StreckeDetailContent({ detail }: { detail: StreckeDetail }) {
  const { hunt, group, occurredOn, kills, totalCount, speciesBreakdown, photos } =
    detail

  const heroPhoto = photos[0]?.url ?? null
  const weitereFotos = photos.slice(1)
  const visibleThumbs = weitereFotos.slice(0, 3)
  const moreCount = weitereFotos.length - visibleThumbs.length

  const groupLabel = getWildGroupLabel(group)
  const dateLong = formatDateLong(occurredOn)
  const subtitle = `${dateLong} · Teil von ${hunt.name}`

  // Single-Wildart-Strecke → konkrete Wildart im Hero (z.B. "Hase" / "3 × Hase").
  // Multi-Wildart → Wildgruppe (z.B. "5 × Federwild"). Single-Wildart-Aufschlüsselung
  // ist im Übersichts-Block weiterhin sichtbar via "Wildgruppe"-Field.
  const titleLabel =
    speciesBreakdown.length === 1
      ? getWildArtLabelSingle(speciesBreakdown[0].species)
      : groupLabel
  const heroTitle =
    totalCount === 1 ? titleLabel : `${totalCount} × ${titleLabel}`

  const hasNotiz = !!hunt.notiz && hunt.notiz.trim() !== ''

  return (
    <>
      <DetailTopBar title="Strecke" />
      <DetailHero
        variant="neutral"
        photoUrl={heroPhoto}
        kicker="Strecke"
        title={heroTitle}
        subtitle={subtitle}
      />

      <section className="section" aria-label="Streckendaten">
        <div className="meta-tier" aria-label="Übersicht">
          <div className="tier-grid-2">
            <DetailField
              label="Wildgruppe"
              value={groupLabel}
              emphasis="strong"
            />
            <DetailField
              label="Gesamt"
              value={teilnehmerCount(totalCount)}
              emphasis="strong"
            />
          </div>
        </div>

        {speciesBreakdown.length > 1 && (
          <div className="meta-tier" aria-label="Aufschlüsselung">
            <div className="detail-field-label">Aufschlüsselung</div>
            <div className="kill-list" style={{ marginTop: '0.5rem' }}>
              {speciesBreakdown.map((entry) => (
                <div key={entry.species} className="kill-row" style={{ cursor: 'default' }}>
                  <div className="kill-avatar" aria-hidden="true" />
                  <div>
                    <div className="kill-title">
                      {getWildArtLabelSingle(entry.species)}
                    </div>
                    <div className="kill-meta">{entry.count} Stück</div>
                  </div>
                </div>
              ))}
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

      <section className="kill-card" aria-label="Einzelerlegungen">
        <div className="hunt-label">Einzelerlegungen ({totalCount})</div>
        <div className="kill-list">
          {kills.map((k) => (
            <Link
              key={k.id}
              href={`/app/du/tagebuch/erlegung/${k.id}`}
              className="kill-row"
            >
              <div className="kill-avatar" aria-hidden="true" />
              <div>
                <div className="kill-title">
                  {getWildArtLabelSingle(k.wild_art)}
                </div>
                <div className="kill-meta">
                  {formatTime(k.erlegt_am)}
                  {k.distance_m !== null ? ` · ca. ${k.distance_m} m` : ''}
                  {k.gewicht_kg !== null
                    ? ` · ${k.gewicht_kg.toLocaleString('de-DE')} kg`
                    : ''}
                </div>
              </div>
              <div className="chevron" aria-hidden="true">
                ›
              </div>
            </Link>
          ))}
        </div>
      </section>

      {hasNotiz && (
        <section className="note-card" aria-label="Notiz">
          <div className="detail-field-label">Notiz</div>
          <p>{hunt.notiz}</p>
        </section>
      )}

      <button type="button" className="primary-action">
        Strecke teilen
      </button>
    </>
  )
}
