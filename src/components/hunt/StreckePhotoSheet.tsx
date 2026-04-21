'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check } from '@phosphor-icons/react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import PhotoCapture from '@/components/photo/PhotoCapture'
import PhotoThumbnail from '@/components/photo/PhotoThumbnail'
import { uploadPhoto } from '@/lib/photos/upload'
import { insertHuntPhoto } from '@/lib/photos/hunt-photos'
import { showToast } from '@/lib/erlegung/toast'
import type { Kill } from '@/lib/types/kill'
import type { Geschlecht, WildArt } from '@/lib/species-config'
import {
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
} from '@/lib/species-config'
import {
  maskKillForViewer,
  type DisplayKill,
  type KillerProfile,
  type ViewerContext,
} from '@/lib/strecke/visibility'
import { groupKillsByBatch } from '@/lib/erlegung/groupByBatch'

interface Participant {
  id: string
  user_id: string | null
  guest_name: string | null
  role: string
  tags: string[]
  profiles: { display_name: string; anonymize_kills: boolean } | null
}

interface DisplayKillBatch {
  id: string
  reporter_id: string
  first_at: string
  last_at: string
  kills: DisplayKill[]
}

interface StreckePhotoSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  huntId: string
  userId: string
  kills: Kill[]
  participants: Participant[]
  viewer: ViewerContext
}

type Phase = 'capture' | 'select' | 'uploading'

function getWildArtLabel(wildArt: string): string {
  for (const details of Object.values(WILD_GROUP_DETAILS)) {
    if (!details) continue
    const found = details.altersklassen.find(a => a.value === wildArt)
    if (found) return found.label
  }
  for (const list of Object.values(FLAT_GROUP_TIERE)) {
    const found = list?.find(a => a.value === wildArt)
    if (found) return found.label
  }
  const group = WILD_GROUP_CONFIG.find(g => g.unspezValue === wildArt as WildArt)
  if (group) return group.label
  return wildArt
}

function getGeschlechtLabel(g: Geschlecht | null | undefined): string | null {
  if (!g) return null
  if (g === 'maennlich') return 'männlich'
  if (g === 'weiblich') return 'weiblich'
  return null
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function StreckePhotoSheet({
  open,
  onOpenChange,
  huntId,
  userId,
  kills,
  participants,
  viewer,
}: StreckePhotoSheetProps) {
  const [phase, setPhase] = useState<Phase>('capture')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [selectedKillIds, setSelectedKillIds] = useState<Set<string>>(new Set())
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (open) {
      setPhase('capture')
      setPendingPhotos([])
      setSelectedKillIds(new Set())
      setUploadProgress(null)
      setUploading(false)
    }
  }, [open])

  // Close während Upload unterdrücken — Realtime zieht Ergebnisse nach.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (uploading && !next) return
      onOpenChange(next)
    },
    [uploading, onOpenChange],
  )

  const profileMap = useMemo<Map<string, KillerProfile>>(() => {
    const map = new Map<string, KillerProfile>()
    for (const p of participants) {
      if (p.user_id && p.profiles) {
        map.set(p.user_id, {
          user_id: p.user_id,
          display_name: p.profiles.display_name,
          anonymize_kills: p.profiles.anonymize_kills,
        })
      }
    }
    return map
  }, [participants])

  const visibleKills = useMemo<DisplayKill[]>(
    () =>
      kills
        .map(k => maskKillForViewer(k, profileMap.get(k.reporter_id), viewer))
        .filter((k): k is DisplayKill => k !== null),
    [kills, profileMap, viewer],
  )

  // Sheet zeigt neueste Batches zuerst — konsistent mit Strecke-Tab.
  const visibleBatches = useMemo<DisplayKillBatch[]>(
    () => groupKillsByBatch(visibleKills).slice().reverse() as DisplayKillBatch[],
    [visibleKills],
  )

  const handlePhotoCapture = useCallback((file: File) => {
    setPendingPhotos(prev => [...prev, file])
  }, [])

  const handlePhotoError = useCallback((err: Error) => {
    showToast('Foto-Fehler', 'warning', err.message)
  }, [])

  const removePhoto = useCallback((idx: number) => {
    setPendingPhotos(prev => {
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
  }, [])

  const toggleKill = useCallback((killId: string) => {
    setSelectedKillIds(prev => {
      const next = new Set(prev)
      if (next.has(killId)) next.delete(killId)
      else next.add(killId)
      return next
    })
  }, [])

  const handleUpload = useCallback(async () => {
    if (pendingPhotos.length === 0) return
    setUploading(true)
    setPhase('uploading')

    const killIds = selectedKillIds.size > 0 ? [...selectedKillIds] : null
    const total = pendingPhotos.length
    let errorCount = 0

    for (let i = 0; i < total; i++) {
      setUploadProgress({ current: i + 1, total })
      try {
        const { url, path } = await uploadPhoto({
          file: pendingPhotos[i],
          userId,
          entityType: 'hunt',
          entityId: huntId,
        })
        await insertHuntPhoto({
          huntId,
          killIds,
          storagePath: path,
          url,
          uploadedBy: userId,
        })
      } catch (e) {
        errorCount++
        console.error(`[StreckePhotoSheet] photo ${i + 1} upload failed`, e)
        showToast(
          `Foto ${i + 1} von ${total} fehlgeschlagen`,
          'warning',
          e instanceof Error ? e.message : 'Unbekannter Fehler',
        )
      }
    }

    const successCount = total - errorCount
    if (errorCount === 0) {
      showToast(
        `${total} Foto${total === 1 ? '' : 's'} hinzugefügt`,
        'success',
      )
    } else if (successCount > 0) {
      showToast(
        `${successCount} von ${total} hinzugefügt`,
        'warning',
      )
    } else {
      showToast('Upload fehlgeschlagen', 'warning')
    }

    setUploading(false)
    setUploadProgress(null)
    onOpenChange(false)
  }, [pendingPhotos, selectedKillIds, userId, huntId, onOpenChange])

  const selectedCount = selectedKillIds.size

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" showCloseButton={!uploading} className="max-h-[85vh] gap-0">
        {/* Header */}
        <SheetHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {phase === 'select' && !uploading && (
              <button
                type="button"
                onClick={() => setPhase('capture')}
                aria-label="Zurück"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <SheetTitle>
              {phase === 'capture' && 'Fotos auswählen'}
              {phase === 'select' && 'Kills zuordnen'}
              {phase === 'uploading' && 'Lade Fotos hoch…'}
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Scroll-Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 1rem 1rem' }}>
          {phase === 'capture' && (
            <CapturePhase
              pendingPhotos={pendingPhotos}
              onCapture={handlePhotoCapture}
              onError={handlePhotoError}
              onRemove={removePhoto}
            />
          )}

          {(phase === 'select' || phase === 'uploading') && (
            <SelectPhase
              batches={visibleBatches}
              selectedKillIds={selectedKillIds}
              onToggle={toggleKill}
              disabled={uploading}
            />
          )}
        </div>

        {/* Sticky Footer */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom))',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {phase === 'capture' && (
            <button
              type="button"
              onClick={() => setPhase('select')}
              disabled={pendingPhotos.length === 0}
              style={{
                flex: 1,
                padding: '0.875rem 1rem',
                background: pendingPhotos.length === 0 ? 'var(--surface-2)' : 'var(--green)',
                color: pendingPhotos.length === 0 ? 'var(--text-3)' : 'var(--text)',
                border: 'none',
                borderRadius: '0.75rem',
                fontSize: '1rem',
                fontWeight: 600,
                minHeight: '2.75rem',
                cursor: pendingPhotos.length === 0 ? 'not-allowed' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {pendingPhotos.length === 0
                ? 'Weiter'
                : `Weiter (${pendingPhotos.length} Foto${pendingPhotos.length === 1 ? '' : 's'})`}
            </button>
          )}

          {(phase === 'select' || phase === 'uploading') && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              style={{
                flex: 1,
                padding: '0.875rem 1rem',
                background: 'var(--green)',
                color: 'var(--text)',
                border: 'none',
                borderRadius: '0.75rem',
                fontSize: '1rem',
                fontWeight: 600,
                minHeight: '2.75rem',
                opacity: uploading ? 0.6 : 1,
                cursor: uploading ? 'not-allowed' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {uploading && uploadProgress
                ? `Lade Foto ${uploadProgress.current}/${uploadProgress.total}…`
                : selectedCount > 0
                  ? `Fertig (${selectedCount})`
                  : 'Als Stimmungsfoto speichern'}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================
// Phase 1: Capture — Kamera + Mediathek
// ============================================================

function CapturePhase({
  pendingPhotos,
  onCapture,
  onError,
  onRemove,
}: {
  pendingPhotos: File[]
  onCapture: (file: File) => void
  onError: (err: Error) => void
  onRemove: (idx: number) => void
}) {
  const previewUrls = useMemo(
    () => pendingPhotos.map(f => URL.createObjectURL(f)),
    [pendingPhotos],
  )

  useEffect(() => {
    return () => {
      for (const url of previewUrls) URL.revokeObjectURL(url)
    }
  }, [previewUrls])

  return (
    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {pendingPhotos.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            overflowX: 'auto',
            paddingBottom: '0.25rem',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {previewUrls.map((url, idx) => (
            <PhotoThumbnail
              key={idx}
              url={url}
              size={5.5}
              onDelete={() => onRemove(idx)}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <PhotoCapture
          quality="documentation"
          mode="camera"
          onCapture={onCapture}
          onError={onError}
        >
          <button
            type="button"
            style={{
              width: '100%',
              padding: '0.875rem 1rem',
              background: 'var(--green)',
              color: 'var(--text)',
              border: 'none',
              borderRadius: '0.75rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              minHeight: '2.75rem',
              WebkitTapHighlightColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            📷 Aufnehmen
          </button>
        </PhotoCapture>

        <PhotoCapture
          quality="documentation"
          mode="choose"
          onCapture={onCapture}
          onError={onError}
        >
          <button
            type="button"
            style={{
              width: '100%',
              padding: '0.875rem 1rem',
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '0.75rem',
              fontSize: '0.9375rem',
              fontWeight: 500,
              minHeight: '2.75rem',
              WebkitTapHighlightColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            🖼️ Aus Mediathek
          </button>
        </PhotoCapture>
      </div>
    </div>
  )
}

// ============================================================
// Phase 2: Select — Kill-Auswahl per Batch
// ============================================================

function SelectPhase({
  batches,
  selectedKillIds,
  onToggle,
  disabled,
}: {
  batches: DisplayKillBatch[]
  selectedKillIds: Set<string>
  onToggle: (killId: string) => void
  disabled: boolean
}) {
  if (batches.length === 0) {
    return (
      <div
        style={{
          marginTop: '1rem',
          padding: '1rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          color: 'var(--text-2)',
          fontSize: '0.875rem',
          textAlign: 'center',
        }}
      >
        Keine zuordenbaren Kills. Das Foto wird als Stimmungsfoto gespeichert.
      </div>
    )
  }

  return (
    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-2)',
          margin: 0,
        }}
      >
        Keine Auswahl → landet als Stimmungsfoto.
      </p>
      {batches.map(batch => (
        <BatchSelectCard
          key={batch.id}
          batch={batch}
          selectedKillIds={selectedKillIds}
          onToggle={onToggle}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

function BatchSelectCard({
  batch,
  selectedKillIds,
  onToggle,
  disabled,
}: {
  batch: DisplayKillBatch
  selectedKillIds: Set<string>
  onToggle: (killId: string) => void
  disabled: boolean
}) {
  const reporterName = batch.kills[0].display_name
  const isAnonymized = batch.kills[0].is_anonymized

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          padding: '0.625rem 0.875rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{formatTime(batch.first_at)}</span>
        <span style={{ color: 'var(--text-3)' }}>·</span>
        <span style={{ color: 'var(--text-2)' }}>
          Von:{' '}
          <span style={{ color: isAnonymized ? 'var(--text-2)' : 'var(--text)' }}>
            {reporterName}
          </span>
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '0.25rem 0' }}>
        {batch.kills.map(k => (
          <KillSelectRow
            key={k.id}
            kill={k}
            selected={selectedKillIds.has(k.id)}
            onToggle={() => onToggle(k.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function KillSelectRow({
  kill,
  selected,
  onToggle,
}: {
  kill: DisplayKill
  selected: boolean
  onToggle: () => void
}) {
  const label = getWildArtLabel(kill.wild_art)
  const geschlecht = getGeschlechtLabel(kill.geschlecht)
  const extras: string[] = []
  if (geschlecht) extras.push(geschlecht)
  if (kill.altersklasse) extras.push(kill.altersklasse)

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        style={{
          width: '100%',
          padding: '0.5rem 0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          fontSize: '0.9375rem',
          background: selected ? 'var(--surface-3)' : 'transparent',
          border: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          minHeight: '2.75rem',
          textAlign: 'left',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '1.375rem',
            height: '1.375rem',
            borderRadius: '0.375rem',
            border: `2px solid ${selected ? 'var(--green)' : 'var(--border)'}`,
            background: selected ? 'var(--green)' : 'transparent',
            flexShrink: 0,
          }}
        >
          {selected && <Check size={14} color="var(--text)" strokeWidth={3} />}
        </span>
        <span style={{ color: 'var(--text)' }}>{label}</span>
        {kill.status === 'wounded' && (
          <span
            aria-label="Krankschuss"
            title="Krankgeschossen"
            style={{ fontSize: '0.875rem', color: 'var(--orange)' }}
          >
            🩹
          </span>
        )}
        {extras.length > 0 && (
          <span style={{ color: 'var(--text-3)', fontSize: '0.8125rem' }}>
            ({extras.join(', ')})
          </span>
        )}
      </button>
    </li>
  )
}
