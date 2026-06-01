'use client'

import { useRef, useState } from 'react'
import { Camera, CircleNotch } from '@phosphor-icons/react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import PhotoThumbnail from '@/components/photo/PhotoThumbnail'
import { addKillPhoto, removeKillPhoto } from '@/lib/photos/kill-photos'
import { showToast } from '@/lib/erlegung/toast'
import type { Database } from '@/lib/supabase/database.types'

type HuntPhoto = Database['public']['Tables']['hunt_photos']['Row']

interface KillPhotoEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Aktuelle Fotos (lokaler State des Parents) — Reihenfolge wie geladen. */
  photos: HuntPhoto[]
  killId: string
  huntId: string
  userId: string
  /** Neue Foto-Row nach erfolgreichem Upload — Parent hängt sie an. */
  onAdded: (photo: HuntPhoto) => void
  /** Foto-id nach erfolgreichem Entfernen — Parent filtert sie raus. */
  onRemoved: (photoId: string) => void
}

const TILE = '6rem'

/**
 * Gallery-Editor für Erlegungs-Fotos (Tagebuch). Sofort-Commit (kein Draft):
 * Add lädt sofort hoch + verknüpft, Remove löst sofort. Lokaler State wird
 * über onAdded/onRemoved im Parent geführt; beim Schließen synct der Parent
 * via router.refresh() den Server-Stand (inkl. Hero/Cover-Neusortierung).
 *
 * Bewusst KEIN BaseFieldSheet (dessen Footer ist starr auf Abbrechen/Speichern
 * verdrahtet) — schlankes eigenes Bottom-Sheet auf den Sheet-Primitives, Optik
 * konsistent zur Erlegung (Bronze-Akzent).
 */
export function KillPhotoEditor({
  open,
  onOpenChange,
  photos,
  killId,
  huntId,
  userId,
  onAdded,
  onRemoved,
}: KillPhotoEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleOpenChange = (next: boolean) => {
    // Während Upload nicht schließen — sonst ginge der Add-Vorgang verloren.
    if (uploading && !next) return
    onOpenChange(next)
  }

  const triggerFilePicker = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      const photo = await addKillPhoto({ killId, huntId, file, userId })
      onAdded(photo)
      showToast('Foto hinzugefügt', 'success')
    } catch (err) {
      console.error('[KillPhotoEditor] Foto hinzufügen fehlgeschlagen', err)
      showToast(
        'Foto konnte nicht hinzugefügt werden',
        'warning',
        err instanceof Error ? err.message : undefined,
      )
    } finally {
      setUploading(false)
    }
  }

  // onDelete-Vertrag für PhotoThumbnail: bei Erfolg entfernt der Parent das
  // Foto aus dem State → Thumbnail unmountet. Bei Fehler Toast + RE-THROW,
  // damit PhotoThumbnail sein deleting zurücksetzt und das Foto stehen bleibt
  // (relevant für den geteilten-Foto-Fall, der ohne UPDATE-RLS scheitert —
  // kein stiller Fehlschlag, kein Datenverlust).
  const handleRemove = async (photo: HuntPhoto) => {
    try {
      await removeKillPhoto({ photo, killId })
      onRemoved(photo.id)
    } catch (err) {
      console.error('[KillPhotoEditor] Foto entfernen fehlgeschlagen', err)
      showToast(
        'Foto konnte nicht entfernt werden',
        'warning',
        err instanceof Error ? err.message : undefined,
      )
      throw err
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={!uploading}
        className="max-h-[85vh] gap-0"
      >
        <SheetHeader>
          <SheetTitle>Fotos</SheetTitle>
        </SheetHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* Scroll-Content: Foto-Grid + Add-Kachel */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 1rem 1rem' }}>
          {photos.length === 0 && (
            <p
              style={{
                margin: '0.25rem 0 0.75rem',
                fontSize: '0.8125rem',
                color: 'var(--text-2)',
              }}
            >
              Noch keine Fotos. Füge das erste hinzu.
            </p>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.625rem',
              marginTop: '0.5rem',
            }}
          >
            {photos.map((p) => (
              <PhotoThumbnail
                key={p.id}
                url={p.url}
                size={6}
                onDelete={() => handleRemove(p)}
              />
            ))}

            {/* Add-Kachel */}
            <button
              type="button"
              onClick={triggerFilePicker}
              disabled={uploading}
              aria-label="Foto hinzufügen"
              style={{
                width: TILE,
                height: TILE,
                flexShrink: 0,
                borderRadius: '0.75rem',
                background: 'var(--surface-2)',
                border: '1.5px dashed var(--bronze-edge)',
                color: 'var(--bronze)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
                cursor: uploading ? 'not-allowed' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {uploading ? (
                <CircleNotch
                  size={24}
                  weight="bold"
                  style={{ animation: 'spin 1s linear infinite' }}
                />
              ) : (
                <>
                  <Camera size={24} weight="duotone" />
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600 }}>Hinzufügen</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sticky Footer: nur „Fertig" (Sofort-Commit, kein Save/Cancel) */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom))',
            display: 'flex',
          }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
            style={{
              flex: 1,
              minHeight: '2.75rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.75rem',
              background: 'var(--bronze)',
              border: 'none',
              color: '#ffffff',
              fontSize: '0.9375rem',
              fontWeight: 700,
              opacity: uploading ? 0.5 : 1,
              cursor: uploading ? 'not-allowed' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Fertig
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
