'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { buildPinSvg, getPinVariant } from '@/lib/markers/pin-svg'
import { parsePointHex } from '@/lib/geo-utils'
import type { MapObject, ObjektType } from '@/lib/types/revier'
import OwnPositionMarker, { type OwnPositionMarkerHandle } from '@/components/hunt/OwnPositionMarker'
import CompassToggleButton from '@/components/map/CompassToggleButton'
import GpsStatusBadge from '@/components/hunt/GpsStatusBadge'
import { useCompassHeading } from '@/hooks/useCompassHeading'
import { useGeolocation } from '@/hooks/useGeolocation'

// --- Position aus PostgREST parsen (GeoJSON Point oder Hex) ---

function parsePosition(input: unknown): { lat: number; lng: number } | null {
  // GeoJSON Point: { type: "Point", coordinates: [lng, lat] }
  if (input && typeof input === 'object' && 'type' in input && 'coordinates' in input) {
    const geo = input as { type: string; coordinates: number[] }
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return { lat: geo.coordinates[1], lng: geo.coordinates[0] }
    }
    return null
  }
  // Hex-encoded EWKB
  if (typeof input === 'string') {
    return parsePointHex(input)
  }
  return null
}

// --- Leaflet divIcon aus Pin-SVG ---

function makeIcon(type: string): L.DivIcon {
  const variant = getPinVariant(type, false)
  const svg = buildPinSvg(variant, `rev-${type}`)
  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    tooltipAnchor: [0, -40],
  })
}

const iconCache = new Map<string, L.DivIcon>()
function getIcon(type: string): L.DivIcon {
  let icon = iconCache.get(type)
  if (!icon) {
    icon = makeIcon(type)
    iconCache.set(type, icon)
  }
  return icon
}

// --- Karte auf Bounds oder Center setzen ---

function InitialView({ center, zoom, boundary }: {
  center: [number, number]
  zoom: number
  boundary: [number, number][][] | null
}) {
  const map = useMap()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true

    if (boundary && boundary.length > 0 && boundary[0].length >= 3) {
      const bounds = L.latLngBounds(boundary[0] as L.LatLngExpression[])
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 })
    } else {
      map.setView(center, zoom)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// --- Map-Click-Handler ---

function MapClickHandler({ onClick }: { onClick: (latlng: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onClick([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

// --- Vorschau-Pin ---

function makePreviewIcon(type: string, confirmed: boolean): L.DivIcon {
  const variant = getPinVariant(type, false)
  const svg = buildPinSvg(variant, `preview-${type}`)
  const style = confirmed
    ? 'opacity: 0.85'
    : 'opacity: 0.7; filter: drop-shadow(0 0 6px var(--green-bright)); animation: preview-pulse 1.5s ease-in-out infinite'
  return L.divIcon({
    className: '',
    html: `<div style="${style}">${svg}</div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  })
}

// --- Hauptkomponente ---

interface RevierMapProps {
  center: [number, number]
  zoom?: number
  objects: MapObject[]
  boundary?: [number, number][][] | null
  onMapClick?: (latlng: [number, number]) => void
  onObjectClick?: (obj: MapObject) => void
  previewPin?: { type: ObjektType; position: [number, number]; confirmed?: boolean } | null
  /** ID eines Objekts das ausgeblendet werden soll (z.B. während Position-Verschieben) */
  hiddenObjectId?: string | null
}

export default function RevierMap({ center, zoom = 14, objects, boundary, onMapClick, onObjectClick, previewPin, hiddenObjectId }: RevierMapProps) {
  // --- Orientierungs-Overlay (GPS + Kompass, on-demand) ---
  const [orientationActive, setOrientationActive] = useState(false)
  const ownPositionRef = useRef<OwnPositionMarkerHandle>(null)

  const geoState = useGeolocation({ enabled: orientationActive })

  const handleHeading = useCallback((deg: number) => {
    ownPositionRef.current?.setHeading(deg)
  }, [])
  const { permission: compassPermission, request: requestCompass } = useCompassHeading(handleHeading, orientationActive)

  const handleOrientationToggle = useCallback(async () => {
    if (orientationActive) {
      setOrientationActive(false)
      ownPositionRef.current?.clearHeading()
    } else {
      setOrientationActive(true)
      if (compassPermission !== 'granted') {
        const ok = await requestCompass()
        if (!ok) {
          setOrientationActive(false)
        }
      }
    }
  }, [orientationActive, compassPermission, requestCompass])

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* GPS-Badge (nur wenn Orientierung aktiv) */}
      {orientationActive && <GpsStatusBadge geo={geoState} />}

      {/* Kompass-Button (immer sichtbar als Einstiegspunkt) */}
      <CompassToggleButton
        enabled={orientationActive}
        permission={compassPermission}
        onToggle={handleOrientationToggle}
      />

      <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png"
        attribution='&copy; <a href="https://www.bkg.bund.de">BKG</a>'
        maxZoom={18}
      />

      <InitialView center={center} zoom={zoom} boundary={boundary ?? null} />

      {onMapClick && <MapClickHandler onClick={onMapClick} />}

      {/* Vorschau-Pin */}
      {previewPin && (
        <Marker
          position={previewPin.position}
          icon={makePreviewIcon(previewPin.type, !!previewPin.confirmed)}
          interactive={false}
        />
      )}

      {/* Reviergrenze */}
      {boundary && boundary.length > 0 && boundary[0].length >= 3 && (
        <Polygon
          positions={boundary[0] as L.LatLngExpression[]}
          pathOptions={{
            color: 'hsl(142, 70%, 45%)',
            weight: 2,
            dashArray: '8 4',
            fillColor: 'hsl(142, 70%, 45%)',
            fillOpacity: 0.06,
          }}
          interactive={false}
        />
      )}

      {/* Revier-Objekte */}
      {objects.map(obj => {
        if (hiddenObjectId && obj.id === hiddenObjectId) return null
        const pos = parsePosition(obj.position)
        if (!pos) return null
        return (
          <Marker
            key={obj.id}
            position={[pos.lat, pos.lng]}
            icon={getIcon(obj.type)}
            eventHandlers={onObjectClick ? { click: () => onObjectClick(obj) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -4]} permanent={objects.length <= 30}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{obj.name}</span>
            </Tooltip>
          </Marker>
        )
      })}

      {/* Eigene Position + Kompass-Kegel (nur wenn aktiv + GPS-Fix) */}
      {orientationActive && geoState.position && (
        <OwnPositionMarker
          ref={ownPositionRef}
          position={geoState.position}
          accuracy={geoState.accuracy}
          compassEnabled={orientationActive}
        />
      )}
    </MapContainer>
    </div>
  )
}
