'use client'

import { useState } from 'react'
import { Camera } from 'lucide-react'
import type { DisplayKill } from '@/lib/strecke/visibility'
import type { HuntPhoto } from '@/lib/types/hunt-photo'
import { getAvatarColor } from '@/lib/avatar-color'
import {
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
  type Geschlecht,
  type WildArt,
} from '@/lib/species-config'
import { getSpeciesIcon } from '@/components/icons/SpeciesIcons'
import PhotoThumbnail from '@/components/photo/PhotoThumbnail'
import { deleteHuntPhoto } from '@/lib/photos/hunt-photos'
import { showToast } from '@/lib/erlegung/toast'
import { useConfirmSheet } from '@/components/ui/ConfirmSheet'

interface DisplayKillBatch {
  id: string
  reporter_id: string
  first_at: string
  last_at: string
  kills: DisplayKill[]
}

interface StreckeBatchCardProps {
  batch: DisplayKillBatch
  photos: HuntPhoto[]
  killIdsWithPhotos: Set<string>
  killPhotoCounts: Map<string, number>
  isOwnBatch: boolean
  /** User-ID des Viewers. Nötig um Foto-Delete-Overlay freizuschalten. */
  viewerUserId: string | null
  onKillTap?: (kill: DisplayKill) => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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

function geschlechtLabel(g: Geschlecht | null | undefined): string | null {
  if (!g) return null
  if (g === 'maennlich') return 'männlich'
  if (g === 'weiblich') return 'weiblich'
  return null
}

function detailsFor(kill: DisplayKill): string {
  const parts: string[] = []
  const g = geschlechtLabel(kill.geschlecht)
  if (g) parts.push(g)
  if (kill.altersklasse && kill.altersklasse !== kill.wild_art) parts.push(kill.altersklasse)
  return parts.join(' · ')
}

/**
 * Detect "Rotte" grouping: alle Kills im Batch fallen in dieselbe Minute
 * (über gleiche Reporter ist durch groupKillsByBatch bereits gegeben).
 */
function isSameMinuteCluster(kills: DisplayKill[]): boolean {
  if (kills.length < 2) return false
  const minuteOf = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`
  }
  const first = minuteOf(kills[0].created_at)
  return kills.every(k => minuteOf(k.created_at) === first)
}

export default function StreckeBatchCard({
  batch,
  photos,
  killIdsWithPhotos,
  killPhotoCounts,
  isOwnBatch,
  viewerUserId,
  onKillTap,
}: StreckeBatchCardProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const confirmSheet = useConfirmSheet()

  const handleDeletePhoto = async (photo: HuntPhoto) => {
    if (!viewerUserId || photo.uploaded_by !== viewerUserId) return
    const ok = await confirmSheet({
      title: 'Foto löschen?',
      description: 'Das Foto wird endgültig entfernt.',
      confirmLabel: 'Löschen',
      confirmVariant: 'danger',
    })
    if (!ok) return
    setDeletingId(photo.id)
    try {
      await deleteHuntPhoto(photo.id, photo.storage_path)
    } catch (err) {
      console.error('[BatchCard] Foto-Delete fehlgeschlagen', err)
      showToast('Löschen fehlgeschlagen', 'warning')
      setDeletingId(null)
    }
  }
  const reporterName = batch.kills[0].display_name
  const isAnonymized = batch.kills[0].is_anonymized
  const avatarSeed = isAnonymized ? reporterName : batch.reporter_id
  const avatarColor = getAvatarColor(avatarSeed)
  const hasRotte = isSameMinuteCluster(batch.kills)
  const showBatchPhotos = photos.length > 0

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: '12px',
        padding: '1rem',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        flexShrink: 0,
      }}
    >
      {/* Header-Zeile: Avatar · Name (+ DU) · Zeit · N Stücke */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <div
          style={{
            width: '2.25rem',
            height: '2.25rem',
            borderRadius: '50%',
            background: avatarColor,
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8125rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {initialsFrom(reporterName)}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span
            style={{
              fontSize: '1rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontStyle: isAnonymized ? 'italic' : 'normal',
            }}
          >
            {reporterName}
          </span>
          {isOwnBatch && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                padding: '0.125rem 0.375rem',
                borderRadius: '4px',
                background: 'var(--accent-primary)',
                color: '#FFFFFF',
                flexShrink: 0,
              }}
            >
              DU
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            letterSpacing: '0.01em',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {formatTime(batch.first_at)} · {batch.kills.length} {batch.kills.length === 1 ? 'Stück' : 'Stücke'}
        </span>
      </div>

      {/* Kill-Sub-Items — optionale Rotten-Klammer links */}
      <div style={{ display: 'flex', gap: hasRotte ? '0.625rem' : 0 }}>
        {hasRotte && (
          <div
            aria-hidden="true"
            style={{
              width: '2px',
              background: 'var(--accent-primary)',
              borderRadius: '1px',
              flexShrink: 0,
              marginLeft: '1rem',
            }}
          />
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minWidth: 0 }}>
          {batch.kills.map((kill, idx) => (
            <KillSubItem
              key={kill.id}
              kill={kill}
              hasPhoto={killIdsWithPhotos.has(kill.id)}
              photoCount={killPhotoCounts.get(kill.id) ?? 0}
              onTap={onKillTap ? () => onKillTap(kill) : undefined}
              isLast={idx === batch.kills.length - 1}
            />
          ))}
        </ul>
      </div>

      {hasRotte && (
        <div
          style={{
            fontSize: '0.8125rem',
            fontWeight: 400,
            color: 'var(--text-secondary)',
            letterSpacing: '0.01em',
            paddingLeft: hasRotte ? '1.625rem' : 0,
          }}
        >
          Rotte · {batch.kills.length}× in derselben Minute
        </div>
      )}

      {showBatchPhotos && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            overflowX: 'auto',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-default)',
          }}
        >
          {photos.map(photo => {
            const canDelete = Boolean(viewerUserId) && photo.uploaded_by === viewerUserId
            const isDeleting = deletingId === photo.id
            return (
              <PhotoThumbnail
                key={photo.id}
                url={photo.url}
                size={4.5}
                shape="square"
                onDelete={canDelete && !isDeleting ? () => handleDeletePhoto(photo) : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function KillSubItem({
  kill,
  hasPhoto,
  photoCount,
  onTap,
  isLast,
}: {
  kill: DisplayKill
  hasPhoto: boolean
  photoCount: number
  onTap?: () => void
  isLast: boolean
}) {
  const Icon = getSpeciesIcon(kill.wild_art)
  const label = wildArtLabel(kill.wild_art)
  const details = detailsFor(kill)
  const isWounded = kill.status === 'wounded'

  return (
    <li
      className={onTap ? 'tap-ripple' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.5rem 0',
        borderBottom: isLast ? 'none' : '1px solid var(--border-default)',
        cursor: onTap ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
        minHeight: '2.5rem',
      }}
      onClick={onTap}
      role={onTap ? 'button' : undefined}
      tabIndex={onTap ? 0 : undefined}
    >
      <Icon
        size={24}
        style={{
          color: 'var(--text-primary)',
          flexShrink: 0,
          width: '1.5rem',
          height: '1.5rem',
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '0.375rem', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: '0.9375rem',
            color: 'var(--text-primary)',
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        {details && (
          <span
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
            }}
          >
            · {details}
          </span>
        )}
      </div>
      {isWounded && (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            padding: '0.125rem 0.375rem',
            borderRadius: '4px',
            background: 'var(--alert-bg)',
            color: 'var(--alert-text)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          Nachsuche
        </span>
      )}
      {hasPhoto && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.125rem',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
          aria-label={`${photoCount} Foto${photoCount === 1 ? '' : 's'}`}
        >
          <Camera size={14} />
          {photoCount > 1 && <span>{photoCount}</span>}
        </span>
      )}
    </li>
  )
}
