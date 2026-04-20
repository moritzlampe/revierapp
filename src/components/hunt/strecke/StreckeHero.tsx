'use client'

import { useMemo } from 'react'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import { WILD_ART_TO_GROUP, WILD_GROUP_CONFIG, type WildArt, type WildGroup } from '@/lib/species-config'
import type { DisplayKill } from '@/lib/strecke/visibility'

// Jagdliche Streckenlegungs-Konvention
const WILD_GROUP_ORDER: WildGroup[] = [
  'rotwild',
  'damwild',
  'schwarzwild',
  'rehwild',
  'raubwild',
  'hasenartig',
  'federwild',
  'sonstiges',
]

const CHEVRON_THRESHOLD = 5
const FULL_HERO_THRESHOLD = 5

interface GroupAggregate {
  group: WildGroup
  label: string
  emoji: string
  count: number
}

function aggregateByGroup(kills: DisplayKill[]): GroupAggregate[] {
  const counts = new Map<WildGroup, number>()
  for (const k of kills) {
    const group = WILD_ART_TO_GROUP[k.wild_art as WildArt]
    if (!group) continue
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  const result: GroupAggregate[] = []
  for (const group of WILD_GROUP_ORDER) {
    const count = counts.get(group) ?? 0
    if (count === 0) continue
    const config = WILD_GROUP_CONFIG.find(c => c.group === group)
    if (!config) continue
    result.push({ group, label: config.label, emoji: config.emoji, count })
  }
  return result
}

interface StreckeHeroProps {
  /** Nur harvested-Kills — wounded zählen nicht zur offiziellen Strecke. */
  harvestedKills: DisplayKill[]
  /** Anzahl offener Nachsuchen (wird nur gezeigt wenn showNachsucheWarning=true). */
  woundedCount: number
  /** Rollen-Check: Warnstreifen + Scroll-Ziel nur für Jagdleiter/Schütze/Hundeführer. */
  showNachsucheWarning: boolean
  /** Aktuell aktive Wildart-Filter. Wenn gesetzt und Gruppe ≥5 Kills: Pfeil-Zeile hervorheben. */
  activeGroupFilter?: WildGroup | null
  /** Tap auf Wildart-Zeile mit Chevron → toggled Filter-Pill. */
  onGroupTap?: (group: WildGroup) => void
  /** Tap auf Nachsuche-Streifen → scrollt zur Nachsuche-Sektion. */
  onNachsucheTap?: () => void
}

export default function StreckeHero({
  harvestedKills,
  woundedCount,
  showNachsucheWarning,
  activeGroupFilter,
  onGroupTap,
  onNachsucheTap,
}: StreckeHeroProps) {
  const aggregates = useMemo(() => aggregateByGroup(harvestedKills), [harvestedKills])
  const total = harvestedKills.length
  const useFullHero = total >= FULL_HERO_THRESHOLD

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {useFullHero ? (
        <FullHero
          total={total}
          aggregates={aggregates}
          activeGroupFilter={activeGroupFilter ?? null}
          onGroupTap={onGroupTap}
        />
      ) : (
        <CompactHero total={total} aggregates={aggregates} />
      )}

      {showNachsucheWarning && woundedCount > 0 && (
        <NachsucheWarningStripe count={woundedCount} onTap={onNachsucheTap} />
      )}
    </div>
  )
}

function CompactHero({ total, aggregates }: { total: number; aggregates: GroupAggregate[] }) {
  return (
    <div
      style={{
        background: 'var(--surface-hero)',
        borderRadius: '12px',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}
      >
        {total} {total === 1 ? 'Stück' : 'Stücke'}
      </span>
      {aggregates.length > 0 && (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>·</span>
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            {aggregates.map(agg => (
              <span
                key={agg.group}
                style={{
                  fontSize: '0.9375rem',
                  color: 'var(--text-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <span aria-hidden="true">{agg.emoji}</span>
                <span>×{agg.count}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FullHero({
  total,
  aggregates,
  activeGroupFilter,
  onGroupTap,
}: {
  total: number
  aggregates: GroupAggregate[]
  activeGroupFilter: WildGroup | null
  onGroupTap?: (group: WildGroup) => void
}) {
  return (
    <div
      style={{
        background: 'var(--surface-hero)',
        borderRadius: '16px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          Heutige Strecke
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '4.5rem',
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            {total}
          </span>
          <span
            style={{
              fontSize: '1.125rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {total === 1 ? 'Stück' : 'Stücke'}
          </span>
        </div>
      </div>

      {aggregates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          {aggregates.map(agg => {
            const hasChevron = agg.count >= CHEVRON_THRESHOLD
            const isActive = activeGroupFilter === agg.group
            const tappable = hasChevron && Boolean(onGroupTap)
            return (
              <button
                key={agg.group}
                type="button"
                disabled={!tappable}
                onClick={tappable ? () => onGroupTap?.(agg.group) : undefined}
                style={{
                  all: 'unset',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0',
                  cursor: tappable ? 'pointer' : 'default',
                  borderRadius: 0,
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: '2.75rem',
                  boxSizing: 'border-box',
                  opacity: activeGroupFilter && !isActive ? 0.55 : 1,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ fontSize: '1.25rem', lineHeight: 1, width: '1.5rem', textAlign: 'center' }}
                >
                  {agg.emoji}
                </span>
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    minWidth: '1.75rem',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {agg.count}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                  }}
                >
                  {agg.label}
                </span>
                {hasChevron && (
                  <ChevronRight
                    size={18}
                    style={{
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NachsucheWarningStripe({ count, onTap }: { count: number; onTap?: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.75rem 1rem',
        background: 'var(--alert-bg)',
        border: '1px solid var(--alert-border)',
        borderRadius: '10px',
        cursor: onTap ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
        minHeight: '2.75rem',
        boxSizing: 'border-box',
      }}
    >
      <AlertTriangle size={18} style={{ color: 'var(--alert-text)', flexShrink: 0 }} />
      <span
        style={{
          flex: 1,
          fontSize: '0.9375rem',
          fontWeight: 500,
          color: 'var(--text-primary)',
        }}
      >
        {count} {count === 1 ? 'Stück in Nachsuche' : 'in Nachsuche'}
      </span>
      <span
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--alert-text)',
          textTransform: 'none',
        }}
      >
        Offen ›
      </span>
    </button>
  )
}
