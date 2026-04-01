'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { polygonAreaHectares } from '@/lib/geo-utils'

interface BoundarySheetProps {
  mode: 'save' | 'hidden'
  points: { lat: number; lng: number }[]
  /** Bestehendes Revier (beim Bearbeiten) */
  existingDistrict?: { id: string; name: string } | null
  /** Aktive Jagd-ID, um district_id zu verknüpfen */
  huntId?: string | null
  onSave: () => void
  onClose: () => void
  onDelete?: () => void
}

export default function BoundarySheet({
  mode,
  points,
  existingDistrict,
  huntId,
  onSave,
  onClose,
  onDelete,
}: BoundarySheetProps) {
  const [name, setName] = useState('')
  const [linkHunt, setLinkHunt] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const areaHa = polygonAreaHectares(points)
  const isEdit = !!existingDistrict

  useEffect(() => {
    if (mode === 'save') {
      setName(existingDistrict?.name ?? '')
      setLinkHunt(true)
      setShowConfirmDelete(false)
    }
  }, [mode, existingDistrict])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  async function handleSave() {
    if (!name.trim() || points.length < 3) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // Polygon schliessen: erster = letzter Punkt
    const closed = [...points, points[0]]
    const wkt = closed.map(p => `${p.lng} ${p.lat}`).join(', ')
    const ewkt = `SRID=4326;POLYGON((${wkt}))`

    if (isEdit && existingDistrict) {
      // UPDATE bestehendes Revier
      const { error } = await supabase
        .from('districts')
        .update({ name: name.trim(), boundary: ewkt })
        .eq('id', existingDistrict.id)

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('districts update error:', error.message)
        }
        setSaving(false)
        return
      }

      showToast('Reviergrenze aktualisiert \u2713')
    } else {
      // INSERT neues Revier
      const { data, error } = await supabase
        .from('districts')
        .insert({
          name: name.trim(),
          boundary: ewkt,
          owner_id: user.id,
        })
        .select('id')
        .single()

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('districts insert error:', error.message)
        }
        setSaving(false)
        return
      }

      // Jagd mit Revier verknüpfen
      if (linkHunt && huntId && data) {
        await supabase
          .from('hunts')
          .update({ district_id: data.id })
          .eq('id', huntId)
      }

      showToast('Reviergrenze gespeichert \u2713')
    }

    setSaving(false)
    onSave()
  }

  async function handleDelete() {
    if (!existingDistrict) return
    setSaving(true)

    const supabase = createClient()

    // Zuerst Jagd-Verknüpfungen lösen
    await supabase
      .from('hunts')
      .update({ district_id: null })
      .eq('district_id', existingDistrict.id)

    const { error } = await supabase
      .from('districts')
      .delete()
      .eq('id', existingDistrict.id)

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('districts delete error:', error.message)
      }
      setSaving(false)
      setShowConfirmDelete(false)
      return
    }

    showToast('Reviergrenze gelöscht')
    setShowConfirmDelete(false)
    setSaving(false)
    onDelete?.()
  }

  if (mode === 'hidden') {
    return toast ? <div className="map-toast">{toast}</div> : null
  }

  return (
    <>
      {/* Overlay */}
      <div className="map-object-sheet-overlay" onClick={onClose} />

      {/* Sheet */}
      <div className="map-object-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          {isEdit ? 'Reviergrenze bearbeiten' : 'Reviergrenze speichern'}
        </div>

        <div className="sheet-body">
          {/* Name */}
          <div>
            <div className="sheet-label">Revier-Name *</div>
            <input
              className="sheet-input"
              type="text"
              placeholder="z.B. Brockwinkel"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              maxLength={100}
            />
          </div>

          {/* Fläche */}
          <div>
            <div className="sheet-label">Fläche</div>
            <div className="sheet-coords">
              <span style={{ fontFamily: "'DM Sans', sans-serif", color: 'var(--text)' }}>
                {areaHa < 1
                  ? `${(areaHa * 10000).toFixed(0)} m²`
                  : `${areaHa.toFixed(1)} ha`}
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>
                {points.length} Punkte
              </span>
            </div>
          </div>

          {/* Jagd verknüpfen (nur bei Neuerstellung + aktiver Jagd) */}
          {!isEdit && huntId && (
            <div>
              <div className="layer-panel-overlay">
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  Jagd mit Revier verknüpfen?
                </span>
                <button
                  className={`layer-toggle${linkHunt ? ' on' : ''}`}
                  onClick={() => setLinkHunt(!linkHunt)}
                >
                  <span className="layer-toggle-knob" />
                </button>
              </div>
            </div>
          )}

          {/* Aktions-Buttons */}
          <div className="sheet-actions">
            <button className="sheet-btn-cancel" onClick={onClose}>
              Abbrechen
            </button>
            {isEdit && (
              <button
                className="sheet-btn-delete"
                onClick={() => setShowConfirmDelete(true)}
              >
                Löschen
              </button>
            )}
            <button
              className="sheet-btn-save"
              onClick={handleSave}
              disabled={!name.trim() || points.length < 3 || saving}
            >
              {saving ? '...' : 'Speichern \u2713'}
            </button>
          </div>
        </div>
      </div>

      {/* Löschen-Bestätigung */}
      {showConfirmDelete && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <p>
              Reviergrenze <strong>{existingDistrict?.name}</strong> wirklich löschen?
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
                {saving ? '...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="map-toast">{toast}</div>}
    </>
  )
}
