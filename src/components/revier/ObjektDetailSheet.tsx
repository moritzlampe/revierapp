'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, CircleNotch as Loader2 } from '@phosphor-icons/react'
import type { MapObject, ObjektType, MapObjectPhoto } from '@/lib/types/revier'
import PhotoCapture from '@/components/photo/PhotoCapture'
import PhotoThumbnail from '@/components/photo/PhotoThumbnail'
import { uploadPhoto } from '@/lib/photos/upload'
import { deletePhoto } from '@/lib/photos/delete'
import { listMapObjectPhotos } from '@/lib/photos/list'
import { createClient } from '@/lib/supabase/client'
import { useConfirmSheet } from '@/components/ui/ConfirmSheet'

const TYPE_LABELS: Record<ObjektType, string> = {
  hochsitz: 'Hochsitz',
  kanzel: 'Kanzel',
  drueckjagdstand: 'Drückjagdbock',
  parkplatz: 'Parkplatz',
  kirrung: 'Kirrung',
  salzlecke: 'Salzlecke',
  wildkamera: 'Wildkamera',
  sonstiges: 'Sonstiges',
}

type Props = {
  object: MapObject
  userId: string
  onClose: () => void
  onPositionChange: () => void
  onDelete: () => void
  onUpdate: (changes: Partial<MapObject>) => Promise<void>
}

export default function ObjektDetailSheet({ object, userId, onClose, onPositionChange, onDelete, onUpdate }: Props) {
  const confirmSheet = useConfirmSheet()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(object.name)
  const [savingName, setSavingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const [showNotiz, setShowNotiz] = useState(!!object.description)
  const [editingNotiz, setEditingNotiz] = useState(false)
  const [notizValue, setNotizValue] = useState(object.description || '')
  const [savingNotiz, setSavingNotiz] = useState(false)
  const notizRef = useRef<HTMLTextAreaElement>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // --- Fotos ---
  const [photos, setPhotos] = useState<MapObjectPhoto[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null)
  const fullscreenOpenRef = useRef(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPhotosLoading(true)
    listMapObjectPhotos(object.id)
      .then((data) => {
        if (!cancelled) setPhotos(data)
      })
      .catch((err) => {
        if (!cancelled) setPhotoError(err.message)
      })
      .finally(() => {
        if (!cancelled) setPhotosLoading(false)
      })
    return () => { cancelled = true }
  }, [object.id])

  // --- Name inline-edit ---

  const startNameEdit = useCallback(() => {
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [])

  const saveName = useCallback(async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === object.name) {
      setNameValue(object.name)
      setEditingName(false)
      return
    }
    setSavingName(true)
    await onUpdate({ name: trimmed })
    setSavingName(false)
    setEditingName(false)
  }, [nameValue, object.name, onUpdate])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setNameValue(object.name)
      setEditingName(false)
    }
  }, [object.name])

  // --- Notiz inline-edit ---

  const startNotizEdit = useCallback(() => {
    setShowNotiz(true)
    setEditingNotiz(true)
    setTimeout(() => notizRef.current?.focus(), 50)
  }, [])

  const saveNotiz = useCallback(async () => {
    const trimmed = notizValue.trim()
    if (trimmed === (object.description || '')) {
      setEditingNotiz(false)
      if (!trimmed) setShowNotiz(false)
      return
    }
    setSavingNotiz(true)
    await onUpdate({ description: trimmed || null })
    setSavingNotiz(false)
    setEditingNotiz(false)
    if (!trimmed) setShowNotiz(false)
  }, [notizValue, object.description, onUpdate])

  const clearNotiz = useCallback(async () => {
    setSavingNotiz(true)
    await onUpdate({ description: null })
    setSavingNotiz(false)
    setNotizValue('')
    setEditingNotiz(false)
    setShowNotiz(false)
  }, [onUpdate])

  // --- Löschen ---

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    onDelete()
  }, [onDelete])

  // --- Fullscreen: History-Management (Back-Button schliesst Overlay) ---

  const openFullscreen = useCallback((url: string) => {
    setFullscreenPhoto(url)
    fullscreenOpenRef.current = true
    window.history.pushState({ fullscreenPhoto: true }, '')
  }, [])

  const closeFullscreen = useCallback(() => {
    if (fullscreenOpenRef.current) {
      fullscreenOpenRef.current = false
      window.history.back()
    }
    setFullscreenPhoto(null)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      if (fullscreenOpenRef.current) {
        fullscreenOpenRef.current = false
        setFullscreenPhoto(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      // Cleanup: Falls Overlay noch offen ist wenn Sheet unmountet
      if (fullscreenOpenRef.current) {
        fullscreenOpenRef.current = false
        window.history.back()
      }
    }
  }, [])

  // --- Foto Upload ---

  async function handlePhotoCapture(file: File) {
    setUploading(true)
    setPhotoError(null)
    try {
      const { url, path } = await uploadPhoto({
        file,
        userId,
        entityType: 'map_object',
        entityId: object.id,
      })

      const supabase = createClient()
      const { data, error } = await supabase
        .from('map_object_photos')
        .insert({
          map_object_id: object.id,
          url,
          storage_path: path,
          uploaded_by: userId,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)

      setPhotos((prev) => [data as MapObjectPhoto, ...prev])
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  // --- Foto Delete ---

  async function handlePhotoDelete(photo: MapObjectPhoto) {
    const ok = await confirmSheet({
      title: 'Foto löschen?',
      description: 'Das Foto wird endgültig entfernt.',
      confirmLabel: 'Löschen',
      confirmVariant: 'danger',
    })
    if (!ok) return
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('map_object_photos')
        .delete()
        .eq('id', photo.id)

      if (error) throw new Error(error.message)

      await deletePhoto(photo.storage_path)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
      setPhotos((prev) => [photo, ...prev].sort(
        (a, b) => (a.created_at < b.created_at ? 1 : -1)
      ))
    }
  }

  const typeLabel = TYPE_LABELS[object.type] || object.type

  // --- Swipe-to-close ---
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipeStartY = useRef(0)
  const swipeStartTime = useRef(0)
  const swipeDeltaY = useRef(0)
  const isSwiping = useRef(false)

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
    // Nur nach unten ziehen erlauben
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
    const velocity = swipeDeltaY.current / Math.max(elapsed, 1) // px/ms

    if (swipeDeltaY.current > 80 || velocity > 0.5) {
      // Raus-animieren und schliessen
      sheet.style.transition = 'transform 0.25s ease-out'
      sheet.style.transform = 'translateY(100%)'
      setTimeout(onClose, 250)
    } else {
      // Zurueck-snappen
      sheet.style.transition = 'transform 0.2s ease'
      sheet.style.transform = 'translateY(0)'
    }
  }, [onClose])

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onClose} />
      <div
        ref={sheetRef}
        className="map-object-sheet"
        style={{
          paddingBottom: '1rem',
          maxHeight: '70dvh',
          display: 'flex',
          flexDirection: 'column',
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

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '0.75rem 1rem 0' }}>
            {/* Name — Inline-Edit */}
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={handleNameKeyDown}
                  disabled={savingName}
                  style={{
                    flex: 1,
                    padding: '0.375rem 0.5rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--green)',
                    borderRadius: '0.5rem',
                    color: 'var(--text)',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                  }}
                />
                <span style={{ color: 'var(--green)', fontSize: '1.125rem' }}>✓</span>
              </div>
            ) : (
              <button
                onClick={startNameEdit}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                  margin: 0,
                  lineHeight: 1.3,
                }}>
                  {object.name}
                </h2>
              </button>
            )}

            {/* Typ-Label */}
            <p style={{
              fontSize: '0.8125rem',
              color: 'var(--text-3)',
              margin: '0.25rem 0 0',
            }}>
              {typeLabel}
            </p>
          </div>

          {/* Notiz-Bereich */}
          <div style={{ padding: '0.75rem 1rem 0' }}>
            {!showNotiz ? (
              <button
                onClick={startNotizEdit}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0.25rem 0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  color: 'var(--text-3)',
                  fontSize: '0.8125rem',
                }}
              >
                <span style={{ fontSize: '0.875rem' }}>+</span>
                Notiz hinzufügen
              </button>
            ) : editingNotiz ? (
              <div>
                <textarea
                  ref={notizRef}
                  value={notizValue}
                  onChange={e => setNotizValue(e.target.value)}
                  onBlur={saveNotiz}
                  disabled={savingNotiz}
                  placeholder="Notiz eingeben…"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--green)',
                    borderRadius: '0.625rem',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                    resize: 'none',
                  }}
                />
              </div>
            ) : (
              <div style={{
                position: 'relative',
                background: 'var(--surface-2)',
                borderRadius: '0.625rem',
                padding: '0.625rem 0.75rem',
              }}>
                <button
                  onClick={() => {
                    setEditingNotiz(true)
                    setTimeout(() => notizRef.current?.focus(), 50)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    color: 'var(--text-2)',
                    fontSize: '0.875rem',
                    lineHeight: 1.5,
                  }}
                >
                  {notizValue}
                </button>
                <button
                  onClick={clearNotiz}
                  disabled={savingNotiz}
                  style={{
                    position: 'absolute',
                    top: '0.375rem',
                    right: '0.375rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-3)',
                    fontSize: '0.75rem',
                    padding: '0.25rem',
                    lineHeight: 1,
                  }}
                  title="Notiz entfernen"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Foto-Section */}
          <div style={{ padding: '0.75rem 1rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Fotos
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto',
                paddingBottom: '0.25rem',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* Plus-Kachel */}
              <PhotoCapture
                quality="documentation"
                onCapture={handlePhotoCapture}
                disabled={uploading}
                onError={(e) => setPhotoError(e.message)}
              >
                <button
                  type="button"
                  aria-label="Foto hinzufügen"
                  style={{
                    flex: '0 0 auto',
                    width: '4.5rem',
                    height: '4.5rem',
                    border: '2px dashed var(--border)',
                    borderRadius: '0.5rem',
                    background: 'transparent',
                    color: 'var(--text-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: uploading ? 'wait' : 'pointer',
                    opacity: uploading ? 0.5 : 1,
                  }}
                >
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={24} />}
                </button>
              </PhotoCapture>

              {/* Loading-Placeholder */}
              {photosLoading && photos.length === 0 && (
                <div
                  style={{
                    flex: '0 0 auto',
                    width: '4.5rem',
                    height: '4.5rem',
                    borderRadius: '0.5rem',
                    background: 'var(--surface-2)',
                  }}
                />
              )}

              {/* Bestehende Fotos */}
              {photos.map((photo) => (
                <PhotoThumbnail
                  key={photo.id}
                  url={photo.url}
                  size={4.5}
                  shape="square"
                  onTap={() => openFullscreen(photo.url)}
                  onDelete={() => handlePhotoDelete(photo)}
                />
              ))}
            </div>

            {photoError && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--red)' }}>
                {photoError}
              </div>
            )}
          </div>

          {/* Trennlinie */}
          <div style={{
            margin: '0 1rem',
            height: '1px',
            background: 'var(--border)',
          }} />

          {/* Aktions-Liste */}
          <div style={{ padding: '0 1rem' }}>
            <button
              onClick={onPositionChange}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 0.25rem',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text)',
                fontSize: '0.9375rem',
                minHeight: '2.75rem',
              }}
            >
              <span style={{ fontSize: '1.125rem' }}>📍</span>
              Position ändern
            </button>

            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 0.25rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--red)',
                fontSize: '0.9375rem',
                minHeight: '2.75rem',
              }}
            >
              <span style={{ fontSize: '1.125rem' }}>🗑</span>
              Löschen
            </button>
          </div>

          {/* Lösch-Bestätigung (Stufe 2) */}
          {confirmDelete && (
            <div style={{
              margin: '0.5rem 1rem 0',
              padding: '0.75rem',
              background: 'rgba(239, 83, 80, 0.1)',
              borderRadius: 'var(--radius)',
              border: '1px solid rgba(239, 83, 80, 0.25)',
            }}>
              <p style={{
                fontSize: '0.8125rem',
                color: 'var(--text-2)',
                margin: '0 0 0.625rem',
                lineHeight: 1.4,
              }}>
                Wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    flex: 1,
                    padding: '0.625rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-2)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: '2.75rem',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '0.625rem',
                    background: 'var(--red)',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    color: 'white',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    cursor: deleting ? 'default' : 'pointer',
                    opacity: deleting ? 0.6 : 1,
                    minHeight: '2.75rem',
                  }}
                >
                  {deleting ? 'Lösche…' : 'Endgültig löschen'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Foto-Overlay */}
      {fullscreenPhoto && (
        <div
          className="chat-fullscreen-overlay"
          onClick={closeFullscreen}
        >
          <img src={fullscreenPhoto} alt="" className="chat-fullscreen-img" />
          <button
            className="chat-fullscreen-close"
            onClick={closeFullscreen}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
