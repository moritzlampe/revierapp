'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import L from 'leaflet'
import {
  MapContainer, TileLayer, WMSTileLayer,
  Marker, Tooltip, Popup, Polygon, Polyline, useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeolocationState, GeoPosition } from '@/hooks/useGeolocation'
import { useInvalidateOnResize } from '@/hooks/useInvalidateOnResize'
import type { ParticipantPosition } from '@/hooks/useHuntPositions'
import { distanceInMeters, polygonAreaHectares } from '@/lib/geo-utils'
import { createClient } from '@/lib/supabase/client'
import MapObjectSheet from './MapObjectSheet'
import type { MapObjectData } from './MapObjectSheet'
import BoundarySheet from './BoundarySheet'
import StandDetailSheet from './StandDetailSheet'
import type { HuntParticipantInfo, SeatAssignmentData } from './MapView'
import OwnPositionMarker, { type OwnPositionMarkerHandle } from './OwnPositionMarker'
import GpsStatusBadge from './GpsStatusBadge'
import CompassToggleButton from '@/components/map/CompassToggleButton'
import { useCompassHeading, getCompassEnabled, setCompassEnabled } from '@/hooks/useCompassHeading'
import { buildPinSvg, getPinVariant, isAssignableStand, type PinSize } from '@/lib/markers/pin-svg'
import { buildInitials, formatDistanceLabel } from '@/lib/markers/marker-labels'
import { WildartPicker } from '@/components/erlegung/WildartPicker'
import { getAvatarColor } from '@/lib/avatar-color'
import { Star, Crosshair, UsersThree, Dog } from '@phosphor-icons/react'

// Inline-SVG-Markup fuer Leaflet-divIcon HTML (React-Komponenten koennen
// dort nicht gerendert werden). Pfade aus Phosphor 2.1 (Star fill, Dog regular).
const MARKER_STAR_SVG = '<svg width="12" height="12" viewBox="0 0 256 256" fill="var(--accent-gold)" aria-hidden="true"><path d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"/></svg>'
const MARKER_DOG_SVG = '<svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M239.71,125l-16.42-88a16,16,0,0,0-19.61-12.58l-.31.09L150.85,40h-45.7L52.63,24.56l-.31-.09A16,16,0,0,0,32.71,37.05L16.29,125a15.77,15.77,0,0,0,9.12,17.52A16.26,16.26,0,0,0,32.12,144,15.48,15.48,0,0,0,40,141.84V184a40,40,0,0,0,40,40h96a40,40,0,0,0,40-40V141.85a15.5,15.5,0,0,0,7.87,2.16,16.31,16.31,0,0,0,6.72-1.47A15.77,15.77,0,0,0,239.71,125ZM32,128h0L48.43,40,90.5,52.37Zm144,80H136V195.31l13.66-13.65a8,8,0,0,0-11.32-11.32L128,180.69l-10.34-10.35a8,8,0,0,0-11.32,11.32L120,195.31V208H80a24,24,0,0,1-24-24V123.11L107.92,56h40.15L200,123.11V184A24,24,0,0,1,176,208Zm48-80L165.5,52.37,207.57,40,224,128ZM104,140a12,12,0,1,1-12-12A12,12,0,0,1,104,140Zm72,0a12,12,0,1,1-12-12A12,12,0,0,1,176,140Z"/></svg>'

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
  adhoc_subtype?: 'leiter' | 'hochsitz' | 'sitzstock' | null
}

export type StandsChangedCallback = (newStand?: StandData, deletedId?: string) => void

export interface FreePositionData {
  userId: string
  position: { lat: number; lng: number }
  userName: string
  avatarColor: string
}

export interface MapContentProps {
  isVisible: boolean
  geoState: GeolocationState
  participants: ParticipantPosition[]
  boundary?: [number, number][][] | null
  stands?: StandData[]
  participantStands?: Record<string, string>
  freePositions?: FreePositionData[]
  standAssignedNames?: Record<string, string>
  districtId?: string | null
  districtName?: string | null
  huntId?: string | null
  huntParticipants?: HuntParticipantInfo[]
  seatAssignments?: SeatAssignmentData[]
  isJagdleiter?: boolean
  isGruppenleiter?: boolean
  currentUserId?: string | null
  onStandsChanged?: StandsChangedCallback
  onBoundaryChanged?: () => void
  onSeatAssignmentsChanged?: (assignments: SeatAssignmentData[]) => void
}

// --- Hilfsfunktionen ---

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function formatDistance(m: number): string {
  return m < 1000 ? `~${Math.round(m)}m` : `~${(m / 1000).toFixed(1)}km`
}

function RoleLabel({ role, tags }: { role: string; tags: string[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
      {role === 'jagdleiter' ? (
        <>
          <Star size={12} weight="fill" color="var(--accent-gold)" />
          <span>Jagdleiter</span>
        </>
      ) : (
        <>
          <Crosshair size={12} />
          <span>Schütze</span>
        </>
      )}
      {tags.includes('hundefuehrer') && <Dog size={12} color="var(--text-secondary)" />}
      {tags.includes('gruppenleiter') && <UsersThree size={12} color="var(--text-secondary)" />}
    </span>
  )
}

// --- Karten-Steuerung (innerhalb MapContainer) ---

/** Initiales Positionieren: Reviergrenze > GPS > Brockwinkel */
function InitialViewSetter({ isVisible, boundary, position, hasFlown }: {
  isVisible: boolean
  boundary?: [number, number][][] | null
  position: GeoPosition | null
  hasFlown: React.MutableRefObject<boolean>
}) {
  const map = useMap()

  // Reviergrenze hat höchste Priorität
  useEffect(() => {
    // Sichtbarkeits-Guard zuerst: bei display:none ist getSize()=(0,0)
    // und Leaflets internes fitBounds-Padding produziert NaN-Koordinaten.
    if (!isVisible) return
    if (!boundary || boundary.length === 0) return
    const ring = boundary[0]
    if (!ring || ring.length === 0) return
    if (!ring.every(([lat, lng]) => isFinite(lat) && isFinite(lng))) return
    if (hasFlown.current) return
    const bounds = L.latLngBounds(ring as L.LatLngExpression[])
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
    hasFlown.current = true
  }, [isVisible, boundary, map, hasFlown])

  // GPS-Fallback
  useEffect(() => {
    if (!isVisible) return
    if (!position) return
    if (!isFinite(position.lat) || !isFinite(position.lng)) return
    if (hasFlown.current) return
    map.flyTo([position.lat, position.lng], 16, { duration: 1.2 })
    hasFlown.current = true
  }, [isVisible, position, map, hasFlown])

  return null
}

/** Bei Sichtbar-Werden Container-Größe neu messen, damit nachfolgende
 *  fitBounds/flyTo nicht auf einen size=(0,0)-Container laufen. */
function VisibilityResizer({ isVisible }: { isVisible: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!isVisible) return
    map.invalidateSize()
  }, [isVisible, map])
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

/** Leaflet Container-Größe nach Mount + bei Rotation/Resize neu berechnen */
function MapResizer() {
  const map = useMap()
  useInvalidateOnResize(map)
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

// --- Long-Press auf Karte: Erlegung melden ---

function MapLongPressHandler({ onLongPress, disabled }: {
  onLongPress: (latlng: { lat: number; lng: number }) => void
  disabled?: boolean
}) {
  const map = useMap()

  useEffect(() => {
    if (disabled) return

    const container = map.getContainer()
    let timer: ReturnType<typeof setTimeout> | null = null
    let startPos: { x: number; y: number } | null = null
    let isTouching = false
    let fired = false
    const HOLD_MS = 500
    const MOVE_THRESHOLD = 10

    function clearTimer() {
      if (timer) { clearTimeout(timer); timer = null }
      startPos = null
    }

    // Touch: eigener Timer für 500ms
    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) { clearTimer(); return }
      isTouching = true
      fired = false
      const touch = e.touches[0]
      startPos = { x: touch.clientX, y: touch.clientY }

      timer = setTimeout(() => {
        if (!startPos) return
        fired = true
        const rect = container.getBoundingClientRect()
        const point = map.containerPointToLatLng(
          L.point(startPos.x - rect.left, startPos.y - rect.top)
        )
        onLongPress({ lat: point.lat, lng: point.lng })
        if (navigator.vibrate) navigator.vibrate(50)
        clearTimer()
      }, HOLD_MS)
    }

    function handleTouchMove(e: TouchEvent) {
      if (!timer || !startPos || e.touches.length !== 1) { clearTimer(); return }
      const touch = e.touches[0]
      const dx = touch.clientX - startPos.x
      const dy = touch.clientY - startPos.y
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
        clearTimer()
      }
    }

    function handleTouchEnd() {
      clearTimer()
      setTimeout(() => { isTouching = false }, 500)
    }

    function handleTouchCancel() {
      clearTimer()
      isTouching = false
    }

    // Desktop: Rechtsklick
    function handleContextMenu(e: L.LeafletMouseEvent) {
      e.originalEvent.preventDefault()
      if (isTouching || fired) { fired = false; return }
      onLongPress({ lat: e.latlng.lat, lng: e.latlng.lng })
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true })
    map.on('contextmenu', handleContextMenu)

    // System-Context-Menü unterdrücken (iOS Safari)
    const suppress = (e: Event) => e.preventDefault()
    container.addEventListener('contextmenu', suppress)
    container.style.setProperty('-webkit-touch-callout', 'none')

    return () => {
      clearTimer()
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchCancel)
      map.off('contextmenu', handleContextMenu)
      container.removeEventListener('contextmenu', suppress)
      container.style.removeProperty('-webkit-touch-callout')
    }
  }, [map, onLongPress, disabled])

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
      aria-label="Alle Teilnehmer anzeigen"
    >
      <UsersThree size={20} />
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
    if (participant.role === 'jagdleiter') badge = `<span class="marker-badge">${MARKER_STAR_SVG}</span>`
    else if (participant.tags.includes('hundefuehrer')) badge = `<span class="marker-badge">${MARKER_DOG_SVG}</span>`

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
          <span className="participant-popup-role"><RoleLabel role={participant.role} tags={participant.tags} /></span>
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

function StandMarker({ stand, zoom, onEdit, onTap, assignedTo, isMoving, movingActive, isJagdleiter, onDragEnd, userLat, userLng }: {
  stand: StandData
  zoom: number
  onEdit?: (stand: StandData) => void
  onTap?: (stand: StandData) => void
  assignedTo?: string | null
  isMoving?: boolean
  movingActive?: boolean
  isJagdleiter?: boolean
  onDragEnd?: (standId: string, position: { lat: number; lng: number }) => void
  userLat?: number | null
  userLng?: number | null
}) {
  const occupied = !!assignedTo

  const TYPE_LABELS: Record<string, string> = {
    hochsitz: '🪵 Hochsitz',
    kanzel: '🏠 Kanzel',
    drueckjagdstand: '🎯 Drückjagdstand',
    adhoc: '📌 Ad-hoc Stand',
    parkplatz: '🅿️ Parkplatz',
    kirrung: '🌾 Kirrung',
    salzlecke: '🧂 Salzlecke',
    wildkamera: '📷 Wildkamera',
    sonstiges: '📌 Sonstiges',
  }
  const typeLabel = TYPE_LABELS[stand.type] || stand.type

  // Pin-Groesse: belegt 32×40, unbesetzt 22×28 (visuell), Click-Target 28×36
  const pinSize: PinSize = occupied ? 'normal' : 'small'
  const icon = useMemo(() => {
    const variant = getPinVariant(stand.type, occupied, stand.adhoc_subtype)
    const svgHtml = buildPinSvg(variant, stand.id, pinSize)
    const wrapper = isMoving
      ? `<div class="seat-wiggle">${svgHtml}</div>`
      : svgHtml
    if (occupied) {
      return L.divIcon({
        className: 'stand-marker',
        html: wrapper,
        iconSize: [32, 40],
        iconAnchor: [16, 40],
        tooltipAnchor: [0, -40],
      })
    }
    // Unbesetzt: visuelles SVG 22×28, aber Click-Target 28×36 fuer Touch
    return L.divIcon({
      className: 'stand-marker',
      html: `<div style="position:relative;width:1.75rem;height:2.25rem;display:flex;align-items:flex-end;justify-content:center">${svgHtml}</div>`,
      iconSize: [28, 36],
      iconAnchor: [14, 36],
    })
  }, [stand.type, stand.id, occupied, isMoving, pinSize])

  // Zoom-abhaengige Beschriftung (nur fuer besetzte Staende)
  const tooltipContent = useMemo(() => {
    if (!occupied || !assignedTo) return null
    if (zoom < 14) return null
    if (zoom < 16) return { name: buildInitials(assignedTo), distance: null }
    // Zoom >= 16: voller Name + optional Distanz
    let dist: string | null = null
    if (userLat != null && userLng != null) {
      const m = distanceInMeters(userLat, userLng, stand.position.lat, stand.position.lng)
      dist = formatDistanceLabel(m)
    }
    return { name: assignedTo, distance: dist }
  }, [occupied, assignedTo, zoom, userLat, userLng, stand.position.lat, stand.position.lng])

  return (
    <Marker
      position={[stand.position.lat, stand.position.lng]}
      icon={icon}
      draggable={!!isMoving}
      eventHandlers={{
        click: (movingActive && !isMoving) ? undefined : (!isMoving ? (onTap ? () => onTap(stand) : undefined) : undefined),
        dragend: (e) => {
          const ll = e.target.getLatLng()
          onDragEnd?.(stand.id, { lat: ll.lat, lng: ll.lng })
        },
      }}
    >
      {tooltipContent && (
        <Tooltip direction="top" offset={[0, 0]} permanent className="stand-tooltip">
          <span>{tooltipContent.name}</span>
          {tooltipContent.distance && (
            <span className="stand-tooltip-distance">{tooltipContent.distance}</span>
          )}
        </Tooltip>
      )}
      {!onTap && !isMoving && (
        <Popup className="stand-popup">
          <div className="stand-popup-content">
            <strong>{stand.name}</strong>
            <span>{typeLabel}</span>
            {assignedTo && <span style={{ color: 'var(--accent-primary)', fontSize: '0.6875rem' }}>→ {assignedTo}</span>}
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
                  color: 'var(--accent-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  minHeight: '2rem',
                }}
              >
                Bearbeiten
              </button>
            )}
          </div>
        </Popup>
      )}
    </Marker>
  )
}

// --- Freie-Position-Marker (Avatar auf der Karte) ---

function FreePositionMarker({ position, userName, avatarColor }: FreePositionData) {
  const icon = useMemo(() => {
    const initials = getInitials(userName)
    return L.divIcon({
      className: '',
      html: `<div class="assign-free-marker" style="background: ${avatarColor}">${initials}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    })
  }, [userName, avatarColor])

  return (
    <Marker position={[position.lat, position.lng]} icon={icon}>
      <Tooltip direction="bottom" offset={[0, 14]} permanent className="stand-tooltip">
        {userName}
      </Tooltip>
    </Marker>
  )
}

// --- Schnellzuweisung Sheet (Tap auf Stand → Jäger-Liste) ---
// Umbesetzen-Fix: UPDATE user_id statt DELETE+INSERT — alter Stand bleibt erhalten

function StandAssignSheet({ stand, huntParticipants, seatAssignments, huntId, stands, onAssign, onClose, onEdit, showSkip }: {
  stand: StandData
  huntParticipants: HuntParticipantInfo[]
  seatAssignments: SeatAssignmentData[]
  huntId: string
  stands: StandData[]
  onAssign: (newAssignments: SeatAssignmentData[]) => void
  onClose: () => void
  onEdit: (stand: StandData) => void
  showSkip?: boolean
}) {
  const [saving, setSaving] = useState(false)
  const [confirmData, setConfirmData] = useState<{ userId: string; userName: string; oldStandName: string } | null>(null)

  // Zuordnung: welcher User ist wo zugewiesen?
  const userAssignments = useMemo(() => {
    const map = new Map<string, { standName: string; assignmentId: string }>()
    for (const a of seatAssignments) {
      if (!a.user_id) continue
      if (a.seat_type === 'assigned' && a.seat_id) {
        const s = stands.find(st => st.id === a.seat_id)
        map.set(a.user_id, { standName: s?.name || '?', assignmentId: a.id })
      } else if (a.seat_type === 'adhoc') {
        map.set(a.user_id, { standName: a.seat_name || 'Ad-hoc', assignmentId: a.id })
      } else if (a.seat_type === 'free_pos') {
        map.set(a.user_id, { standName: 'Freie Position', assignmentId: a.id })
      }
    }
    return map
  }, [seatAssignments, stands])

  // Wer ist bereits diesem Stand zugewiesen? (kann user_id = null haben)
  const currentAssignee = seatAssignments.find(a =>
    (a.seat_type === 'assigned' && a.seat_id === stand.id) ||
    (a.seat_type === 'adhoc' && a.id === stand.id)
  )

  async function handleAssign(userId: string, confirmed = false) {
    const existingUserAssignment = seatAssignments.find(a => a.user_id === userId)

    // Toggle: User ist bereits auf DIESEM Stand → entfernen (UPDATE user_id = NULL)
    if (currentAssignee?.user_id === userId) {
      setSaving(true)
      const supabase = createClient()
      await supabase.from('hunt_seat_assignments').update({ user_id: null }).eq('id', currentAssignee.id)
      const updated = seatAssignments.map(a =>
        a.id === currentAssignee.id ? { ...a, user_id: null } : a
      )
      onAssign(updated)
      setSaving(false)
      onClose()
      return
    }

    // User ist woanders zugewiesen → Bestätigung nötig
    if (existingUserAssignment && !confirmed) {
      const participant = huntParticipants.find(p => p.user_id === userId)
      const oldStandName = existingUserAssignment.seat_name
        || stands.find(s => s.id === existingUserAssignment.seat_id)?.name
        || 'Unbekannter Stand'
      setConfirmData({
        userId,
        userName: pName(participant || { profiles: null, guest_name: null } as any),
        oldStandName,
      })
      return
    }

    setSaving(true)
    const supabase = createClient()

    // Schritt 1: User vom alten Stand lösen (UPDATE user_id = NULL)
    if (existingUserAssignment) {
      const { error } = await supabase.from('hunt_seat_assignments').update({ user_id: null }).eq('id', existingUserAssignment.id)
      if (error) { console.error('Fehler beim Lösen der alten Zuweisung:', error); setSaving(false); return }
    }

    // Schritt 2: Aktuellen Besitzer dieses Stands lösen (UPDATE user_id = NULL)
    if (currentAssignee?.user_id && currentAssignee.user_id !== userId) {
      const { error } = await supabase.from('hunt_seat_assignments').update({ user_id: null }).eq('id', currentAssignee.id)
      if (error) { console.error('Fehler beim Lösen des aktuellen Besitzers:', error); setSaving(false); return }
    }

    // Schritt 3: User diesem Stand zuweisen
    // Prüfe ob bereits eine Assignment-Row für diesen Stand existiert
    const existingStandRow = seatAssignments.find(a =>
      (a.seat_type === 'assigned' && a.seat_id === stand.id) ||
      (a.seat_type === 'adhoc' && a.id === stand.id)
    )

    let updated: SeatAssignmentData[]

    if (existingStandRow) {
      // Row existiert → UPDATE user_id
      const { error } = await supabase.from('hunt_seat_assignments').update({ user_id: userId }).eq('id', existingStandRow.id)
      if (error) { console.error('Fehler beim Zuweisen:', error); setSaving(false); return }
      updated = seatAssignments.map(a => {
        if (a.id === existingStandRow.id) return { ...a, user_id: userId }
        if (existingUserAssignment && a.id === existingUserAssignment.id) return { ...a, user_id: null }
        if (currentAssignee && a.id === currentAssignee.id && a.id !== existingStandRow.id) return { ...a, user_id: null }
        return a
      })
    } else {
      // Keine Row → INSERT (für Revier-Stände ohne bisherige Zuweisung)
      const isAdhoc = stand.type === 'adhoc'
      const { data, error } = await supabase
        .from('hunt_seat_assignments')
        .insert({
          hunt_id: huntId,
          user_id: userId,
          seat_id: isAdhoc ? null : stand.id,
          seat_type: isAdhoc ? 'adhoc' : 'assigned',
          seat_name: isAdhoc ? stand.name : null,
          position_lat: isAdhoc ? stand.position.lat : null,
          position_lng: isAdhoc ? stand.position.lng : null,
        })
        .select('id, user_id, seat_id, seat_type, seat_name, position_lat, position_lng')
        .single()

      if (error) { console.error('Fehler beim INSERT:', error); setSaving(false); return }

      updated = seatAssignments.map(a => {
        if (existingUserAssignment && a.id === existingUserAssignment.id) return { ...a, user_id: null }
        if (currentAssignee && a.id === currentAssignee.id) return { ...a, user_id: null }
        return a
      })
      if (data) updated.push(data)
    }

    onAssign(updated)
    setSaving(false)
    setConfirmData(null)
    onClose()
  }

  const pName = (p: HuntParticipantInfo) => p.profiles?.display_name || p.guest_name || 'Unbekannt'

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={() => { setConfirmData(null); onClose() }} />
      <div className="map-object-sheet" style={{ maxHeight: '60vh' }}>
        <div className="sheet-handle" />
        <div className="sheet-header" style={{ fontSize: '0.8125rem' }}>
          🪜 {stand.name}
          {currentAssignee?.user_id && (
            <span style={{ color: 'var(--accent-primary)', fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.75rem' }}>
              → {pName(huntParticipants.find(p => p.user_id === currentAssignee.user_id) || { profiles: null, guest_name: null } as any)}
            </span>
          )}
        </div>
        <div style={{ padding: '0 1rem', maxHeight: '40vh', overflowY: 'auto' }}>
          {huntParticipants.filter(p => p.user_id).map(p => {
            const assignment = userAssignments.get(p.user_id!)
            const isOnThisStand = currentAssignee?.user_id === p.user_id
            const isAssignedElsewhere = assignment && !isOnThisStand

            return (
              <button
                key={p.id}
                onClick={() => !saving && p.user_id && handleAssign(p.user_id)}
                disabled={saving}
                className="w-full flex items-center gap-3 text-left"
                style={{
                  padding: '0.75rem 0',
                  borderBottom: '1px solid var(--border-light)',
                  opacity: isAssignedElsewhere ? 0.5 : 1,
                  background: isOnThisStand ? 'rgba(107,159,58,0.08)' : 'transparent',
                }}
              >
                <div className="avatar-xs" style={{ flexShrink: 0, background: getAvatarColor(p.id), color: '#fff' }}>
                  {getInitials(pName(p))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{pName(p)}</p>
                  {isOnThisStand && (
                    <p className="text-xs" style={{ color: 'var(--accent-primary)' }}>Hier zugewiesen ✓</p>
                  )}
                  {isAssignedElsewhere && (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>Auf: {assignment.standName}</p>
                  )}
                </div>
                {p.role === 'jagdleiter' && <Star size={12} weight="fill" color="var(--accent-gold)" />}
                {p.tags?.includes('gruppenleiter') && <UsersThree size={12} color="var(--text-secondary)" />}
                {p.tags?.includes('hundefuehrer') && <Dog size={12} color="var(--text-secondary)" />}
              </button>
            )
          })}
        </div>
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '0.5rem' }}>
          {showSkip && (
            <button
              onClick={onClose}
              className="text-center text-xs font-semibold"
              style={{
                flex: 1, padding: '0.625rem', borderRadius: 'var(--radius)',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text-2)',
              }}
            >
              Überspringen
            </button>
          )}
          <button
            onClick={() => { onClose(); onEdit(stand) }}
            className={`${showSkip ? '' : 'w-full'} text-center text-xs font-semibold`}
            style={{
              flex: showSkip ? 1 : undefined,
              width: showSkip ? undefined : '100%',
              padding: '0.625rem', borderRadius: 'var(--radius)',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text-2)',
            }}
          >
            ✏️ Bearbeiten
          </button>
        </div>
      </div>

      {/* Bestätigungsdialog: User ist woanders zugewiesen */}
      {confirmData && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <p>
              <strong>{confirmData.userName}</strong> ist bereits <strong>{confirmData.oldStandName}</strong> zugewiesen.<br />Dort entfernen und hier zuweisen?
            </p>
            <div className="confirm-actions">
              <button
                onClick={() => setConfirmData(null)}
                style={{
                  flex: 1, padding: '0.625rem', borderRadius: 'var(--radius)',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleAssign(confirmData.userId, true)}
                disabled={saving}
                style={{
                  flex: 1, padding: '0.625rem', borderRadius: 'var(--radius)',
                  background: 'var(--green)', border: 'none',
                  color: 'white', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
                }}
              >
                Zuweisen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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

// GpsStatusBadge: importiert aus ./GpsStatusBadge

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
  isVisible,
  geoState,
  participants,
  boundary,
  stands,
  participantStands,
  freePositions,
  standAssignedNames,
  districtId,
  districtName,
  huntId,
  huntParticipants,
  seatAssignments,
  isJagdleiter,
  isGruppenleiter,
  currentUserId,
  onStandsChanged,
  onBoundaryChanged,
  onSeatAssignmentsChanged,
}: MapContentProps) {
  const router = useRouter()
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

  // Long-Press → Erlegung melden
  const [erlegungPickerOpen, setErlegungPickerOpen] = useState(false)
  const [erlegungLongPressPos, setErlegungLongPressPos] = useState<{ lat: number; lng: number } | null>(null)

  // Schnellzuweisung
  const [assignStand, setAssignStand] = useState<StandData | null>(null)

  // Stand-Detail-Sheet (neuer einheitlicher Tap-Flow)
  const [detailStand, setDetailStand] = useState<StandData | null>(null)

  // Per-Marker Move-Mode (nur Jagdleiter)
  const [movingStandId, setMovingStandId] = useState<string | null>(null)
  const isMovingActive = !!movingStandId

  // Live-FAB: Adhoc-Stand-Erstellung
  const [awaitingAdhocPlacement, setAwaitingAdhocPlacement] = useState(false)

  // Zeichenmodus für Reviergrenze
  const [drawingMode, setDrawingMode] = useState(false)
  const [drawPoints, setDrawPoints] = useState<{ lat: number; lng: number }[]>([])
  const [boundarySheetMode, setBoundarySheetMode] = useState<'save' | 'hidden'>('hidden')

  // Kompass / Heading
  const [compassEnabled, setCompassEnabledState] = useState(getCompassEnabled)
  const ownPositionRef = useRef<OwnPositionMarkerHandle>(null)
  const handleHeading = useCallback((deg: number) => {
    ownPositionRef.current?.setHeading(deg)
  }, [])
  const { permission: compassPermission, request: requestCompass } = useCompassHeading(handleHeading, compassEnabled)
  const handleCompassToggle = useCallback(async () => {
    if (compassEnabled) {
      // Ausschalten
      setCompassEnabledState(false)
      setCompassEnabled(false)
      ownPositionRef.current?.clearHeading()
    } else {
      // Einschalten — ggf. Permission anfordern
      setCompassEnabledState(true)
      setCompassEnabled(true)
      if (compassPermission !== 'granted') {
        const ok = await requestCompass()
        if (!ok) {
          setCompassEnabledState(false)
          setCompassEnabled(false)
        }
      }
    }
  }, [compassEnabled, compassPermission, requestCompass])

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

  // "Position ändern" aus dem Bearbeiten-Sheet → Move-Mode für diesen Stand starten
  const handleMovePosition = useCallback(() => {
    if (editStand) {
      setMovingStandId(editStand.id)
      setSheetMode('hidden')
      setEditStand(null)
    }
  }, [editStand])

  // Stand verschoben im Move-Mode → Position in DB persistieren
  const handleStandDragEnd = useCallback(async (standId: string, position: { lat: number; lng: number }) => {
    const stand = stands?.find(s => s.id === standId)
    if (!stand) return

    const originalPosition = { lat: stand.position.lat, lng: stand.position.lng }

    // Optimistisches State-Update
    onStandsChanged?.({ ...stand, position }, undefined)

    // DB-Update
    const supabase = createClient()
    if (stand.type === 'adhoc') {
      // Ad-hoc: Position in hunt_seat_assignments (per ID, nicht Name)
      const { data, error } = await supabase
        .from('hunt_seat_assignments')
        .update({ position_lat: position.lat, position_lng: position.lng })
        .eq('id', standId)
        .select()

      if (error || !data?.length) {
        console.error('Drag-Update fehlgeschlagen für Adhoc-Stand', standId, error)
        onStandsChanged?.({ ...stand, position: originalPosition }, undefined)
      }
    } else {
      // Revier-Stand: Position in map_objects (PostGIS)
      const { data, error } = await supabase
        .from('map_objects')
        .update({ position: `SRID=4326;POINT(${position.lng} ${position.lat})` })
        .eq('id', standId)
        .select()

      if (error || !data?.length) {
        console.error('Drag-Update fehlgeschlagen für Revier-Stand', standId, error)
        onStandsChanged?.({ ...stand, position: originalPosition }, undefined)
      }
    }
  }, [stands, onStandsChanged])

  // --- Live-FAB: Adhoc-Stand auf Karte platzieren ---

  const handleAdhocPlacement = useCallback(async (latlng: { lat: number; lng: number }) => {
    if (!awaitingAdhocPlacement || !huntId || !seatAssignments) return

    // Nächste Stand-Nummer berechnen
    const existingNumbers = (seatAssignments || [])
      .filter(a => a.seat_type === 'adhoc' && a.seat_name)
      .map(a => {
        const m = a.seat_name!.match(/^Stand\s+(\d+)$/i)
        return m ? parseInt(m[1], 10) : 0
      })
    const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1
    const seatName = `Stand ${nextNum}`

    const supabase = createClient()
    const { data, error } = await supabase
      .from('hunt_seat_assignments')
      .insert({
        hunt_id: huntId,
        user_id: null,
        seat_id: null,
        seat_type: 'adhoc',
        seat_name: seatName,
        position_lat: latlng.lat,
        position_lng: latlng.lng,
        adhoc_subtype: null,
      })
      .select('id, user_id, seat_id, seat_type, seat_name, position_lat, position_lng, adhoc_subtype')
      .single()

    if (error || !data) {
      console.error('Adhoc-Stand konnte nicht erstellt werden:', error)
      setAwaitingAdhocPlacement(false)
      return
    }

    // State aktualisieren
    const updated = [...(seatAssignments || []), data]
    onSeatAssignmentsChanged?.(updated)

    // Tap-Modus beenden — kein Sheet öffnen, Zuweisung passiert per Tap auf den Stand
    setAwaitingAdhocPlacement(false)
  }, [awaitingAdhocPlacement, huntId, seatAssignments, onSeatAssignmentsChanged])

  // --- Long-Press → Erlegung melden ---

  const handleErlegungLongPress = useCallback((latlng: { lat: number; lng: number }) => {
    setErlegungLongPressPos(latlng)
    setErlegungPickerOpen(true)
  }, [])

  const erlegungLongPressDisabled = drawingMode || awaitingAdhocPlacement
    || isMovingActive || erlegungPickerOpen || sheetMode !== 'hidden'

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

  const handleDrawFinish = useCallback(async () => {
    if (drawPoints.length < 3 || !huntId) return

    // Freie Jagd: direkt in hunts.boundary speichern
    const closed = [...drawPoints, drawPoints[0]]
    const wkt = closed.map(p => `${p.lng} ${p.lat}`).join(', ')
    const ewkt = `SRID=4326;POLYGON((${wkt}))`

    const supabase = createClient()
    const { error } = await supabase
      .from('hunts')
      .update({ boundary: ewkt })
      .eq('id', huntId)

    if (error) {
      console.error('Jagd-Grenze speichern fehlgeschlagen:', error)
      return
    }

    setDrawingMode(false)
    setDrawPoints([])
    onBoundaryChanged?.()
  }, [drawPoints, huntId, onBoundaryChanged])

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

      {/* Kompass-Toggle (oben links, unter GpsStatusBadge) */}
      <CompassToggleButton
        enabled={compassEnabled}
        permission={compassPermission}
        onToggle={handleCompassToggle}
      />

      {/* Layer-Switcher (oben rechts) */}
      <LayerSwitcher
        activeLayer={activeLayer}
        onLayerChange={handleLayerChange}
        cadastreEnabled={cadastreEnabled}
        onCadastreToggle={handleCadastreToggle}
        cadastreAvailable={cadastreAvailable}
      />

      {/* Grenze zeichnen / bearbeiten Button — nur Jagdleiter bei freier Jagd */}
      {isJagdleiter && !districtId && !drawingMode && (
        <button className="draw-boundary-btn" onClick={startDrawing}>
          ✏️ {boundary && boundary.length > 0 ? 'Grenze bearbeiten' : 'Grenze zeichnen'}
        </button>
      )}
      {isJagdleiter && !districtId && drawingMode && (
        <button className="draw-boundary-btn active" onClick={cancelDrawing}>
          ✏️ Zeichenmodus
        </button>
      )}

      {/* Hinweis im Zeichenmodus */}
      {drawingMode && drawPoints.length === 0 && (
        <div className="draw-hint">Tippe Punkte auf die Karte</div>
      )}

      {/* Flächen-Anzeige im Zeichenmodus */}
      {drawingMode && drawPoints.length >= 3 && (
        <div style={{
          position: 'absolute', top: '6.5rem', right: '0.75rem', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          background: 'rgba(255,143,0,0.15)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,143,0,0.3)', borderRadius: 'var(--radius)',
          padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 600,
          color: 'var(--orange)', pointerEvents: 'none',
        }}>
          📐 {polygonAreaHectares(drawPoints).toFixed(0)} ha
        </div>
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

      {/* Fertig-Button im Move-Mode */}
      {isMovingActive && (
        <button className="seat-edit-done-btn" onClick={() => setMovingStandId(null)}>
          Fertig
        </button>
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

        {/* === Zeichenmodus: Klick-Handler === */}
        {drawingMode && <MapClickHandler onMapClick={handleDrawClick} />}

        {/* === Adhoc-Placement: Klick-Handler === */}
        {awaitingAdhocPlacement && <MapClickHandler onMapClick={handleAdhocPlacement} />}

        {/* === Long-Press → Erlegung melden === */}
        <MapLongPressHandler
          onLongPress={handleErlegungLongPress}
          disabled={erlegungLongPressDisabled}
        />

        {/* === Move-Mode: Klicks auf Karte ignorieren === */}

        {/* === Karten-Steuerung === */}
        <VisibilityResizer isVisible={isVisible} />
        <MapResizer />
        <InitialViewSetter isVisible={isVisible} boundary={boundary} position={geoState.position} hasFlown={hasFlown} />
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
          <StandMarker
            key={stand.id}
            stand={stand}
            zoom={zoom}
            onEdit={handleEditStand}
            onTap={huntParticipants && huntId && !isMovingActive && isAssignableStand(stand.type) ? () => setDetailStand(stand) : undefined}
            assignedTo={standAssignedNames?.[stand.id]}
            isMoving={movingStandId === stand.id}
            movingActive={isMovingActive}
            isJagdleiter={isJagdleiter}
            onDragEnd={handleStandDragEnd}
            userLat={geoState.position?.lat}
            userLng={geoState.position?.lng}
          />
        ))}

        {/* === Freie Positionen === */}
        {freePositions?.map(fp => (
          <FreePositionMarker key={fp.userId} {...fp} />
        ))}

        {/* === Temporärer Marker (Long-Press Platzierung) === */}
        {tempMarker && (
          <Marker
            position={[tempMarker.lat, tempMarker.lng]}
            icon={tempMarkerIcon}
          />
        )}

        {/* === Eigene Position: Accuracy-Kreis + blauer Punkt + Kompass-Kegel === */}
        {geoState.position && (
          <OwnPositionMarker
            ref={ownPositionRef}
            position={geoState.position}
            accuracy={geoState.accuracy}
            compassEnabled={compassEnabled && compassPermission === 'granted'}
          />
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

      {/* === Info-Pille: Adhoc-Placement-Modus === */}
      {awaitingAdhocPlacement && (
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
          <span>Tippe auf die Karte</span>
          <button
            onClick={() => setAwaitingAdhocPlacement(false)}
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
            Abbrechen
          </button>
        </div>
      )}

      {/* === Live-FAB: Adhoc-Stand erstellen (Jagdleiter oder Gruppenleiter, freie Jagd) === */}
      {(isJagdleiter || isGruppenleiter) && huntId && !districtId && !isMovingActive && !drawingMode
        && !assignStand && !detailStand && !awaitingAdhocPlacement
        && sheetMode === 'hidden' && boundarySheetMode === 'hidden' && (
        <button
          onClick={() => setAwaitingAdhocPlacement(true)}
          style={{
            position: 'absolute',
            bottom: 'calc(var(--bottom-bar-space, 0rem) + 7.5rem)',
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
          title="Neuen Stand setzen"
        >
          +
        </button>
      )}

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
        onMovePosition={handleMovePosition}
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

      {/* === Stand-Detail-Sheet (neuer einheitlicher Tap-Flow) === */}
      {detailStand && huntParticipants && huntId && seatAssignments && currentUserId && (
        <StandDetailSheet
          stand={detailStand}
          huntId={huntId}
          isJagdleiter={!!isJagdleiter}
          currentUserId={currentUserId}
          huntParticipants={huntParticipants}
          seatAssignments={seatAssignments}
          onClose={() => setDetailStand(null)}
          onAssign={(stand) => {
            setDetailStand(null)
            setAssignStand(stand)
          }}
          onEdit={(stand) => {
            setDetailStand(null)
            handleEditStand(stand)
          }}
          onDeleted={(stand) => {
            // Adhoc-Stand wurde in StandDetailSheet gelöscht → State aktualisieren
            if (seatAssignments) {
              const updated = seatAssignments.filter(a => a.id !== stand.id)
              onSeatAssignmentsChanged?.(updated)
            }
            setDetailStand(null)
          }}
          onRenamed={(standId, newName) => {
            // Adhoc-Stand wurde in StandDetailSheet umbenannt → State aktualisieren
            if (seatAssignments) {
              const updated = seatAssignments.map(a =>
                a.id === standId ? { ...a, seat_name: newName } : a
              )
              onSeatAssignmentsChanged?.(updated)
            }
            setDetailStand(null)
          }}
          onMovePosition={(stand) => {
            setDetailStand(null)
            setMovingStandId(stand.id)
          }}
          onOpenChat={async (userId) => {
            setDetailStand(null)
            const supabase = createClient()
            const { data, error } = await supabase.rpc('get_or_create_direct_chat', {
              other_user_id: userId,
            })
            if (error) {
              console.error('Direkt-Chat konnte nicht geöffnet werden:', error)
              return
            }
            router.push(`/app/chat/${data}`)
          }}
        />
      )}

      {/* === Schnellzuweisung Sheet === */}
      {assignStand && huntParticipants && huntId && seatAssignments && (
        <StandAssignSheet
          stand={assignStand}
          huntParticipants={huntParticipants}
          seatAssignments={seatAssignments}
          huntId={huntId}
          stands={stands || []}
          onAssign={(updated) => onSeatAssignmentsChanged?.(updated)}
          onClose={() => setAssignStand(null)}
          onEdit={handleEditStand}
        />
      )}

      {/* === Long-Press Erlegung Picker === */}
      <WildartPicker
        open={erlegungPickerOpen}
        onOpenChange={(o) => {
          setErlegungPickerOpen(o)
          if (!o) setErlegungLongPressPos(null)
        }}
        position={erlegungLongPressPos}
        huntId={huntId}
      />
    </div>
  )
}
