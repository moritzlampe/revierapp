import Link from 'next/link'
import type { WildGroupAggregateItem } from '@/lib/species-config'
import { WildIcon } from '@/components/icons/WildIcon'

interface Props {
  /** Genau 8 Gruppen in Picker-Reihenfolge (aggregateWildGroupsFull). */
  items: WildGroupAggregateItem[]
  /** Aktuelles Jagdjahr (key) — wird als ?j= an die Detail-Route durchgereicht. */
  jagdjahrKey: string
}

const KICKER: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 500,
  color: 'var(--text-dim)',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  margin: '0.25rem 0.25rem 0.75rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
}

const GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '0.5rem',
}

const TILE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.375rem',
  padding: '0.875rem 0.25rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  textDecoration: 'none',
}

const COUNT: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  fontSize: '1.0625rem',
  color: 'var(--bronze)',
  letterSpacing: '0.01em',
  lineHeight: 1,
}

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.625rem',
  fontWeight: 500,
  color: 'var(--text-muted)',
  letterSpacing: '0.01em',
  lineHeight: 1.1,
  textAlign: 'center',
}

/**
 * Bestiarium-Grid (Sprint 60.5f): aggregierte Saison-Strecke pro Wildgruppe.
 * Fixe 8 Kacheln in Picker-Reihenfolge, 4 Spalten. Null-Gruppen werden
 * ausgegraut (opacity 0.5), NICHT ausgeblendet — feste Position (Muscle
 * Memory, 1:1 zum Picker). Jede Kachel navigiert zur Detail-Route.
 *
 * Eingeschoben zwischen Timeline-Gruppen (DiaryTimelineList), daher am
 * Card-Indent — die Rail läuft links wie bei jeder Card daneben.
 */
export default function BestiariumGrid({ items, jagdjahrKey }: Props) {
  return (
    <section style={{ marginBottom: '0.5rem' }} aria-label="Bestiarium — Strecke nach Wildgruppe">
      <div style={KICKER}>
        <span>Bestiarium</span>
        <span aria-hidden="true" style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>
      <div style={GRID}>
        {items.map(item => {
          const isZero = item.count === 0
          return (
            <Link
              key={item.groupKey}
              href={`/app/du/tagebuch/bestiarium/${item.groupKey}?j=${jagdjahrKey}`}
              className="bestiarium-tile"
              style={{ ...TILE, opacity: isZero ? 0.5 : 1 }}
            >
              <WildIcon type={item.groupKey} size={36} />
              <span style={COUNT}>{item.count}</span>
              <span style={LABEL}>{item.groupLabel}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
