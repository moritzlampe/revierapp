'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleNotch, Camera, Trash, ArrowsClockwise } from '@phosphor-icons/react'
import { BaseFieldSheet } from './BaseFieldSheet'
import { uploadPhoto } from '@/lib/photos/upload'
import { updateWildEvent } from '@/lib/erlegung/updateWildEvent'
import { createClient } from '@/lib/supabase/client'

export type PhotoSheetProps = {
  open: boolean
  currentPhotoUrl: string | null
  wildEventId: string
  onSaved: () => void
  onCancel: () => void
}

const PHOTO_BUCKET_MARKER = '/object/public/app-photos/'

/**
 * Extract the bucket-relative path from a Supabase public URL.
 * Returns null if the URL does not point at the app-photos bucket.
 */
function extractStoragePath(url: string | null): string | null {
  if (!url) return null
  const idx = url.indexOf(PHOTO_BUCKET_MARKER)
  if (idx === -1) return null
  return url.slice(idx + PHOTO_BUCKET_MARKER.length)
}

async function removeStorageObject(path: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.storage.from('app-photos').remove([path])
  if (error) {
    // Non-fatal — log and move on. The DB write is the source of truth.
    console.warn('[PhotoSheet] storage remove failed', error.message)
  }
}

type PendingUpload = { url: string; path: string }

/**
 * Edit sheet for wild_events.photo_url.
 *
 * Flow:
 *   1. Tap a tile → opens the OS file picker (accept="image/*").
 *   2. On file pick, the photo is uploaded immediately. Until Save is pressed
 *      the old photo (if any) stays untouched — Cancel rolls back the new
 *      upload, Save commits the new URL and removes the old object.
 *   3. "Foto entfernen" arms a deletion: Save will write photo_url = NULL and
 *      remove the old storage object. Cancel undoes the arming.
 *
 * EXIF-Strip is intentionally NOT performed here — pre-launch TODO, separate
 * sprint.
 */
export function PhotoSheet({
  open,
  currentPhotoUrl,
  wildEventId,
  onSaved,
  onCancel,
}: PhotoSheetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Newly uploaded photo waiting to be committed by Save (null = no new upload).
  const [pending, setPending] = useState<PendingUpload | null>(null)
  // Armed deletion: when true, Save will null photo_url and remove the storage object.
  const [removeArmed, setRemoveArmed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (open) {
      setPending(null)
      setRemoveArmed(false)
      setUploading(false)
      setSaving(false)
      setError(undefined)
    }
  }, [open])

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError(undefined)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Nicht eingeloggt.')

      // If the user had armed a deletion and now picks a new photo, treat the
      // new upload as the intent — clear the deletion flag.
      setRemoveArmed(false)

      // If there is already a pending (but unsaved) upload, remove it before
      // the new one lands — avoids orphaned objects when the user picks twice.
      if (pending) {
        await removeStorageObject(pending.path)
      }

      const { url, path } = await uploadPhoto({
        file,
        userId: user.id,
        entityType: 'wild_event',
        entityId: wildEventId,
        // Intentionally omit oldPath here: keep the original photo until the
        // user commits via Save. Cancel must be a true rollback.
      })
      setPending({ url, path })
    } catch (err) {
      console.error('[PhotoSheet] upload failed', err)
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(undefined)
    try {
      if (removeArmed) {
        const { error: updateError } = await updateWildEvent(wildEventId, {
          photo_url: null,
        })
        if (updateError) throw updateError
        const oldPath = extractStoragePath(currentPhotoUrl)
        if (oldPath) await removeStorageObject(oldPath)
      } else if (pending) {
        const { error: updateError } = await updateWildEvent(wildEventId, {
          photo_url: pending.url,
        })
        if (updateError) throw updateError
        const oldPath = extractStoragePath(currentPhotoUrl)
        if (oldPath) await removeStorageObject(oldPath)
      } else {
        // No change — close without writing.
        onCancel()
        return
      }
      onSaved()
    } catch (err) {
      console.error('[PhotoSheet] save failed', err)
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    // Roll back a pending upload — its storage object would otherwise leak.
    if (pending) {
      await removeStorageObject(pending.path)
    }
    onCancel()
  }

  const previewUrl = pending?.url ?? (removeArmed ? null : currentPhotoUrl)
  const saveDisabled = !pending && !removeArmed

  return (
    <BaseFieldSheet
      open={open}
      title="Foto"
      onSave={handleSave}
      onCancel={handleCancel}
      saving={saving || uploading}
      saveDisabled={saveDisabled}
      errorMessage={error}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Preview / empty-state tile */}
      <button
        type="button"
        onClick={triggerFilePicker}
        disabled={uploading || saving}
        style={{
          width: '100%',
          aspectRatio: '4 / 3',
          background: 'var(--surface-2)',
          border: '1.5px dashed var(--border)',
          borderRadius: '0.875rem',
          color: 'var(--text-2)',
          cursor: uploading || saving ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
          padding: 0,
        }}
      >
        {uploading ? (
          <CircleNotch
            size={32}
            weight="bold"
            style={{ color: 'var(--bronze)', animation: 'spin 1s linear infinite' }}
          />
        ) : previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Foto-Vorschau"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-3)',
            }}
          >
            <Camera size={32} weight="duotone" />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              Foto hinzufügen
            </span>
          </div>
        )}
      </button>

      {/* Action row — Replace + Remove buttons */}
      {(pending || currentPhotoUrl) && !removeArmed && (
        <div
          style={{
            marginTop: '0.875rem',
            display: 'flex',
            gap: '0.625rem',
          }}
        >
          <button
            type="button"
            onClick={triggerFilePicker}
            disabled={uploading || saving}
            style={{
              flex: 1,
              minHeight: '2.75rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.75rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: uploading || saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.375rem',
            }}
          >
            <ArrowsClockwise size={16} weight="bold" />
            Anderes Foto
          </button>

          {currentPhotoUrl && !pending && (
            <button
              type="button"
              onClick={() => setRemoveArmed(true)}
              disabled={uploading || saving}
              style={{
                flex: 1,
                minHeight: '2.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.75rem',
                background: 'transparent',
                border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
                color: 'var(--danger)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: uploading || saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.375rem',
              }}
            >
              <Trash size={16} weight="bold" />
              Entfernen
            </button>
          )}
        </div>
      )}

      {/* Undo "remove" while it is armed but not yet saved */}
      {removeArmed && (
        <div
          style={{
            marginTop: '0.875rem',
            padding: '0.75rem 0.875rem',
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
            borderRadius: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '0.8125rem', color: 'var(--text)' }}>
            Foto wird beim Speichern entfernt.
          </span>
          <button
            type="button"
            onClick={() => setRemoveArmed(false)}
            disabled={saving}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: '0.5rem',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Rückgängig
          </button>
        </div>
      )}
    </BaseFieldSheet>
  )
}
