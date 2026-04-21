'use client'

import { forwardRef } from 'react'
import { CaretRight as ChevronRight, MapPin } from '@phosphor-icons/react'
import type { DisplayKill } from '@/lib/strecke/visibility'
import {
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
  type WildArt,
} from '@/lib/species-config'
import { getSpeciesIcon } from '@/components/icons/SpeciesIcons'
import AlertTriangleIcon from '@/components/icons/AlertTriangleIcon'

interface StreckeNachsucheSectionProps {
  kills: DisplayKill[]
  now?: number
  onKillTap?: (kill: DisplayKill) => void
}

function wildArtLabel(wildArt: string): string {
  for (const details of Object.values(WILD_GROUP_DETAILS)) {
    if (!details) continue
    const found = details.altersklassen.find(a => a.value === wildArt)
    if (found) return found.label
  }
  for (const list of Object.values(FLAT_GROUP_TIERE)) {
    const found = list?.find(a => a.value === wildArt)
    if (found) return found.label
  }
  const group = WILD_GROUP_CONFIG.find(g => g.unspezValue === (wildArt as WildArt))
  if (group) return group.label
  return wildArt
}

function formatDuration(fromIso: string, now: number): string {
  const from = new Date(fromIso).getTime()
  const diffMs = Math.max(0, now - from)
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

const StreckeNachsucheSection = forwardRef<HTMLElement, StreckeNachsucheSectionProps>(
  function StreckeNachsucheSection({ kills, now = Date.now(), onKillTap }, ref) {
    if (kills.length === 0) return null

    return (
      <section
        ref={ref}
        aria-label="Offene Nachsuchen"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          paddingTop: '0.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            paddingLeft: '0.25rem',
          }}
        >
          <AlertTriangleIcon size={14} style={{ color: 'var(--alert-text)' }} />
          <h2
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--alert-text)',
            }}
          >
            In Nachsuche · {kills.length}
          </h2>
        </div>

        {kills.map(kill => (
          <NachsucheCard
            key={kill.id}
            kill={kill}
            durationLabel={formatDuration(kill.erlegt_am ?? kill.created_at, now)}
            onTap={onKillTap ? () => onKillTap(kill) : undefined}
          />
        ))}
      </section>
    )
  },
)

function NachsucheCard({
  kill,
  durationLabel,
  onTap,
}: {
  kill: DisplayKill
  durationLabel: string
  onTap?: () => void
}) {
  const Icon = getSpeciesIcon(kill.wild_art)
  const label = wildArtLabel(kill.wild_art)
  const hasPosition = Boolean(kill.position)

  return (
    <button
      type="button"
      onClick={onTap}
      className={onTap ? 'tap-ripple' : undefined}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem',
        background: 'var(--alert-bg)',
        border: '1px solid var(--alert-border)',
        borderRadius: '12px',
        cursor: onTap ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
        boxSizing: 'border-box',
      }}
    >
      <Icon
        size={28}
        style={{
          color: 'var(--alert-text)',
          flexShrink: 0,
          width: '1.75rem',
          height: '1.75rem',
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.375rem',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--alert-text)',
              letterSpacing: '0.01em',
            }}
          >
            · in Nachsuche
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8125rem',
            color: 'var(--text-primary)',
            opacity: 0.82,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontStyle: kill.is_anonymized ? 'italic' : 'normal',
            }}
          >
            {kill.display_name}
          </span>
          <span aria-hidden="true">·</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>seit {durationLabel}</span>
          {hasPosition && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.125rem' }}>
                <MapPin size={12} />
                Anschuss
              </span>
            </>
          )}
        </div>
      </div>
      <ChevronRight
        size={18}
        style={{
          color: 'var(--alert-text)',
          flexShrink: 0,
        }}
      />
    </button>
  )
}

export default StreckeNachsucheSection
