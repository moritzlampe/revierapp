'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { parsePolygonHex } from '@/lib/geo-utils'
import { createClient } from '@/lib/supabase/client'
import type { MapObject, ObjektType } from '@/lib/types/revier'
import { parsePointHex } from '@/lib/geo-utils'
import CategorySheet from '@/components/revier/CategorySheet'
import TypeSheet from '@/components/revier/TypeSheet'
import ObjektEditSheet from '@/components/revier/ObjektEditSheet'
import ObjektDetailSheet from '@/components/revier/ObjektDetailSheet'
import PositionConfirmBar from '@/components/revier/PositionConfirmBar'

const RevierMap = dynamic(() => import('@/components/revier/RevierMap'), { ssr: false })

type District = {
  id: string
  name: string
  owner_id: string
  boundary: unknown
  area_ha: number | null
  bundesland: string | null
}

type Props = {
  district: District
  objects: MapObject[]
  userId: string
}

// --- State Machine ---

type CreationStage =
  | { stage: 'idle' }
  | { stage: 'category-sheet' }
  | { stage: 'type-sheet'; category: 'stand' | 'sonstiges' }
  | { stage: 'awaiting-tap'; type: ObjektType; defaultName: string; defaultDescription: string }
  | { stage: 'positioning'; type: ObjektType; position: [number, number]; defaultName: string; defaultDescription: string; existingId?: string }
  | { stage: 'metadata'; type: ObjektType; position: [number, number]; defaultName: string; defaultDescription: string }
  | { stage: 'detail'; object: MapObject }

// --- Typ-Label für die Pille ---

const TYPE_LABELS: Record<ObjektType, string> = {
  hochsitz: 'Hochsitz',
  kanzel: 'Kanzel',
  drueckjagdstand: 'Drückjagdbock',
  parkplatz: 'Parkplatz',
  kirrung: 'Kirrung',
  salzlecke: 'Salzlecke',
  wildkamera: 'Wildkamera',
  sonstiges: 'Objekt',
}

/** Position aus MapObject parsen → [lat, lng] */
function parseObjectPosition(pos: unknown): [number, number] | null {
  if (pos && typeof pos === 'object' && 'type' in pos && 'coordinates' in pos) {
    const geo = pos as { type: string; coordinates: number[] }
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return [geo.coordinates[1], geo.coordinates[0]]
    }
    return null
  }
  if (typeof pos === 'string') {
    const p = parsePointHex(pos)
    return p ? [p.lat, p.lng] : null
  }
  return null
}

/** Einfacher Centroid: Durchschnitt aller Punkte des ersten Rings */
function centroidFromBoundary(rings: [number, number][][]): [number, number] {
  const ring = rings[0]
  if (!ring || ring.length === 0) return [53.26, 10.35]
  const sumLat = ring.reduce((s, [lat]) => s + lat, 0)
  const sumLng = ring.reduce((s, [, lng]) => s + lng, 0)
  return [sumLat / ring.length, sumLng / ring.length]
}

export default function RevierContent({ district, objects: initialObjects, userId }: Props) {
  const router = useRouter()
  const [objects, setObjects] = useState<MapObject[]>(initialObjects)
  const [creation, setCreation] = useState<CreationStage>({ stage: 'idle' })
  const [toast, setToast] = useState<string | null>(null)

  // Metadaten-Entwurf: überlebt positioning ↔ metadata Wechsel
  const [draftMetadata, setDraftMetadata] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  })

  const boundary = useMemo(
    () => parsePolygonHex(district.boundary),
    [district.boundary],
  )

  const center = useMemo<[number, number]>(
    () => boundary ? centroidFromBoundary(boundary) : [53.26, 10.35],
    [boundary],
  )

  // Bottom-Bar ausblenden wenn Erstellungs-Flow aktiv
  const creationActive = creation.stage !== 'idle'
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('quickhunt:keyboard', { detail: { open: creationActive } }))
    return () => {
      if (creationActive) {
        window.dispatchEvent(new CustomEvent('quickhunt:keyboard', { detail: { open: false } }))
      }
    }
  }, [creationActive])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  // --- State-Übergänge ---

  const goIdle = useCallback(() => {
    setCreation({ stage: 'idle' })
    setDraftMetadata({ name: '', description: '' })
  }, [])

  const handleCategorySelect = useCallback((category: 'stand' | 'sonstiges') => {
    setCreation({ stage: 'type-sheet', category })
  }, [])

  const handleTypeSelect = useCallback((opt: { type: ObjektType; defaultName: string; defaultDescription?: string }) => {
    // Metadaten-Entwurf mit Defaults füllen
    setDraftMetadata({
      name: opt.defaultName,
      description: opt.defaultDescription || '',
    })
    setCreation({
      stage: 'awaiting-tap',
      type: opt.type,
      defaultName: opt.defaultName,
      defaultDescription: opt.defaultDescription || '',
    })
  }, [])

  const handleMapClick = useCallback((latlng: [number, number]) => {
    setCreation(prev => {
      if (prev.stage === 'awaiting-tap') {
        return { ...prev, stage: 'positioning', position: latlng }
      }
      if (prev.stage === 'positioning') {
        return { ...prev, position: latlng }
      }
      if (prev.stage === 'metadata') {
        // Zurück zu positioning mit aktualisierter Position
        return { ...prev, stage: 'positioning', position: latlng }
      }
      return prev
    })
  }, [])

  // Objekte neu laden
  const refreshObjects = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('map_objects')
      .select('id, district_id, type, name, position, description, photo_url, created_by, created_at')
      .eq('district_id', district.id)
    if (data) setObjects(data as MapObject[])
    return data as MapObject[] | null
  }, [district.id])

  const handlePositionConfirm = useCallback(async () => {
    if (creation.stage !== 'positioning') return

    // Position-Verschieben-Flow: direkt UPDATE, kein metadata-Stage
    if (creation.existingId) {
      const supabase = createClient()
      const ewkt = `SRID=4326;POINT(${creation.position[1]} ${creation.position[0]})`
      const { error } = await supabase
        .from('map_objects')
        .update({ position: ewkt })
        .eq('id', creation.existingId)

      if (error) {
        console.error('Position-Update fehlgeschlagen:', error.message)
        return
      }
      // Objekte neu laden und zurück zu detail mit aktualisiertem Objekt
      const fresh = await refreshObjects()
      const updated = fresh?.find(o => o.id === creation.existingId)
      if (updated) {
        setCreation({ stage: 'detail', object: updated })
      } else {
        setCreation({ stage: 'idle' })
      }
      showToast('Position aktualisiert ✓')
      return
    }

    // Normaler Neu-Anlegen-Flow: weiter zu metadata
    setCreation(prev => {
      if (prev.stage === 'positioning') {
        return { ...prev, stage: 'metadata' }
      }
      return prev
    })
  }, [creation, refreshObjects, showToast])

  // Verwerfen im positioning-Stage: zurück zu detail wenn existingId, sonst idle
  const handlePositionDiscard = useCallback(() => {
    if (creation.stage === 'positioning' && creation.existingId) {
      // Zurück zu detail mit Original-Objekt aus der objects-Liste
      const original = objects.find(o => o.id === creation.existingId)
      if (original) {
        setCreation({ stage: 'detail', object: original })
        return
      }
    }
    goIdle()
  }, [creation, objects, goIdle])

  const handleBackToPositioning = useCallback(() => {
    setCreation(prev => {
      if (prev.stage === 'metadata') {
        return { ...prev, stage: 'positioning' }
      }
      return prev
    })
  }, [])

  // Objekte neu laden nach Speichern (Neues Objekt)
  const handleSaved = useCallback(async () => {
    await refreshObjects()
    setCreation({ stage: 'idle' })
    setDraftMetadata({ name: '', description: '' })
    showToast('Gespeichert ✓')
  }, [refreshObjects, showToast])

  // --- Detail-Sheet Handlers ---

  const handleObjectClick = useCallback((obj: MapObject) => {
    setCreation({ stage: 'detail', object: obj })
  }, [])

  const handleDetailClose = useCallback(() => {
    setCreation({ stage: 'idle' })
  }, [])

  const handleDetailUpdate = useCallback(async (changes: Partial<MapObject>) => {
    if (creation.stage !== 'detail') return
    const supabase = createClient()
    const { error } = await supabase
      .from('map_objects')
      .update(changes)
      .eq('id', creation.object.id)

    if (error) {
      console.error('Update fehlgeschlagen:', error.message)
      return
    }
    // Lokalen State optimistisch aktualisieren
    const updated = { ...creation.object, ...changes }
    setObjects(prev => prev.map(o => o.id === updated.id ? updated : o))
    setCreation({ stage: 'detail', object: updated })
  }, [creation])

  const handleDetailPositionChange = useCallback(() => {
    if (creation.stage !== 'detail') return
    const obj = creation.object
    const pos = parseObjectPosition(obj.position)
    if (!pos) return
    setCreation({
      stage: 'positioning',
      type: obj.type,
      position: pos,
      defaultName: obj.name,
      defaultDescription: obj.description || '',
      existingId: obj.id,
    })
  }, [creation])

  const handleDetailDelete = useCallback(async () => {
    if (creation.stage !== 'detail') return
    const supabase = createClient()
    const { error } = await supabase
      .from('map_objects')
      .delete()
      .eq('id', creation.object.id)

    if (error) {
      console.error('Löschen fehlgeschlagen:', error.message)
      return
    }
    setObjects(prev => prev.filter(o => o.id !== creation.object.id))
    setCreation({ stage: 'idle' })
    showToast('Gelöscht ✓')
  }, [creation, showToast])

  // --- Abgeleitete Werte ---

  const isInteractive = creation.stage === 'awaiting-tap'
    || creation.stage === 'positioning'
    || creation.stage === 'metadata'

  const previewPin = (creation.stage === 'positioning' || creation.stage === 'metadata')
    ? {
        type: creation.type,
        position: creation.position,
        confirmed: creation.stage === 'metadata',
      }
    : null

  // ID des Objekts das während Position-Verschieben ausgeblendet wird
  const hiddenObjectId = (creation.stage === 'positioning' && creation.existingId)
    ? creation.existingId
    : null

  // Pille nur im awaiting-tap Stage (positioning hat die ConfirmBar unten)
  const pillText = creation.stage === 'awaiting-tap'
    ? `Tippe auf die Karte um ${TYPE_LABELS[creation.type]} zu setzen`
    : null

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          zIndex: 1000,
          minHeight: '3.5rem',
        }}
      >
        <button
          onClick={() => router.push('/app/du')}
          className="flex items-center justify-center rounded-lg"
          style={{
            color: 'var(--text-2)',
            background: 'var(--surface-2)',
            minWidth: '2.75rem',
            minHeight: '2.75rem',
            fontSize: '1.125rem',
          }}
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">{district.name}</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {objects.length} {objects.length === 1 ? 'Objekt' : 'Objekte'}
            {district.area_ha ? ` · ${Math.round(district.area_ha)} ha` : ''}
          </p>
        </div>
      </div>

      {/* Karte */}
      <div className="flex-1 relative" style={{ zIndex: 1 }}>
        <RevierMap
          center={center}
          zoom={14}
          objects={objects}
          boundary={boundary}
          onMapClick={isInteractive ? handleMapClick : undefined}
          onObjectClick={creation.stage === 'idle' ? handleObjectClick : undefined}
          previewPin={previewPin}
          hiddenObjectId={hiddenObjectId}
        />

        {/* Info-Pille (nur awaiting-tap) */}
        {pillText && (
          <div style={{
            position: 'absolute',
            top: '0.75rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            borderRadius: '2rem',
            padding: '0.5rem 1rem',
            fontSize: '0.8125rem',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
          }}>
            <span>{pillText}</span>
            <button
              onClick={goIdle}
              style={{
                background: 'var(--surface-3)',
                border: 'none',
                borderRadius: '1rem',
                padding: '0.25rem 0.625rem',
                fontSize: '0.75rem',
                color: 'var(--text-2)',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* FAB */}
        {creation.stage === 'idle' && (
          <button
            onClick={() => setCreation({ stage: 'category-sheet' })}
            style={{
              position: 'absolute',
              bottom: 'calc(var(--bottom-bar-space, 3.5rem) + 1rem)',
              right: '0.75rem',
              zIndex: 1050,
              width: '3.5rem',
              height: '3.5rem',
              borderRadius: '50%',
              background: 'var(--green-bright)',
              border: 'none',
              boxShadow: '0 0.25rem 0.5rem rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              color: 'white',
              cursor: 'pointer',
            }}
            title="Neues Objekt setzen"
          >
            +
          </button>
        )}

        {/* Sheets */}
        {creation.stage === 'category-sheet' && (
          <CategorySheet
            onSelect={handleCategorySelect}
            onCancel={goIdle}
          />
        )}

        {creation.stage === 'type-sheet' && (
          <TypeSheet
            category={creation.category}
            onSelect={handleTypeSelect}
            onBack={() => setCreation({ stage: 'category-sheet' })}
            onCancel={goIdle}
          />
        )}

        {creation.stage === 'metadata' && (
          <ObjektEditSheet
            type={creation.type}
            position={creation.position}
            districtId={district.id}
            userId={userId}
            name={draftMetadata.name}
            description={draftMetadata.description}
            onNameChange={name => setDraftMetadata(prev => ({ ...prev, name }))}
            onDescriptionChange={description => setDraftMetadata(prev => ({ ...prev, description }))}
            onSaved={handleSaved}
            onBack={handleBackToPositioning}
            onDiscard={goIdle}
          />
        )}

        {creation.stage === 'detail' && (
          <ObjektDetailSheet
            object={creation.object}
            userId={userId}
            onClose={handleDetailClose}
            onPositionChange={handleDetailPositionChange}
            onDelete={handleDetailDelete}
            onUpdate={handleDetailUpdate}
          />
        )}
      </div>

      {/* Position-Bestätigungs-Bar (nur positioning-Stage) */}
      {creation.stage === 'positioning' && (
        <PositionConfirmBar
          onConfirm={handlePositionConfirm}
          onDiscard={handlePositionDiscard}
          confirmLabel={creation.existingId ? '✓ Neue Position bestätigen' : undefined}
          discardLabel={creation.existingId ? '← Zurück' : undefined}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '6rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
          padding: '0.625rem 1.25rem',
          borderRadius: 'var(--radius)',
          fontSize: '0.875rem',
          fontWeight: 600,
          zIndex: 2000,
          border: '1px solid var(--border)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
