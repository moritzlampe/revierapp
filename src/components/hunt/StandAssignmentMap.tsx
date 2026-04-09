'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import L from 'leaflet'
import {
  MapContainer, TileLayer, WMSTileLayer, Marker, Tooltip,
  Polygon, useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import OwnPositionMarker from './OwnPositionMarker'

// Leaflet Icon Fix
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

// --- Konstanten ---
const BROCKWINKEL_CENTER: [number, number] = [53.24, 10.42]
const DEFAULT_ZOOM = 14
const LAYER_STORAGE_KEY = 'revierapp-map-layer'

type BaseLayerKey = 'topo' | 'satellite' | 'dark'

function getSavedLayer(): BaseLayerKey {
  if (typeof window === 'undefined') return 'topo'
  try {
    const v = localStorage.getItem(LAYER_STORAGE_KEY)
    if (v === 'topo' || v === 'satellite' || v === 'dark') return v
  } catch { /* ignore */ }
  return 'topo'
}

// --- Types ---

export interface AssignStand {
  id: string
  name: string
  type: string // 'hochsitz' | 'kanzel' | 'drueckjagdstand' | 'adhoc'
  position: { lat: number; lng: number }
  assignedUserId?: string | null
}

export interface AssignParticipant {
  userId: string
  userName: string
  avatarColor: string
}

export interface FreePosition {
  userId: string
  position: { lat: number; lng: number }
}

export interface StandAssignmentMapProps {
  /** Bestehende Hochsitze aus dem Revier (vorgeladen) */
  revierStands: AssignStand[]
  /** Ad-hoc Stände dieser Jagd */
  adhocStands: AssignStand[]
  /** Alle Teilnehmer */
  participants: AssignParticipant[]
  /** Freie Positionen (Modus 2) */
  freePositions: FreePosition[]
  /** Reviergrenze */
  boundary?: [number, number][][] | null
  /** Aktueller Modus */
  mode: 'stands' | 'free'
  /** Aktiver (ausgewaehlter) Teilnehmer */
  activeParticipantId: string | null
  /** GPS-Position des Users */
  userPosition?: { lat: number; lng: number } | null
  /** GPS-Genauigkeit in Metern */
  userAccuracy?: number | null
  /** Callbacks */
  onStandCreated: (position: { lat: number; lng: number }) => void
  onStandTapped: (standId: string) => void
  onStandAssign: (standId: string, userId: string) => void
  onFreePositionSet: (userId: string, position: { lat: number; lng: number }) => void
  onStandMoved?: (standId: string, position: { lat: number; lng: number }, standType: string) => void
  onMapReady?: () => void
  /** ID des Stands der gerade verschoben wird (vom Parent gesteuert) */
  movingStandId?: string | null
  /** Callback wenn Move-Mode beendet wird */
  onMovingDone?: () => void
}

// --- Hilfsfunktionen ---
function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

// --- Map-Steuerung ---
function InitialViewSetter({ boundary, userPosition, hasFlown }: {
  boundary?: [number, number][][] | null
  userPosition?: { lat: number; lng: number } | null
  hasFlown: React.MutableRefObject<boolean>
}) {
  const map = useMap()

  useEffect(() => {
    if (hasFlown.current) return
    if (boundary && boundary.length > 0) {
      const bounds = L.latLngBounds(boundary[0] as L.LatLngExpression[])
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
      hasFlown.current = true
    } else if (userPosition) {
      map.flyTo([userPosition.lat, userPosition.lng], 15, { duration: 0.8 })
      hasFlown.current = true
    }
  }, [boundary, userPosition, map, hasFlown])

  return null
}

function MapResizer() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const timer = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(timer)
  }, [map])
  return null
}

// Klick-Handler
function MapClickHandler({ onMapClick }: {
  onMapClick: (latlng: { lat: number; lng: number }) => void
}) {
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

// --- Stand-Marker (Hochsitz/Kanzel/Drückjagdstand) ---
function AssignStandMarker({ stand, participants, highlight, isMoving, movingActive, onTap, onDragEnd }: {
  stand: AssignStand
  participants: AssignParticipant[]
  highlight: boolean
  isMoving: boolean
  movingActive: boolean
  onTap: () => void
  onDragEnd: (standId: string, position: { lat: number; lng: number }) => void
}) {
  const assigned = stand.assignedUserId
    ? participants.find(p => p.userId === stand.assignedUserId)
    : null

  const showBadge = !assigned && !isMoving
  const wiggleClass = isMoving ? ' seat-wiggle' : ''

  const icon = useMemo(() => {
    const hl = highlight ? ' highlight' : ''
    const hp = assigned ? ' has-person' : ''
    const badge = showBadge ? '<div class="seat-plus-badge">+</div>' : ''
    return L.divIcon({
      className: '',
      html: `<div class="assign-stand-wrapper"><div class="assign-stand-marker${hl}${hp}${wiggleClass}">▲</div>${badge}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })
  }, [highlight, assigned, showBadge, wiggleClass])

  const labelHtml = assigned
    ? `${stand.name}<span class="person-name">${assigned.userName}</span>`
    : stand.name

  return (
    <Marker
      position={[stand.position.lat, stand.position.lng]}
      icon={icon}
      draggable={isMoving}
      eventHandlers={{
        click: (movingActive && !isMoving) ? undefined : (!isMoving ? onTap : undefined),
        dragend: (e) => {
          const ll = e.target.getLatLng()
          onDragEnd(stand.id, { lat: ll.lat, lng: ll.lng })
        },
      }}
    >
      <Tooltip
        direction="bottom"
        offset={[0, 12]}
        permanent
        className="assign-stand-label"
      >
        <span dangerouslySetInnerHTML={{ __html: labelHtml }} />
      </Tooltip>
    </Marker>
  )
}

// --- Freie Position Marker (Avatar auf der Karte) ---
function FreePositionMarker({ userId, position, participants }: {
  userId: string
  position: { lat: number; lng: number }
  participants: AssignParticipant[]
}) {
  const p = participants.find(pp => pp.userId === userId)
  if (!p) return null

  const icon = useMemo(() => {
    const initials = getInitials(p.userName)
    return L.divIcon({
      className: '',
      html: `<div class="assign-free-marker" style="background: ${p.avatarColor}">${initials}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    })
  }, [p.avatarColor, p.userName])

  return (
    <Marker position={[position.lat, position.lng]} icon={icon}>
      <Tooltip direction="bottom" offset={[0, 14]} permanent className="assign-stand-label">
        {p.userName}
      </Tooltip>
    </Marker>
  )
}

// --- Hauptkomponente ---

export default function StandAssignmentMap({
  revierStands,
  adhocStands,
  participants,
  freePositions,
  boundary,
  mode,
  activeParticipantId,
  userPosition,
  userAccuracy,
  onStandCreated,
  onStandTapped,
  onStandAssign,
  onFreePositionSet,
  onStandMoved,
  onMapReady,
  movingStandId,
  onMovingDone,
}: StandAssignmentMapProps) {
  const hasFlown = useRef(false)
  const [activeLayer] = useState<BaseLayerKey>(getSavedLayer)

  const allStands = useMemo(() => [...revierStands, ...adhocStands], [revierStands, adhocStands])
  const isMovingActive = !!movingStandId

  // Karten-Klick
  const handleMapClick = useCallback((latlng: { lat: number; lng: number }) => {
    // Im Move-Mode: Klick auf Karte ignorieren
    if (isMovingActive) return
    if (mode === 'stands') {
      onStandCreated(latlng)
    } else {
      if (activeParticipantId) {
        onFreePositionSet(activeParticipantId, latlng)
      }
    }
  }, [isMovingActive, mode, activeParticipantId, onStandCreated, onFreePositionSet])

  // Stand getappt
  const handleStandTap = useCallback((standId: string) => {
    if (activeParticipantId) {
      onStandAssign(standId, activeParticipantId)
    } else {
      onStandTapped(standId)
    }
  }, [activeParticipantId, onStandAssign, onStandTapped])

  // Drag-End: Nur lokalen State updaten (DB-Persistierung passiert beim Jagd-Erstellen)
  const handleDragEnd = useCallback((standId: string, position: { lat: number; lng: number }) => {
    const stand = allStands.find(s => s.id === standId)
    onStandMoved?.(standId, position, stand?.type || 'hochsitz')
  }, [allStands, onStandMoved])

  // Map Ready
  useEffect(() => {
    onMapReady?.()
  }, [onMapReady])

  const hintText = mode === 'stands'
    ? (activeParticipantId ? 'Tippe auf einen Stand zum Zuweisen' : 'Tippe auf die Karte = neuer Stand')
    : (activeParticipantId ? 'Tippe auf die Karte zum Platzieren' : 'Waehle einen Teilnehmer oben')

  return (
    <>
      <MapContainer
        center={BROCKWINKEL_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={false}
        scrollWheelZoom={true}
      >
        {/* Base-Layer */}
        {activeLayer === 'topo' && (
          <TileLayer
            url="https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png"
            maxZoom={18}
          />
        )}
        {activeLayer === 'satellite' && (
          <WMSTileLayer
            url="https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms"
            params={{ layers: 'ni_dop20', format: 'image/jpeg' }}
            maxZoom={19}
          />
        )}
        {activeLayer === 'dark' && (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            maxZoom={20}
          />
        )}

        <MapResizer />
        <InitialViewSetter boundary={boundary} userPosition={userPosition} hasFlown={hasFlown} />
        <MapClickHandler onMapClick={handleMapClick} />

        {/* Reviergrenze */}
        {boundary && boundary.length > 0 && (
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

        {/* Eigene Position */}
        {userPosition && (
          <OwnPositionMarker
            position={userPosition}
            accuracy={userAccuracy ?? null}
          />
        )}

        {/* Hochsitz-Marker */}
        {allStands.map(stand => (
          <AssignStandMarker
            key={stand.id}
            stand={stand}
            participants={participants}
            highlight={!isMovingActive && !!activeParticipantId && !stand.assignedUserId}
            isMoving={movingStandId === stand.id}
            movingActive={isMovingActive}
            onTap={() => handleStandTap(stand.id)}
            onDragEnd={handleDragEnd}
          />
        ))}

        {/* Freie Positionen */}
        {freePositions.map(fp => (
          <FreePositionMarker
            key={fp.userId}
            userId={fp.userId}
            position={fp.position}
            participants={participants}
          />
        ))}
      </MapContainer>

      {/* Fertig-Button im Move-Mode */}
      {isMovingActive && (
        <button className="seat-edit-done-btn" onClick={() => onMovingDone?.()}>
          Fertig
        </button>
      )}

      {/* Hinweis-Overlay */}
      {!isMovingActive && <div className="assign-map-hint">{hintText}</div>}
    </>
  )
}
