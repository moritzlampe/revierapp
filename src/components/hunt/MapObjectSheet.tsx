'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GeoPosition } from '@/hooks/useGeolocation'

// DB-Enum map_object_type
const MAP_OBJECT_TYPES = [
  { value: 'hochsitz', label: 'Hochsitz', icon: '🪵' },
  { value: 'kanzel', label: 'Kanzel', icon: '🏠' },
  { value: 'drueckjagdstand', label: 'Drückjagdstand', icon: '🎯' },
  { value: 'parkplatz', label: 'Parkplatz', icon: '🅿️' },
  { value: 'kirrung', label: 'Kirrung', icon: '🌾' },
] as const

const MORE_TYPES = [
  { value: 'salzlecke', label: 'Salzlecke', icon: '🧂' },
  { value: 'wildkamera', label: 'Wildkamera', icon: '📷' },
  { value: 'sonstiges', label: 'Sonstiges', icon: '📌' },
] as const

export interface MapObjectData {
  id: string
  name: string
  type: string
  position: { lat: number; lng: number }
  description?: string | null
  created_by?: string | null
  district_id?: string | null
}

interface MapObjectSheetProps {
  mode: 'create' | 'edit' | 'hidden'
  position: { lat: number; lng: number } | null
  editData?: MapObjectData | null
  districtId: string | null
  gpsPosition: GeoPosition | null
  onSave: (obj: MapObjectData) => void
  onDelete?: (id: string) => void
  onClose: () => void
}

export default function MapObjectSheet({
  mode,
  position,
  editData,
  districtId,
  gpsPosition,
  onSave,
  onDelete,
  onClose,
}: MapObjectSheetProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState('hochsitz')
  const [description, setDescription] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Felder befüllen bei Modus-Wechsel
  useEffect(() => {
    if (mode === 'create' && position) {
      setName('')
      setType('hochsitz')
      setDescription('')
      setCoords(position)
      setShowMore(false)
    } else if (mode === 'edit' && editData) {
      setName(editData.name)
      setType(editData.type)
      setDescription(editData.description || '')
      setCoords(editData.position)
      // Wenn Typ in MORE_TYPES ist, automatisch aufklappen
      if (MORE_TYPES.some(t => t.value === editData.type)) {
        setShowMore(true)
      }
    }
  }, [mode, position, editData])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const useMyPosition = useCallback(() => {
    if (gpsPosition) {
      setCoords(gpsPosition)
    }
  }, [gpsPosition])

  async function handleSave() {
    if (!name.trim() || !coords) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const ewkt = `SRID=4326;POINT(${coords.lng} ${coords.lat})`

    if (mode === 'create') {
      const { data, error } = await supabase
        .from('map_objects')
        .insert({
          name: name.trim(),
          type,
          position: ewkt,
          description: description.trim() || null,
          district_id: districtId || null,
          created_by: user.id,
        })
        .select('id')
        .single()

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('map_objects insert error:', error.message)
        }
        setSaving(false)
        return
      }

      const saved: MapObjectData = {
        id: data.id,
        name: name.trim(),
        type,
        position: coords,
        description: description.trim() || null,
        created_by: user.id,
        district_id: districtId,
      }
      showToast('Gespeichert ✓')
      onSave(saved)
    } else if (mode === 'edit' && editData) {
      const { error } = await supabase
        .from('map_objects')
        .update({
          name: name.trim(),
          type,
          position: ewkt,
          description: description.trim() || null,
        })
        .eq('id', editData.id)

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('map_objects update error:', error.message)
        }
        setSaving(false)
        return
      }

      const updated: MapObjectData = {
        ...editData,
        name: name.trim(),
        type,
        position: coords,
        description: description.trim() || null,
      }
      showToast('Aktualisiert ✓')
      onSave(updated)
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!editData) return
    setSaving(true)

    const supabase = createClient()
    const { error } = await supabase
      .from('map_objects')
      .delete()
      .eq('id', editData.id)

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('map_objects delete error:', error.message)
      }
      setSaving(false)
      setShowConfirmDelete(false)
      return
    }

    showToast('Gelöscht')
    setShowConfirmDelete(false)
    setSaving(false)
    onDelete?.(editData.id)
  }

  if (mode === 'hidden') {
    return toast ? <div className="map-toast">{toast}</div> : null
  }

  const allTypes = showMore
    ? [...MAP_OBJECT_TYPES, ...MORE_TYPES]
    : MAP_OBJECT_TYPES

  return (
    <>
      {/* Overlay */}
      <div className="map-object-sheet-overlay" onClick={onClose} />

      {/* Sheet */}
      <div className="map-object-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          {mode === 'create' ? 'Neues Revierobjekt' : 'Bearbeiten'}
        </div>

        <div className="sheet-body">
          {/* Typ-Auswahl */}
          <div>
            <div className="sheet-label">Typ</div>
            <div className="type-pills">
              {allTypes.map(t => (
                <button
                  key={t.value}
                  className={`type-pill${type === t.value ? ' active' : ''}`}
                  onClick={() => setType(t.value)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
              {!showMore && (
                <button className="type-more-btn" onClick={() => setShowMore(true)}>
                  + Mehr
                </button>
              )}
            </div>
          </div>

          {/* Name */}
          <div>
            <div className="sheet-label">Name *</div>
            <input
              className="sheet-input"
              type="text"
              placeholder="z.B. Eicheneck"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              maxLength={100}
            />
          </div>

          {/* Beschreibung */}
          <div>
            <div className="sheet-label">Beschreibung</div>
            <input
              className="sheet-input"
              type="text"
              placeholder="Optional, z.B. 'Am Waldrand, 4m'"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>

          {/* Koordinaten */}
          <div>
            <div className="sheet-label">Position</div>
            <div className="sheet-coords">
              <span>
                {coords
                  ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                  : '—'}
              </span>
              <button
                className="sheet-gps-btn"
                onClick={useMyPosition}
                disabled={!gpsPosition}
              >
                📍 Meine Position
              </button>
            </div>
          </div>

          {/* Aktions-Buttons */}
          <div className="sheet-actions">
            <button className="sheet-btn-cancel" onClick={onClose}>
              Abbrechen
            </button>
            {mode === 'edit' && (
              <button
                className="sheet-btn-delete"
                onClick={() => setShowConfirmDelete(true)}
              >
                🗑️
              </button>
            )}
            <button
              className="sheet-btn-save"
              onClick={handleSave}
              disabled={!name.trim() || !coords || saving}
            >
              {saving ? '...' : 'Speichern ✓'}
            </button>
          </div>
        </div>
      </div>

      {/* Löschen-Bestätigung */}
      {showConfirmDelete && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <p>
              <strong>{editData?.name}</strong> wirklich löschen?
            </p>
            <div className="confirm-actions">
              <button
                className="sheet-btn-cancel"
                style={{ flex: 1 }}
                onClick={() => setShowConfirmDelete(false)}
              >
                Abbrechen
              </button>
              <button
                className="sheet-btn-delete"
                style={{ flex: 1 }}
                onClick={handleDelete}
                disabled={saving}
              >
                {saving ? '...' : '🗑️ Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast (über dem Sheet) */}
      {toast && <div className="map-toast">{toast}</div>}
    </>
  )
}
