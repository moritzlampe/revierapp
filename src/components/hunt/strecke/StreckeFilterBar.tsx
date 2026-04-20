'use client'

import { Camera } from 'lucide-react'
import { WILD_GROUP_CONFIG, type WildGroup } from '@/lib/species-config'
import { getGroupIcon } from '@/components/icons/SpeciesIcons'

export type StreckeFilter =
  | { kind: 'all' }
  | { kind: 'own' }
  | { kind: 'nachsuche' }
  | { kind: 'group'; group: WildGroup }

interface PillSpec {
  id: string
  label: string
  count: number
  filter: StreckeFilter
  group?: WildGroup
}

interface StreckeFilterBarProps {
  active: StreckeFilter
  onChange: (filter: StreckeFilter) => void
  counts: {
    all: number
    own: number
    nachsuche: number
    /** Optionaler Wildart-Pill, erscheint wenn eine Gruppe aus dem Hero gechevron't wurde. */
    group?: { group: WildGroup; count: number }
  }
  showNachsuchePill: boolean
  canUploadPhoto: boolean
  onPhotoClick: () => void
}

function filtersEqual(a: StreckeFilter, b: StreckeFilter): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'group' && b.kind === 'group') return a.group === b.group
  return true
}

export default function StreckeFilterBar({
  active,
  onChange,
  counts,
  showNachsuchePill,
  canUploadPhoto,
  onPhotoClick,
}: StreckeFilterBarProps) {
  const pills: PillSpec[] = [
    { id: 'all', label: 'Alle', count: counts.all, filter: { kind: 'all' } },
    { id: 'own', label: 'Eigene', count: counts.own, filter: { kind: 'own' } },
  ]
  if (showNachsuchePill) {
    pills.push({
      id: 'nachsuche',
      label: 'Nachsuche',
      count: counts.nachsuche,
      filter: { kind: 'nachsuche' },
    })
  }
  if (counts.group) {
    const groupConfig = WILD_GROUP_CONFIG.find(c => c.group === counts.group!.group)
    if (groupConfig) {
      pills.push({
        id: `group-${counts.group.group}`,
        label: groupConfig.label,
        count: counts.group.count,
        filter: { kind: 'group', group: counts.group.group },
        group: counts.group.group,
      })
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0 0.75rem',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          padding: '0.25rem 0',
        }}
      >
        {pills.map(pill => {
          const isActive = filtersEqual(pill.filter, active)
          const Icon = pill.group ? getGroupIcon(pill.group) : null
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => onChange(pill.filter)}
              className="filter-pill"
              data-active={isActive ? 'true' : 'false'}
              style={{
                flexShrink: 0,
                padding: '0.5rem 0.75rem',
                background: isActive ? 'var(--accent-primary)' : 'var(--bg-sunken)',
                color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '999px',
                fontSize: '0.8125rem',
                fontWeight: 500,
                letterSpacing: '0.01em',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                minHeight: '2.25rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                whiteSpace: 'nowrap',
                transition: 'background-color 150ms ease, color 150ms ease, transform 150ms ease',
                transform: isActive ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              {Icon && <Icon size={16} />}
              <span>{pill.label}</span>
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  opacity: isActive ? 1 : 0.85,
                }}
              >
                ({pill.count})
              </span>
            </button>
          )
        })}
      </div>
      {canUploadPhoto && (
        <>
          <div
            aria-hidden="true"
            style={{
              width: '1px',
              height: '1.5rem',
              background: 'var(--border-default)',
              flexShrink: 0,
            }}
          />
          <button
            type="button"
            onClick={onPhotoClick}
            aria-label="Foto hinzufügen"
            style={{
              width: '2.5rem',
              height: '2.5rem',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-sunken)',
              color: 'var(--accent-primary)',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Camera size={18} />
          </button>
        </>
      )}
    </div>
  )
}
