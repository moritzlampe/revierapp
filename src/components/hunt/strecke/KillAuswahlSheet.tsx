'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Camera, CircleNotch as Loader2 } from '@phosphor-icons/react'
import imageCompression from 'browser-image-compression'
import { uploadPhoto } from '@/lib/photos/upload'
import { insertHuntPhoto } from '@/lib/photos/hunt-photos'
import { showToast } from '@/lib/erlegung/toast'
import type { DisplayKill } from '@/lib/strecke/visibility'
import {
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
  type WildArt,
} from '@/lib/species-config'
import { getSpeciesIcon } from '@/components/icons/SpeciesIcons'

interface KillAuswahlSheetProps {
  open: boolean
  onClose: () => void
  kills: DisplayKill[]
  userId: string
  huntId: string
  killPhotoCounts: Map<string, number>
}

type Toggle = 'own' | 'all'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

function isHeic(file: File): boolean {
  if (file.type === 'image/heic' || file.type === 'image/heif') return true
  const name = file.name.toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

async function prepareFile(raw: File): Promise<File> {
  let input = raw
  if (isHeic(raw)) {
    const heic2any = (await import('heic2any')).default
    const blob = await heic2any({ blob: raw, toType: 'image/jpeg', quality: 0.92 })
    const result = Array.isArray(blob) ? blob[0] : blob
    input = new File([result], raw.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
  }
  const compressed = await imageCompression(input, {
    maxWidthOrHeight: 2000,
    maxSizeMB: 1.2,
    initialQuality: 0.85,
    useWebWorker: true,
    fileType: 'image/jpeg',
  })
  return new File([compressed], compressed.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
}

export default function KillAuswahlSheet({
  open,
  onClose,
  kills,
  userId,
  huntId,
  killPhotoCounts,
}: KillAuswahlSheetProps) {
  const [toggle, setToggle] = useState<Toggle>('own')
  const [selectedKillId, setSelectedKillId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipeStartY = useRef(0)
  const swipeStartTime = useRef(0)
  const swipeDeltaY = useRef(0)
  const isSwiping = useRef(false)

  // Neueste zuerst
  const sortedKills = useMemo(() => {
    return [...kills].sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      return tb - ta
    })
  }, [kills])

  const ownKills = useMemo(
    () => sortedKills.filter(k => k.reporter_id === userId),
    [sortedKills, userId],
  )

  const list = toggle === 'own' ? ownKills : sortedKills

  const handleKillTap = useCallback((killId: string) => {
    setSelectedKillId(killId)
    // Tiny defer damit React state commitet, dann File-Picker triggern.
    requestAnimationFrame(() => fileInputRef.current?.click())
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.files?.[0]
      e.target.value = ''
      if (!raw || !selectedKillId) return

      setUploading(true)
      try {
        const file = await prepareFile(raw)
        const { url, path } = await uploadPhoto({
          file,
          userId,
          entityType: 'hunt',
          entityId: huntId,
        })
        await insertHuntPhoto({
          huntId,
          killIds: [selectedKillId],
          storagePath: path,
          url,
          uploadedBy: userId,
        })
        showToast('Foto zugeordnet', 'success')
        setSelectedKillId(null)
        onClose()
      } catch (err) {
        console.error('[KillAuswahl] Upload-Fehler', err)
        showToast('Upload fehlgeschlagen', 'warning')
      } finally {
        setUploading(false)
      }
    },
    [selectedKillId, userId, huntId, onClose],
  )

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY
    swipeStartTime.current = Date.now()
    swipeDeltaY.current = 0
    isSwiping.current = true
    const sheet = sheetRef.current
    if (sheet) sheet.style.transition = 'none'
  }, [])

  const handleSwipeMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping.current) return
    const delta = e.touches[0].clientY - swipeStartY.current
    swipeDeltaY.current = Math.max(0, delta)
    const sheet = sheetRef.current
    if (sheet) sheet.style.transform = `translateY(${swipeDeltaY.current}px)`
  }, [])

  const handleSwipeEnd = useCallback(() => {
    if (!isSwiping.current) return
    isSwiping.current = false
    const sheet = sheetRef.current
    if (!sheet) return
    const elapsed = Date.now() - swipeStartTime.current
    const velocity = swipeDeltaY.current / Math.max(elapsed, 1)
    if (swipeDeltaY.current > 80 || velocity > 0.5) {
      sheet.style.transition = 'transform 0.25s ease-out'
      sheet.style.transform = 'translateY(100%)'
      setTimeout(onClose, 250)
    } else {
      sheet.style.transition = 'transform 0.2s ease'
      sheet.style.transform = 'translateY(0)'
    }
  }, [onClose])

  if (!open) return null

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={uploading ? undefined : onClose} />
      <div
        ref={sheetRef}
        className="map-object-sheet"
        style={{
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          maxHeight: 'var(--sheet-max-height)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          style={{ width: '100%', padding: '0.75rem 0', cursor: 'grab', touchAction: 'none' }}
        >
          <div className="sheet-handle" />
        </div>

        <div style={{ padding: '0 1rem 0.5rem' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Foto zuordnen
          </h2>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
            }}
          >
            Zu welcher Erlegung gehört dieses Foto?
          </p>
        </div>

        <div style={{ padding: '0.75rem 1rem 0', display: 'flex', gap: '0.5rem' }}>
          <SegmentPill active={toggle === 'own'} onClick={() => setToggle('own')}>
            Meine ({ownKills.length})
          </SegmentPill>
          <SegmentPill active={toggle === 'all'} onClick={() => setToggle('all')}>
            Alle ({sortedKills.length})
          </SegmentPill>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '0.75rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {list.length === 0 ? (
            <p
              style={{
                margin: '1rem 0',
                textAlign: 'center',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
              }}
            >
              {toggle === 'own' ? 'Du hast noch keine Erlegung gemeldet.' : 'Keine Erlegungen vorhanden.'}
            </p>
          ) : (
            list.map(kill => (
              <KillRow
                key={kill.id}
                kill={kill}
                photoCount={killPhotoCounts.get(kill.id) ?? 0}
                disabled={uploading}
                onTap={() => handleKillTap(kill.id)}
              />
            ))
          )}
        </div>

        {uploading && (
          <div
            style={{
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
              borderTop: '1px solid var(--border-default)',
            }}
          >
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Foto wird hochgeladen…
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </>
  )
}

function SegmentPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '0.5rem 0.75rem',
        background: active ? 'var(--accent-primary)' : 'var(--bg-sunken)',
        color: active ? '#FFFFFF' : 'var(--text-secondary)',
        border: 'none',
        borderRadius: '999px',
        fontSize: '0.8125rem',
        fontWeight: 500,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        minHeight: '2.5rem',
      }}
    >
      {children}
    </button>
  )
}

function KillRow({
  kill,
  photoCount,
  disabled,
  onTap,
}: {
  kill: DisplayKill
  photoCount: number
  disabled: boolean
  onTap: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={disabled ? undefined : 'tap-ripple'}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 0.875rem',
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border-default)',
        borderRadius: '10px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent',
        boxSizing: 'border-box',
        minHeight: '3rem',
      }}
    >
      <span
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: '2.5rem',
          flexShrink: 0,
        }}
      >
        {formatTime(kill.created_at)}
      </span>
      {(() => {
        const Icon = getSpeciesIcon(kill.wild_art)
        return (
          <Icon
            size={20}
            style={{
              color: 'var(--text-primary)',
              flexShrink: 0,
              width: '1.5rem',
              height: '1.5rem',
            }}
          />
        )
      })()}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
        <span
          style={{
            fontSize: '0.9375rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {wildArtLabel(kill.wild_art)}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            fontStyle: kill.is_anonymized ? 'italic' : 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {kill.display_name}
        </span>
      </div>
      {photoCount > 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.125rem',
            fontSize: '0.75rem',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          <Camera size={14} />
          {photoCount}
        </span>
      )}
    </button>
  )
}
