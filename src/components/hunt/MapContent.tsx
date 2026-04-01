'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import L from 'leaflet'
import {
  MapContainer, TileLayer, WMSTileLayer, Circle, CircleMarker,
  Marker, Tooltip, Popup, Polygon, Polyline, useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeolocationState, GeoPosition } from '@/hooks/useGeolocation'
import type { ParticipantPosition } from '@/hooks/useHuntPositions'
import { distanceInMeters, polygonAreaHectares } from '@/lib/geo-utils'
import MapObjectSheet from './MapObjectSheet'
import type { MapObjectData } from './MapObjectSheet'
import BoundarySheet from './BoundarySheet'

// Leaflet Icon Fix für Webpack/Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

// Konstanten
const BROCKWINKEL_CENTER: [number, number] = [53.24, 10.42]
const DEFAULT_ZOOM = 14
const STALE_MS = 5 * 60 * 1000
const DISTANCE_LINE_MS = 5000
const LAYER_STORAGE_KEY = 'revierapp-map-layer'

// --- Layer-Konfiguration ---

type BaseLayerKey = 'topo' | 'satellite' | 'dark'

const LAYER_META: Record<BaseLayerKey, { label: string; icon: string; color: string }> = {
  topo: { label: 'Topo', icon: '🗺️', color: '#4CAF50' },
  satellite: { label: 'Luftbild', icon: '🛰️', color: '#1B5E20' },
  dark: { label: 'Nacht', icon: '🌑', color: '#263238' },
}

function getSavedLayer(): BaseLayerKey {
  if (typeof window === 'undefined') return 'topo'
  try {
    const v = localStorage.getItem(LAYER_STORAGE_KEY)
    if (v === 'topo' || v === 'satellite' || v === 'dark') return v
  } catch { /* localStorage nicht verfügbar */ }
  return 'topo'
}

// --- Types ---

export interface StandData {
  id: string
  name: string
  type: string
  position: { lat: number; lng: number }
  description?: string | null
}

export type StandsChangedCallback = (newStand?: StandData, deletedId?: string) => void

export interface MapContentProps {
  geoState: GeolocationState
  participants: ParticipantPosition[]
  boundary?: [number, number][][] | null
  stands?: StandData[]
  participantStands?: Record<string, string>
  districtId?: string | null
  districtName?: string | null
  huntId?: string | null
  onStandsChanged?: StandsChangedCallback
  onBoundaryChanged?: () => void
}

// --- Hilfsfunktionen ---

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function formatDistance(m: number): string {
  return m < 1000 ? `~${Math.round(m)}m` : `~${(m / 1000).toFixed(1)}km`
}

function roleLabel(role: string, tags: string[]): string {
  const parts: string[] = []
  if (role === 'jagdleiter') parts.push('🎖️ Jagdleiter')
  else parts.push('🎯 Schütze')
  if (tags.includes('hundefuehrer')) parts.push('🐕')
  if (tags.includes('gruppenleiter')) parts.push('👥')
  return parts.join(' ')
}

// --- Karten-Steuerung (innerhalb MapContainer) ---

/** Initiales Positionieren: Reviergrenze > GPS > Brockwinkel */
function InitialViewSetter({ boundary, position, hasFlown }: {
  boundary?: [number, number][][] | null
  position: GeoPosition | null
  hasFlown: React.MutableRefObject<boolean>
}) {
  const map = useMap()

  // Reviergrenze hat höchste Priorität
  useEffect(() => {
    if (!boundary || boundary.length === 0) return
    const bounds = L.latLngBounds(boundary[0] as L.LatLngExpression[])
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
    hasFlown.current = true
  }, [boundary, map, hasFlown])

  // GPS-Fallback
  useEffect(() => {
    if (hasFlown.current || !position) return
    map.flyTo([position.lat, position.lng], 16, { duration: 1.2 })
    hasFlown.current = true
  }, [position, map, hasFlown])

  return null
}

/** Erkennt ob der User die Karte manuell verschoben hat */
function MapMoveTracker({ userPosition, onMoved }: {
  userPosition: GeoPosition | null
  onMoved: (moved: boolean) => void
}) {
  const map = useMap()

  useEffect(() => {
    function handleMoveEnd() {
      if (!userPosition) return
      const center = map.getCenter()
      const dist = Math.abs(center.lat - userPosition.lat) + Math.abs(center.lng - userPosition.lng)
      onMoved(dist > 0.0005)
    }
    map.on('moveend', handleMoveEnd)
    return () => { map.off('moveend', handleMoveEnd) }
  }, [map, userPosition, onMoved])

  return null
}

/** Leaflet Container-Größe nach Mount neu berechnen (Mobile-Fix) */
function MapResizer() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const timer = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(timer)
  }, [map])
  return null
}

/** Zoom-Level tracken für bedingte Stand-Labels */
function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap()

  useEffect(() => {
    onZoomChange(map.getZoom())
    function handleZoom() { onZoomChange(map.getZoom()) }
    map.on('zoomend', handleZoom)
    return () => { map.off('zoomend', handleZoom) }
  }, [map, onZoomChange])

  return null
}

// --- Long-Press Handler ---

const LONG_PRESS_MS = 500
const PAN_CANCEL_PX = 10

function MapLongPressHandler({ onLongPress }: {
  onLongPress: (latlng: { lat: number; lng: number }) => void
}) {
  const map = useMap()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const container = map.getContainer()

    function cancel() {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      startPos.current = null
    }

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) { cancel(); return }
      const touch = e.touches[0]
      startPos.current = { x: touch.clientX, y: touch.clientY }

      timerRef.current = setTimeout(() => {
        if (!startPos.current) return
        // Koordinaten aus Container-Position berechnen
        const rect = container.getBoundingClientRect()
        const point = L.point(
          startPos.current.x - rect.left,
          startPos.current.y - rect.top,
        )
        const latlng = map.containerPointToLatLng(point)
        // Vibration-Feedback
        try { navigator.vibrate?.(50) } catch { /* nicht verfügbar */ }
        onLongPress({ lat: latlng.lat, lng: latlng.lng })
        cancel()
      }, LONG_PRESS_MS)
    }

    function handleTouchMove(e: TouchEvent) {
      if (!startPos.current || !timerRef.current) return
      const touch = e.touches[0]
      const dx = Math.abs(touch.clientX - startPos.current.x)
      const dy = Math.abs(touch.clientY - startPos.current.y)
      if (dx > PAN_CANCEL_PX || dy > PAN_CANCEL_PX) cancel()
    }

    function handleTouchEnd() { cancel() }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const point = L.point(e.clientX - rect.left, e.clientY - rect.top)
      const latlng = map.containerPointToLatLng(point)
      onLongPress({ lat: latlng.lat, lng: latlng.lng })
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: true })
    container.addEventListener('touchend', handleTouchEnd)
    container.addEventListener('touchcancel', handleTouchEnd)
    container.addEventListener('contextmenu', handleContextMenu)

    return () => {
      cancel()
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchEnd)
      container.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [map, onLongPress])

  return null
}

// --- Zeichenmodus: Klick-Handler ---

function MapClickHandler({ onMapClick }: { onMapClick: (latlng: { lat: number; lng: number }) => void }) {
  const map = useMap()

  useEffect(() => {
    function handleClick(e: L.LeafletMouseEvent) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    }
    map.on('click', handleClick)
    return () => { map.off('click', handleClick) }
  }, [map, onMapClick])

  return null
}

// --- Map-Buttons (innerhalb MapContainer, absolute positioniert) ---

/** Zurück zu meiner Position */
function RecenterButton({ position }: { position: GeoPosition }) {
  const map = useMap()
  return (
    <button
      onClick={() => map.flyTo([position.lat, position.lng], 16, { duration: 0.8 })}
      className="map-btn"
      style={{ bottom: '4.25rem', right: '0.75rem' }}
      title="Zurück zu meiner Position"
    >
      📍
    </button>
  )
}

/** Alle Teilnehmer in den Kartenausschnitt einpassen */
function FitAllButton({ userPosition, participants }: {
  userPosition: GeoPosition | null
  participants: ParticipantPosition[]
}) {
  const map = useMap()

  const handleFitAll = useCallback(() => {
    const points: L.LatLngExpression[] = []
    if (userPosition) points.push([userPosition.lat, userPosition.lng])
    participants.forEach(p => points.push([p.position.lat, p.position.lng]))
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points as [number, number][]), { padding: [50, 50] })
    } else if (points.length === 1) {
      map.flyTo(points[0], 15, { duration: 0.8 })
    }
  }, [map, userPosition, participants])

  return (
    <button
      onClick={handleFitAll}
      className="map-btn"
      style={{ bottom: '0.75rem', right: '0.75rem' }}
      title="Alle Teilnehmer anzeigen"
    >
      👥
    </button>
  )
}

// --- Teilnehmer-Marker ---

function ParticipantMarker({
  participant,
  userPosition,
  onSelect,
  isSelected,
}: {
  participant: ParticipantPosition
  userPosition: GeoPosition | null
  onSelect: (id: string | null) => void
  isSelected: boolean
}) {
  const isStale = Date.now() - participant.updatedAt.getTime() > STALE_MS
  const isMoving = !participant.isLocked

  const distance = userPosition
    ? distanceInMeters(userPosition.lat, userPosition.lng, participant.position.lat, participant.position.lng)
    : null

  const icon = useMemo(() => {
    const initials = getInitials(participant.name)
    const staleClass = isStale ? ' is-stale' : ''
    const movingClass = isMoving && !isStale ? ' is-moving' : ''

    let badge = ''
    if (participant.role === 'jagdleiter') badge = '<span class="marker-badge">🎖️</span>'
    else if (participant.tags.includes('hundefuehrer')) badge = '<span class="marker-badge">🐕</span>'

    return L.divIcon({
      className: `participant-marker${staleClass}${movingClass}`,
      html: `<div class="marker-circle" style="background: ${participant.avatarColor}">
               <span class="marker-initials">${initials}</span>
               ${badge}
             </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })
  }, [participant.avatarColor, participant.name, participant.role, participant.tags, isStale, isMoving])

  return (
    <Marker
      position={[participant.position.lat, participant.position.lng]}
      icon={icon}
      eventHandlers={{
        click: () => onSelect(isSelected ? null : participant.participantId),
      }}
    >
      <Popup className="participant-popup">
        <div className="participant-popup-content">
          <strong>{participant.name}</strong>
          <span className="participant-popup-role">{roleLabel(participant.role, participant.tags)}</span>
          {distance !== null && (
            <span className="participant-popup-distance">{formatDistance(distance)}</span>
          )}
          {isStale && <span className="participant-popup-stale">⚠️ Letztes Update &gt;5 Min</span>}
        </div>
      </Popup>
    </Marker>
  )
}

// --- Hochsitz-Marker ---

function StandMarker({ stand, zoom, onEdit }: {
  stand: StandData
  zoom: number
  onEdit?: (stand: StandData) => void
}) {
  const icon = useMemo(() => {
    return L.divIcon({
      className: 'stand-marker',
      html: '<div class="stand-icon">▲</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }, [])

  const TYPE_LABELS: Record<string, string> = {
    hochsitz: '🪵 Hochsitz',
    kanzel: '🏠 Kanzel',
    drueckjagdstand: '🎯 Drückjagdstand',
    parkplatz: '🅿️ Parkplatz',
    kirrung: '🌾 Kirrung',
    salzlecke: '🧂 Salzlecke',
    wildkamera: '📷 Wildkamera',
    sonstiges: '📌 Sonstiges',
  }
  const typeLabel = TYPE_LABELS[stand.type] || stand.type

  return (
    <Marker position={[stand.position.lat, stand.position.lng]} icon={icon}>
      {zoom >= 15 && (
        <Tooltip direction="top" offset={[0, -12]} permanent className="stand-tooltip">
          {stand.name}
        </Tooltip>
      )}
      <Popup className="stand-popup">
        <div className="stand-popup-content">
          <strong>{stand.name}</strong>
          <span>{typeLabel}</span>
          {stand.description && (
            <span style={{ color: 'var(--text-2)', fontSize: '0.6875rem' }}>{stand.description}</span>
          )}
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(stand) }}
              style={{
                marginTop: '0.375rem',
                padding: '0.375rem 0.625rem',
                borderRadius: '0.5rem',
                background: 'var(--surface-3)',
                border: '1px solid var(--border)',
                color: 'var(--green-bright)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                minHeight: '2rem',
              }}
            >
              ✏️ Bearbeiten
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  )
}

// --- Layer-Switcher ---

function LayerSwitcher({
  activeLayer,
  onLayerChange,
  cadastreEnabled,
  onCadastreToggle,
  cadastreAvailable,
}: {
  activeLayer: BaseLayerKey
  onLayerChange: (layer: BaseLayerKey) => void
  cadastreEnabled: boolean
  onCadastreToggle: () => void
  cadastreAvailable: boolean
}) {
  const [open, setOpen] = useState(false)

  function selectLayer(key: BaseLayerKey) {
    onLayerChange(key)
    setOpen(false)
  }

  return (
    <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 1000 }}>
      <button className="map-btn" onClick={() => setOpen(!open)} style={{ position: 'relative' }}>
        🌐
      </button>

      {open && (
        <div className="layer-panel">
          <div className="layer-panel-section">
            <span className="layer-panel-label">Basiskarte</span>
            <div className="layer-panel-grid">
              {(Object.entries(LAYER_META) as [BaseLayerKey, { label: string; icon: string; color: string }][]).map(([key, cfg]) => (
                <button
                  key={key}
                  className={`layer-preview${key === activeLayer ? ' active' : ''}`}
                  onClick={() => selectLayer(key)}
                >
                  <div className="layer-preview-tile" style={{ background: cfg.color }}>
                    <span>{cfg.icon}</span>
                  </div>
                  <span className="layer-preview-label">{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="layer-panel-divider" />

          <div className="layer-panel-section">
            <div className="layer-panel-overlay">
              <span>🏛️ Kataster</span>
              <button
                className={`layer-toggle${cadastreEnabled ? ' on' : ''}${!cadastreAvailable ? ' disabled' : ''}`}
                onClick={cadastreAvailable ? onCadastreToggle : undefined}
                disabled={!cadastreAvailable}
              >
                <span className="layer-toggle-knob" />
              </button>
            </div>
            {!cadastreAvailable && (
              <span className="layer-panel-hint">Nicht verfügbar</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// --- GPS-Status-Badge ---

function GpsStatusBadge({ geo }: { geo: GeolocationState }) {
  let icon: string
  let label: string
  let bgColor: string
  let textColor: string

  if (geo.error) {
    icon = '❌'; label = 'GPS nicht verfügbar'
    bgColor = 'rgba(239, 83, 80, 0.15)'; textColor = 'var(--red)'
  } else if (geo.mode === 'searching') {
    icon = '🔍'
    label = geo.accuracy ? `GPS sucht... (${Math.round(geo.accuracy)}m)` : 'GPS sucht...'
    bgColor = 'rgba(255, 255, 255, 0.1)'; textColor = 'var(--text-2)'
  } else if (geo.mode === 'locked') {
    icon = '📍'; label = 'Position fixiert'
    bgColor = 'rgba(107, 159, 58, 0.15)'; textColor = 'var(--green-bright)'
  } else {
    icon = '🚶'; label = 'Unterwegs'
    bgColor = 'rgba(255, 143, 0, 0.15)'; textColor = 'var(--orange)'
  }

  return (
    <div style={{
      position: 'absolute',
      top: '0.75rem',
      left: '0.75rem',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      background: bgColor,
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '0.375rem 0.75rem',
      fontSize: '0.75rem',
      fontWeight: 600,
      color: textColor,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {geo.mode === 'searching' && !geo.error && <span className="gps-spinner" />}
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  )
}

// --- WMS Lade-Indikator ---

function WmsLoadingIndicator() {
  return (
    <div style={{
      position: 'absolute',
      top: '3.5rem',
      left: '0.75rem',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      borderRadius: 'var(--radius)',
      padding: '0.25rem 0.625rem',
      fontSize: '0.6875rem',
      color: 'var(--text-2)',
    }}>
      <span className="gps-spinner" />
      Lade Kartendaten...
    </div>
  )
}

// ============================================================
// Hauptkomponente
// ============================================================

export default function MapContent({
  geoState,
  participants,
  boundary,
  stands,
  participantStands,
  districtId,
  districtName,
  huntId,
  onStandsChanged,
  onBoundaryChanged,
}: MapContentProps) {
  const hasFlown = useRef(false)
  const [mapMoved, setMapMoved] = useState(false)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [activeLayer, setActiveLayer] = useState<BaseLayerKey>(getSavedLayer)
  const [cadastreEnabled, setCadastreEnabled] = useState(false)
  const [cadastreAvailable, setCadastreAvailable] = useState(true)
  const [wmsLoading, setWmsLoading] = useState(false)
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null)
  const distanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Long-Press / Hochsitz-Erstellung
  const [tempMarker, setTempMarker] = useState<{ lat: number; lng: number } | null>(null)
  const [sheetMode, setSheetMode] = useState<'create' | 'edit' | 'hidden'>('hidden')
  const [editStand, setEditStand] = useState<MapObjectData | null>(null)

  // Zeichenmodus für Reviergrenze
  const [drawingMode, setDrawingMode] = useState(false)
  const [drawPoints, setDrawPoints] = useState<{ lat: number; lng: number }[]>([])
  const [boundarySheetMode, setBoundarySheetMode] = useState<'save' | 'hidden'>('hidden')

  const handleMapMoved = useCallback((moved: boolean) => setMapMoved(moved), [])
  const handleZoomChange = useCallback((z: number) => setZoom(z), [])

  // Layer-Auswahl in localStorage speichern
  const handleLayerChange = useCallback((layer: BaseLayerKey) => {
    setActiveLayer(layer)
    try { localStorage.setItem(LAYER_STORAGE_KEY, layer) } catch { /* ignore */ }
  }, [])

  const handleCadastreToggle = useCallback(() => {
    setCadastreEnabled(prev => !prev)
  }, [])

  // Long-Press → Temporären Marker setzen + Sheet öffnen (nur wenn NICHT im Zeichenmodus)
  const handleLongPress = useCallback((latlng: { lat: number; lng: number }) => {
    if (drawingMode) return
    setTempMarker(latlng)
    setEditStand(null)
    setSheetMode('create')
  }, [drawingMode])

  // Stand bearbeiten
  const handleEditStand = useCallback((stand: StandData) => {
    setEditStand({
      id: stand.id,
      name: stand.name,
      type: stand.type,
      position: stand.position,
      description: stand.description ?? null,
    })
    setTempMarker(null)
    setSheetMode('edit')
  }, [])

  // Sheet schliessen
  const handleSheetClose = useCallback(() => {
    setSheetMode('hidden')
    setTempMarker(null)
    setEditStand(null)
  }, [])

  // --- Zeichenmodus Callbacks ---

  const startDrawing = useCallback(() => {
    // Bestehendes Polygon zum Bearbeiten laden
    if (boundary && boundary.length > 0) {
      const ring = boundary[0]
      // Letzter Punkt = erster Punkt (geschlossen) → weglassen
      const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring
      setDrawPoints(pts.map(p => ({ lat: p[0], lng: p[1] })))
    } else {
      setDrawPoints([])
    }
    setDrawingMode(true)
  }, [boundary])

  const cancelDrawing = useCallback(() => {
    setDrawingMode(false)
    setDrawPoints([])
    setBoundarySheetMode('hidden')
  }, [])

  const handleDrawClick = useCallback((latlng: { lat: number; lng: number }) => {
    if (!drawingMode) return
    setDrawPoints(prev => [...prev, latlng])
  }, [drawingMode])

  const handleDrawUndo = useCallback(() => {
    setDrawPoints(prev => prev.slice(0, -1))
  }, [])

  const handleDrawClear = useCallback(() => {
    setDrawPoints([])
  }, [])

  const handleDrawFinish = useCallback(() => {
    if (drawPoints.length < 3) return
    setBoundarySheetMode('save')
  }, [drawPoints.length])

  const handleDrawVertexDrag = useCallback((index: number, latlng: { lat: number; lng: number }) => {
    setDrawPoints(prev => {
      const next = [...prev]
      next[index] = latlng
      return next
    })
  }, [])

  const handleDrawVertexDelete = useCallback((index: number) => {
    setDrawPoints(prev => {
      if (prev.length <= 3) return prev
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleInsertMidpoint = useCallback((afterIndex: number, latlng: { lat: number; lng: number }) => {
    setDrawPoints(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, latlng)
      return next
    })
  }, [])

  const handleBoundarySaved = useCallback(() => {
    setBoundarySheetMode('hidden')
    setDrawingMode(false)
    setDrawPoints([])
    onBoundaryChanged?.()
  }, [onBoundaryChanged])

  const handleBoundaryDeleted = useCallback(() => {
    setBoundarySheetMode('hidden')
    setDrawingMode(false)
    setDrawPoints([])
    onBoundaryChanged?.()
  }, [onBoundaryChanged])

  const handleBoundarySheetClose = useCallback(() => {
    setBoundarySheetMode('hidden')
  }, [])

  // Vertex-Icons für Zeichenmodus
  const vertexIcon = useMemo(() => L.divIcon({
    className: 'draw-vertex',
    html: '<div class="draw-vertex-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  }), [])

  const firstVertexIcon = useMemo(() => L.divIcon({
    className: 'draw-vertex',
    html: '<div class="draw-vertex-dot first"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  }), [])

  const midpointIcon = useMemo(() => L.divIcon({
    className: 'draw-midpoint',
    html: '<div class="draw-midpoint-dot"></div>',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  }), [])

  // Nach Speichern → Stand optimistisch anzeigen + Background-Refetch
  const handleObjectSaved = useCallback((obj: MapObjectData) => {
    setSheetMode('hidden')
    setTempMarker(null)
    setEditStand(null)
    const stand: StandData = {
      id: obj.id,
      name: obj.name,
      type: obj.type,
      position: obj.position,
      description: obj.description ?? null,
    }
    onStandsChanged?.(stand)
  }, [onStandsChanged])

  // Nach Löschen → Stand optimistisch entfernen + Background-Refetch
  const handleObjectDeleted = useCallback((deletedId: string) => {
    setSheetMode('hidden')
    setTempMarker(null)
    setEditStand(null)
    onStandsChanged?.(undefined, deletedId)
  }, [onStandsChanged])

  // Temp-Marker Icon (pulsierend)
  const tempMarkerIcon = useMemo(() => {
    return L.divIcon({
      className: 'temp-marker',
      html: '<div class="temp-marker-dot"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }, [])

  // Teilnehmer-Auswahl → Entfernungslinie mit 5s Timer
  const handleParticipantSelect = useCallback((id: string | null) => {
    if (distanceTimer.current) clearTimeout(distanceTimer.current)
    setSelectedParticipant(id)
    if (id) {
      distanceTimer.current = setTimeout(() => setSelectedParticipant(null), DISTANCE_LINE_MS)
    }
  }, [])

  useEffect(() => {
    return () => { if (distanceTimer.current) clearTimeout(distanceTimer.current) }
  }, [])

  // Leaflet braucht nach dynamischem Mount ein resize-Event
  useEffect(() => {
    window.dispatchEvent(new Event('resize'))
  }, [])

  // Stände nach ID mappen für Zuweisungs-Linien
  const standsById = useMemo(() => {
    const map = new Map<string, StandData>()
    stands?.forEach(s => map.set(s.id, s))
    return map
  }, [stands])

  // Entfernungslinie zwischen mir und ausgewähltem Teilnehmer
  const selectedP = selectedParticipant
    ? participants.find(p => p.participantId === selectedParticipant)
    : null
  const distanceLine = geoState.position && selectedP
    ? [
        [geoState.position.lat, geoState.position.lng] as [number, number],
        [selectedP.position.lat, selectedP.position.lng] as [number, number],
      ]
    : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* GPS Status-Badge (oben links) */}
      <GpsStatusBadge geo={geoState} />

      {/* Layer-Switcher (oben rechts) */}
      <LayerSwitcher
        activeLayer={activeLayer}
        onLayerChange={handleLayerChange}
        cadastreEnabled={cadastreEnabled}
        onCadastreToggle={handleCadastreToggle}
        cadastreAvailable={cadastreAvailable}
      />

      {/* Grenze zeichnen / bearbeiten Button */}
      {!drawingMode && (
        <button className="draw-boundary-btn" onClick={startDrawing}>
          ✏️ {boundary && boundary.length > 0 ? 'Grenze bearbeiten' : 'Grenze zeichnen'}
        </button>
      )}
      {drawingMode && (
        <button className="draw-boundary-btn active" onClick={cancelDrawing}>
          ✏️ Zeichenmodus
        </button>
      )}

      {/* Hinweis im Zeichenmodus */}
      {drawingMode && drawPoints.length === 0 && (
        <div className="draw-hint">Tippe Punkte auf die Karte</div>
      )}

      {/* Zeichen-Toolbar */}
      {drawingMode && boundarySheetMode === 'hidden' && (
        <div className="draw-toolbar">
          <button
            className="draw-toolbar-btn cancel-btn"
            onClick={cancelDrawing}
          >
            Abbrechen
          </button>
          <button
            className="draw-toolbar-btn"
            onClick={handleDrawUndo}
            disabled={drawPoints.length === 0}
          >
            ↩ Rückgängig
          </button>
          <button
            className="draw-toolbar-btn danger"
            onClick={handleDrawClear}
            disabled={drawPoints.length === 0}
          >
            Alles löschen
          </button>
          <button
            className="draw-toolbar-btn primary"
            onClick={handleDrawFinish}
            disabled={drawPoints.length < 3}
          >
            Fertig
          </button>
        </div>
      )}

      {/* WMS Lade-Anzeige */}
      {wmsLoading && <WmsLoadingIndicator />}

      <MapContainer
        center={BROCKWINKEL_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={true}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={true}
      >
        {/* === Base-Layer (nur einer aktiv) === */}
        {activeLayer === 'topo' && (
          <TileLayer
            url="https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png"
            attribution='&copy; <a href="https://www.bkg.bund.de">BKG</a> (2025) <a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a>'
            maxZoom={18}
          />
        )}
        {activeLayer === 'satellite' && (
          <WMSTileLayer
            url="https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms"
            params={{ layers: 'ni_dop20', format: 'image/jpeg' }}
            maxZoom={19}
            attribution='&copy; <a href="https://www.lgln.niedersachsen.de">LGLN</a> (2025) CC BY 4.0'
            eventHandlers={{
              loading: () => setWmsLoading(true),
              load: () => setWmsLoading(false),
              tileerror: () => setWmsLoading(false),
            }}
          />
        )}
        {activeLayer === 'dark' && (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
            maxZoom={20}
          />
        )}

        {/* === Kataster-Overlay === */}
        {cadastreEnabled && (
          <WMSTileLayer
            url="https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wms"
            params={{ layers: 'ALKIS', format: 'image/png', transparent: true }}
            maxZoom={19}
            opacity={0.7}
            attribution="&copy; LGLN dl-de/zero-2-0"
            eventHandlers={{
              tileerror: () => {
                setCadastreAvailable(false)
                setCadastreEnabled(false)
              },
            }}
          />
        )}

        {/* === Long-Press Handler (nur aktiv wenn NICHT im Zeichenmodus) === */}
        {!drawingMode && <MapLongPressHandler onLongPress={handleLongPress} />}

        {/* === Zeichenmodus: Klick-Handler === */}
        {drawingMode && <MapClickHandler onMapClick={handleDrawClick} />}

        {/* === Karten-Steuerung === */}
        <MapResizer />
        <InitialViewSetter boundary={boundary} position={geoState.position} hasFlown={hasFlown} />
        <MapMoveTracker userPosition={geoState.position} onMoved={handleMapMoved} />
        <ZoomTracker onZoomChange={handleZoomChange} />

        {/* === Reviergrenze (nur anzeigen wenn NICHT im Zeichenmodus) === */}
        {!drawingMode && boundary && boundary.length > 0 && (
          <Polygon
            positions={boundary}
            pathOptions={{
              color: 'hsl(142, 70%, 45%)',
              weight: 2,
              dashArray: '8 4',
              fillColor: 'hsl(142, 70%, 45%)',
              fillOpacity: 0.06,
            }}
          />
        )}

        {/* === Zeichenmodus Visualisierung === */}
        {drawingMode && drawPoints.length > 0 && (
          <>
            {/* Polygon-Füllung ab 3 Punkten */}
            {drawPoints.length >= 3 && (
              <Polygon
                positions={drawPoints.map(p => [p.lat, p.lng] as [number, number])}
                pathOptions={{
                  color: 'hsl(142, 70%, 45%)',
                  weight: 2,
                  fillColor: 'hsl(142, 70%, 45%)',
                  fillOpacity: 0.1,
                  dashArray: drawPoints.length >= 3 ? undefined : '6 4',
                }}
              />
            )}

            {/* Verbindungslinien zwischen Punkten */}
            {drawPoints.length >= 2 && (
              <Polyline
                positions={drawPoints.map(p => [p.lat, p.lng] as [number, number])}
                pathOptions={{
                  color: 'hsl(142, 70%, 45%)',
                  weight: 2.5,
                }}
              />
            )}

            {/* Schliessende gestrichelte Linie (erster ↔ letzter Punkt) ab 3 Punkte */}
            {drawPoints.length >= 3 && (
              <Polyline
                positions={[
                  [drawPoints[drawPoints.length - 1].lat, drawPoints[drawPoints.length - 1].lng],
                  [drawPoints[0].lat, drawPoints[0].lng],
                ]}
                pathOptions={{
                  color: 'hsl(142, 70%, 45%)',
                  weight: 2,
                  dashArray: '6 4',
                  opacity: 0.6,
                }}
              />
            )}

            {/* Vertex-Punkte (draggable) */}
            {drawPoints.map((p, i) => (
              <Marker
                key={`vertex-${i}`}
                position={[p.lat, p.lng]}
                icon={i === 0 ? firstVertexIcon : vertexIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const ll = e.target.getLatLng()
                    handleDrawVertexDrag(i, { lat: ll.lat, lng: ll.lng })
                  },
                  click: (e) => {
                    L.DomEvent.stopPropagation(e)
                    if (drawPoints.length > 3) {
                      handleDrawVertexDelete(i)
                    }
                  },
                }}
              />
            ))}

            {/* Midpoints (Punkte einfügen) — nur im Bearbeitungsmodus ab 3 Punkte */}
            {drawPoints.length >= 3 && drawPoints.map((p, i) => {
              const next = drawPoints[(i + 1) % drawPoints.length]
              const midLat = (p.lat + next.lat) / 2
              const midLng = (p.lng + next.lng) / 2
              return (
                <Marker
                  key={`mid-${i}`}
                  position={[midLat, midLng]}
                  icon={midpointIcon}
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e)
                      handleInsertMidpoint(i, { lat: midLat, lng: midLng })
                    },
                  }}
                />
              )
            })}
          </>
        )}

        {/* === Hochsitze === */}
        {stands?.map(stand => (
          <StandMarker key={stand.id} stand={stand} zoom={zoom} onEdit={handleEditStand} />
        ))}

        {/* === Temporärer Marker (Long-Press Platzierung) === */}
        {tempMarker && (
          <Marker
            position={[tempMarker.lat, tempMarker.lng]}
            icon={tempMarkerIcon}
          />
        )}

        {/* === Genauigkeitskreis === */}
        {geoState.position && geoState.accuracy && (
          <Circle
            center={[geoState.position.lat, geoState.position.lng]}
            radius={geoState.accuracy}
            pathOptions={{
              color: 'rgba(66, 165, 245, 0.3)',
              fillColor: 'rgba(66, 165, 245, 0.08)',
              fillOpacity: 1,
              weight: 1,
            }}
          />
        )}

        {/* === User-Position: pulsierender blauer Punkt === */}
        {geoState.position && (
          <>
            <CircleMarker
              center={[geoState.position.lat, geoState.position.lng]}
              radius={12}
              pathOptions={{
                color: 'rgba(66, 165, 245, 0.4)',
                fillColor: 'rgba(66, 165, 245, 0.15)',
                fillOpacity: 1,
                weight: 2,
              }}
              className="gps-pulse"
            />
            <CircleMarker
              center={[geoState.position.lat, geoState.position.lng]}
              radius={6}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#42A5F5',
                fillOpacity: 1,
                weight: 2,
              }}
            />
          </>
        )}

        {/* === Teilnehmer-Marker === */}
        {participants.map(p => (
          <ParticipantMarker
            key={p.participantId}
            participant={p}
            userPosition={geoState.position}
            onSelect={handleParticipantSelect}
            isSelected={selectedParticipant === p.participantId}
          />
        ))}

        {/* === Entfernungslinie zum ausgewählten Teilnehmer === */}
        {distanceLine && (
          <Polyline
            positions={distanceLine}
            pathOptions={{
              color: 'rgba(240, 240, 232, 0.5)',
              weight: 1.5,
              dashArray: '6 4',
            }}
          />
        )}

        {/* === Stand-Zuweisungs-Linien === */}
        {participants.map(p => {
          const standId = participantStands?.[p.participantId]
          const stand = standId ? standsById.get(standId) : null
          if (!stand) return null
          return (
            <Polyline
              key={`assign-${p.participantId}`}
              positions={[
                [p.position.lat, p.position.lng],
                [stand.position.lat, stand.position.lng],
              ]}
              pathOptions={{
                color: p.avatarColor,
                weight: 1,
                dashArray: '4 6',
                opacity: 0.4,
              }}
            />
          )
        })}

        {/* === Navigations-Buttons === */}
        {geoState.position && mapMoved && (
          <RecenterButton position={geoState.position} />
        )}
        {participants.length > 0 && (
          <FitAllButton userPosition={geoState.position} participants={participants} />
        )}
      </MapContainer>

      {/* === Hochsitz Bottom Sheet === */}
      <MapObjectSheet
        mode={sheetMode}
        position={tempMarker}
        editData={editStand}
        districtId={districtId ?? null}
        gpsPosition={geoState.position}
        onSave={handleObjectSaved}
        onDelete={handleObjectDeleted}
        onClose={handleSheetClose}
      />

      {/* === Reviergrenze Bottom Sheet === */}
      <BoundarySheet
        mode={boundarySheetMode}
        points={drawPoints}
        existingDistrict={districtId && districtName ? { id: districtId, name: districtName } : null}
        huntId={huntId}
        onSave={handleBoundarySaved}
        onDelete={handleBoundaryDeleted}
        onClose={handleBoundarySheetClose}
      />
    </div>
  )
}
