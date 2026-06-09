'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Crosshair, CircleNotch } from '@phosphor-icons/react'
import { parsePolygonHex } from '@/lib/geo-utils'
import { createClient } from '@/lib/supabase/client'
import { waitForAccurateGpsFix } from '@/lib/geo/wait-for-gps-fix'
import type { MapObject, ObjektType } from '@/lib/types/revier'
import { parsePointHex } from '@/lib/geo-utils'
import { useBoundaryEditor } from '@/hooks/useBoundaryEditor'
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

/**
 * Smart-Paste: erkennt zwei Zahlen in einem Google-Maps-String und trennt sie.
 * Klammern, Grad-Zeichen, Himmelsrichtungen etc. werden zu Trennern.
 * Gibt { lat, lng } zurück wenn GENAU zwei Zahlen erkannt werden, sonst null
 * (= Teil-Eingabe / manuelles Tippen, Feld bleibt unangetastet).
 *   "(53.1234, 10.5678)" / "53.1234; 10.5678" / "53.1234 10.5678" → 53.1234 / 10.5678
 */
function parseCoordPaste(raw: string): { lat: string; lng: string } | null {
  // Alles ausser Ziffern, Punkt, Minus und Trennern → Leerzeichen (= Trenner)
  const cleaned = raw.replace(/[^0-9.\-,;\s]/g, ' ')
  const tokens = cleaned
    .split(/[,;\s]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
  if (tokens.length === 2 && Number.isFinite(Number(tokens[0])) && Number.isFinite(Number(tokens[1]))) {
    return { lat: tokens[0], lng: tokens[1] }
  }
  return null
}

export default function RevierContent({ district, objects: initialObjects, userId }: Props) {
  const router = useRouter()
  const [objects, setObjects] = useState<MapObject[]>(initialObjects)
  const [creation, setCreation] = useState<CreationStage>({ stage: 'idle' })
  const [toast, setToast] = useState<string | null>(null)

  // GPS-Standort-Capture (awaiting-tap-Stage)
  const [gpsLoading, setGpsLoading] = useState(false)
  // Imperatives Karten-Schwenken nach GPS-Fix (nonce triggert erneut)
  const [centerTarget, setCenterTarget] = useState<{ lat: number; lng: number; nonce: number } | null>(null)

  // Koordinaten-Eingabe (zwei Felder + Smart-Paste, awaiting-tap-Stage)
  const [coordOpen, setCoordOpen] = useState(false)
  const [coordLat, setCoordLat] = useState('')
  const [coordLng, setCoordLng] = useState('')
  const [coordError, setCoordError] = useState<string | null>(null)

  // Metadaten-Entwurf: überlebt positioning ↔ metadata Wechsel
  const [draftMetadata, setDraftMetadata] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  })

  // Live-Boundary aus DB (aktualisiert sich nach Speichern)
  const [boundaryRaw, setBoundaryRaw] = useState<unknown>(district.boundary)

  const boundary = useMemo(
    () => parsePolygonHex(boundaryRaw),
    [boundaryRaw],
  )

  const center = useMemo<[number, number]>(
    () => boundary ? centroidFromBoundary(boundary) : [53.26, 10.35],
    [boundary],
  )

  // --- Boundary-Editor ---
  const bEditor = useBoundaryEditor()
  const isOwner = userId === district.owner_id

  // Bottom-Bar ausblenden wenn Erstellungs-Flow oder Boundary-Edit aktiv
  const creationActive = creation.stage !== 'idle' || bEditor.editMode
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

  const handleBoundaryStart = useCallback(() => {
    if (creation.stage !== 'idle') return
    bEditor.startEditing(boundary)
  }, [boundary, creation.stage, bEditor])

  const handleBoundaryFinish = useCallback(async () => {
    const points = bEditor.drawPoints
    // Leeres Polygon → boundary NULL setzen
    if (points.length === 0) {
      const supabase = createClient()
      const { error } = await supabase
        .from('districts')
        .update({ boundary: null, area_ha: null })
        .eq('id', district.id)
      if (error) {
        console.error('Boundary-Löschen fehlgeschlagen:', error.message)
      } else {
        setBoundaryRaw(null)
        showToast('Grenze entfernt')
      }
      bEditor.stopEditing()
      bEditor.reset()
      return
    }
    // Weniger als 3 Punkte → ignorieren, Edit-Mode beenden
    if (points.length < 3) {
      bEditor.stopEditing()
      bEditor.reset()
      return
    }
    // Polygon schliessen und als EWKT speichern
    const closed = [...points, points[0]]
    const wkt = closed.map(p => `${p.lng} ${p.lat}`).join(', ')
    const ewkt = `SRID=4326;POLYGON((${wkt}))`

    const supabase = createClient()
    const { error } = await supabase
      .from('districts')
      .update({ boundary: ewkt })
      .eq('id', district.id)

    if (error) {
      console.error('Boundary-Update fehlgeschlagen:', error.message)
    } else {
      // Boundary aus DB neu laden (damit Hex-Encoding korrekt ist)
      const { data } = await supabase
        .from('districts')
        .select('boundary, area_ha')
        .eq('id', district.id)
        .single()
      if (data) {
        setBoundaryRaw(data.boundary)
      }
      showToast('Grenze gespeichert')
    }
    bEditor.stopEditing()
    bEditor.reset()
  }, [bEditor, district.id, showToast])

  const handleBoundaryCancel = useCallback(() => {
    bEditor.stopEditing()
    bEditor.reset()
  }, [bEditor])

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
    // Koordinaten-Eingabe für jeden neuen Flow zurücksetzen
    setCoordOpen(false)
    setCoordLat('')
    setCoordLng('')
    setCoordError(null)
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

  // GPS-Einzelmessung → speist Position wie ein Karten-Tap in die State-Machine
  const handleUseGps = useCallback(async () => {
    if (gpsLoading) return
    setGpsLoading(true)
    try {
      // Großzügig für dichten Bestand; best-on-timeout greift ohnehin
      const fix = await waitForAccurateGpsFix(12_000, 20)
      // Wie ein Tap: awaiting-tap → positioning, Korrektur per Tap bleibt möglich
      handleMapClick([fix.lat, fix.lng])
      // Karte zum GPS-Punkt schwenken, sonst sieht der User den Pin nicht
      setCenterTarget({ lat: fix.lat, lng: fix.lng, nonce: Date.now() })
    } catch {
      showToast('Standort nicht verfügbar. Tippe stattdessen auf die Karte.')
    } finally {
      setGpsLoading(false)
    }
  }, [gpsLoading, handleMapClick, showToast])

  // Feld-Änderung mit Smart-Paste: kompletter String in EIN Feld → auf beide verteilen
  const handleCoordChange = useCallback((raw: string, field: 'lat' | 'lng') => {
    setCoordError(null)
    const parsed = parseCoordPaste(raw)
    if (parsed) {
      // Reihenfolge fix: Wert 1 = Breitengrad (lat), Wert 2 = Längengrad (lng)
      setCoordLat(parsed.lat)
      setCoordLng(parsed.lng)
      return
    }
    // Einzelner/teilweiser Wert → nur das getippte Feld setzen, anderes unangetastet
    if (field === 'lat') setCoordLat(raw)
    else setCoordLng(raw)
  }, [])

  // Eingegebene Koordinate (zwei Felder) → wie ein Karten-Tap
  const handleCoordSubmit = useCallback(() => {
    const latStr = coordLat.trim()
    const lngStr = coordLng.trim()
    const lat = Number(latStr)
    const lng = Number(lngStr)
    if (
      latStr === '' || lngStr === '' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      setCoordError('Ungültige Koordinaten')
      return
    }
    // Reihenfolge: [lat, lng]; EWKT (POINT(lng lat)) baut der bestehende Insert
    handleMapClick([lat, lng])
    setCenterTarget({ lat, lng, nonce: Date.now() })
    setCoordOpen(false)
    setCoordLat('')
    setCoordLng('')
    setCoordError(null)
  }, [coordLat, coordLng, handleMapClick])

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
    // .select() ist nötig, um echte Löschungen von RLS-gefilterten zu trennen:
    // .delete() ohne .select() liefert bei 0 betroffenen Zeilen { data: null,
    // error: null } — sonst meldet die UI fälschlich Erfolg und das Objekt ist
    // beim Reload wieder da.
    const { data, error } = await supabase
      .from('map_objects')
      .delete()
      .eq('id', creation.object.id)
      .select()

    if (error) {
      console.error('Löschen fehlgeschlagen:', error.message)
      showToast('Löschen fehlgeschlagen')
      return
    }
    if (!data || data.length === 0) {
      // Keine Zeile gelöscht (RLS) → kein optimistisches Entfernen, kein Erfolg
      showToast('Objekt konnte nicht gelöscht werden (keine Berechtigung).')
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
          paddingTop: 'var(--safe-top)',
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
          onMapClick={isInteractive && !bEditor.editMode ? handleMapClick : undefined}
          onObjectClick={creation.stage === 'idle' && !bEditor.editMode ? handleObjectClick : undefined}
          previewPin={previewPin}
          hiddenObjectId={hiddenObjectId}
          centerOn={centerTarget}
          isOwner={isOwner}
          boundaryEdit={{
            editMode: bEditor.editMode,
            drawPoints: bEditor.drawPoints,
            onStart: handleBoundaryStart,
            onFinish: handleBoundaryFinish,
            onCancel: handleBoundaryCancel,
            onDrawClick: bEditor.addPoint,
            onVertexDrag: bEditor.dragVertex,
            onVertexDelete: bEditor.deleteVertex,
            onMidpointInsert: bEditor.insertMidpoint,
            onUndo: bEditor.undo,
            onClearAll: bEditor.clearAll,
          }}
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

        {/* GPS-Standort-Button (nur awaiting-tap, sekundär zum Karten-Tap) */}
        {creation.stage === 'awaiting-tap' && (
          <button
            onClick={handleUseGps}
            disabled={gpsLoading}
            style={{
              position: 'absolute',
              top: '3.5rem',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1050,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '2rem',
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--text)',
              cursor: gpsLoading ? 'default' : 'pointer',
              opacity: gpsLoading ? 0.7 : 1,
              minHeight: '2.75rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
            }}
          >
            {gpsLoading ? (
              <>
                <CircleNotch size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Standort wird ermittelt …
              </>
            ) : (
              <>
                <Crosshair size={16} weight="bold" />
                Aktueller Standort
              </>
            )}
          </button>
        )}

        {/* Koordinaten-Eingabe (dezente dritte Option, nur awaiting-tap) */}
        {creation.stage === 'awaiting-tap' && (
          <div style={{
            position: 'absolute',
            top: '6.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1050,
            width: coordOpen ? 'min(20rem, calc(100vw - 1.5rem))' : 'auto',
            display: 'flex',
            justifyContent: 'center',
          }}>
            {!coordOpen ? (
              <button
                onClick={() => setCoordOpen(true)}
                style={{
                  background: 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(8px)',
                  border: 'none',
                  borderRadius: '1.5rem',
                  padding: '0.375rem 0.875rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-2)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Koordinaten eingeben
              </button>
            ) : (
              <div style={{
                width: '100%',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '0.75rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {/* Breitengrad (Latitude) */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                      Breitengrad
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={coordLat}
                      onChange={e => handleCoordChange(e.target.value, 'lat')}
                      onKeyDown={e => { if (e.key === 'Enter') handleCoordSubmit() }}
                      placeholder="53.1234"
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.5rem',
                        background: 'var(--bg)',
                        border: `1px solid ${coordError ? 'var(--red)' : 'var(--border)'}`,
                        borderRadius: '0.625rem',
                        color: 'var(--text)',
                        fontSize: '0.9375rem',
                      }}
                    />
                  </div>
                  {/* Längengrad (Longitude) */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                      Längengrad
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={coordLng}
                      onChange={e => handleCoordChange(e.target.value, 'lng')}
                      onKeyDown={e => { if (e.key === 'Enter') handleCoordSubmit() }}
                      placeholder="10.5678"
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.5rem',
                        background: 'var(--bg)',
                        border: `1px solid ${coordError ? 'var(--red)' : 'var(--border)'}`,
                        borderRadius: '0.625rem',
                        color: 'var(--text)',
                        fontSize: '0.9375rem',
                      }}
                    />
                  </div>
                </div>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', margin: '0.375rem 0 0' }}>
                  Aus Google Maps kopieren — ganzer String in ein Feld genügt
                </p>
                {coordError && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--red)', margin: '0.375rem 0 0' }}>
                    {coordError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                  <button
                    onClick={() => {
                      setCoordOpen(false)
                      setCoordLat('')
                      setCoordLng('')
                      setCoordError(null)
                    }}
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
                    onClick={handleCoordSubmit}
                    disabled={!coordLat.trim() && !coordLng.trim()}
                    style={{
                      flex: 1,
                      padding: '0.625rem',
                      background: (coordLat.trim() || coordLng.trim()) ? 'var(--green)' : 'var(--green-dim)',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      color: 'white',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      cursor: (coordLat.trim() || coordLng.trim()) ? 'pointer' : 'default',
                      opacity: (coordLat.trim() || coordLng.trim()) ? 1 : 0.5,
                      minHeight: '2.75rem',
                    }}
                  >
                    Setzen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FAB (nicht im Boundary-Edit-Mode) */}
        {creation.stage === 'idle' && !bEditor.editMode && (
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
              background: 'var(--accent-primary)',
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
