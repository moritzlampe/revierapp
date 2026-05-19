import Link from 'next/link'
import { DetailField } from './DetailField'
import { DetailHero } from './DetailHero'
import { DetailTopBar } from './DetailTopBar'
import { getWildArtLabelSingle } from '@/lib/wildArt'
import {
  aggregateByWildGroup,
  type WildGroupAggregateItem,
} from '@/lib/species-config'
import type { GesellDetail } from '@/lib/diary/detail-types'
import type { Database } from '@/lib/supabase/database.types'

type Hunt = Database['public']['Tables']['hunts']['Row']
type HuntType = Database['public']['Enums']['hunt_type']

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

// hunt_type-Enum (geschlossen, 4 Werte) → Gesell-Kontext-Label.
// Ansitz/Pirsch mit ≥2 Teilnehmern liest sich als "Gesellschaftsjagd"
// besser denn als "Ansitz".
const GESELL_TYPE_LABEL: Record<HuntType, string> = {
  ansitz: 'Gesellschaftsjagd',
  pirsch: 'Gesellschaftsjagd',
  drueckjagd: 'Drückjagd',
  erntejagd: 'Erntejagd',
}

function gesellTypeLabel(type: HuntType | null, fallback: string): string {
  if (!type) return fallback
  return GESELL_TYPE_LABEL[type] ?? fallback
}

function formatDateGerman(iso: string | null): string | null {
  if (!iso) return null
  return DATE_FMT.format(new Date(iso))
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return TIME_FMT.format(new Date(iso))
}

function formatDauer(hunt: Hunt): string {
  if (!hunt.started_at || !hunt.ended_at) return '—'
  return `${formatTime(hunt.started_at)} – ${formatTime(hunt.ended_at)}`
}

function buildHeroSubtitle(hunt: Hunt, participantCount: number): string {
  const datum = formatDateGerman(hunt.started_at ?? hunt.ended_at)
  const teil = `${participantCount} Schützen`
  return datum ? `${datum} · ${teil}` : teil
}

/**
 * Wildgruppen-Kurzform: "4× Schwarzwild · 1× Rehwild".
 * Count+× fett (Mockup-V3-Pattern), Mittelpunkt als Separator.
 * Leere Aggregation → nichts rendern.
 */
function GroupBreakdown({ items }: { items: WildGroupAggregateItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="hunt-breakdown">
      {items.map((it, i) => (
        <span key={it.groupKey}>
          {i > 0 ? ' · ' : ''}
          <strong>{it.count}×</strong>
          {' '}
          {it.groupLabel}
        </span>
      ))}
    </div>
  )
}

/**
 * Gesellschaftsjagd-Detailseite (Mockup V3, Sektion 2).
 * Server-kompatibel (DetailTopBar ist die einzige Client-Insel).
 * userId für Privacy-Logik + Eigene-Kills-Filter (Prop von page.tsx).
 */
export function GesellDetailContent({
  detail,
  userId,
}: {
  detail: GesellDetail
  userId: string
}) {
  const { hunt, kills, participantCount, totalKills, userKills, userRole } =
    detail

  const typeLabel = gesellTypeLabel(hunt.type, 'Gesellschaftsjagd')
  const kicker = gesellTypeLabel(hunt.type, 'Gemeinschaftsjagd')

  const statusChip =
    hunt.status === 'completed' || hunt.status === 'auto_completed'
      ? 'abgeschlossen'
      : null

  // Nur eigene Kills im "Deine Erlegungen"-Block (5.7).
  const ownKills = kills.filter((k) => k.reporter_id === userId)

  // 60.5b: Strecke auf Wildgruppen-Ebene aggregiert (Count desc,
  // Picker-Reihenfolge als Tie-Breaker). Gesamtstrecke immer sichtbar —
  // share_total_strecke-Gating wird in 60.5b entfernt.
  const totalAgg = aggregateByWildGroup(
    kills.map((k) => ({ wild_art: k.wild_art })),
  )
  const ownAgg = aggregateByWildGroup(
    ownKills.map((k) => ({ wild_art: k.wild_art })),
  )
  const hasNotiz = !!hunt.notiz && hunt.notiz.trim() !== ''

  return (
    <>
      <DetailTopBar title={typeLabel} />

      <DetailHero
        variant="gesell"
        photoUrl={detail.coverPhoto?.url ?? null}
        kicker={kicker}
        title={hunt.name}
        subtitle={buildHeroSubtitle(hunt, participantCount)}
        statusChip={statusChip}
      />

      <section className="section" aria-label="Jagddaten">
        <div className="meta-tier" aria-label="Jagdrahmen">
          <div className="tier-grid-2">
            <DetailField
              label="Jagdart"
              value={typeLabel}
              emphasis="strong"
            />
            <DetailField
              label="Dauer"
              value={formatDauer(hunt)}
              emphasis="strong"
            />
          </div>
        </div>

        <div className="meta-tier" aria-label="Teilnahme">
          <div className="tier-grid-2">
            <DetailField
              label="Teilnehmer"
              value={`${participantCount} Schützen`}
              emphasis="medium"
            />
            <DetailField
              label="Deine Rolle"
              value={userRole}
              emphasis="medium"
            />
          </div>
        </div>
      </section>

      <section className="hunt-card" aria-label="Strecke">
        <div className="hunt-summary-stack">
          <div className="hunt-summary-row hunt-summary-row--total">
            <div className="hunt-label">Gesamtstrecke aller Schützen</div>
            <div className="hunt-big">{totalKills} Stück</div>
            <GroupBreakdown items={totalAgg} />
          </div>
          <div className="hunt-summary-row hunt-summary-row--own">
            <div className="hunt-label">Deine Strecke</div>
            <div className="hunt-medium">{userKills} Stück</div>
            <GroupBreakdown items={ownAgg} />
          </div>
        </div>
      </section>

      {ownKills.length > 0 && (
        <section className="kill-card" aria-label="Deine Erlegungen">
          <div className="hunt-label">Deine Erlegungen ({userKills})</div>
          <div className="kill-list">
            {ownKills.map((k) => (
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
                  </div>
                </div>
                <div className="chevron" aria-hidden="true">
                  ›
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {hasNotiz && (
        <section className="note-card slate" aria-label="Notiz der Jagdleitung">
          <div className="detail-field-label">Notiz der Jagdleitung</div>
          <p>{hunt.notiz}</p>
        </section>
      )}

      <button type="button" className="primary-action">
        Strecke teilen
      </button>
    </>
  )
}
