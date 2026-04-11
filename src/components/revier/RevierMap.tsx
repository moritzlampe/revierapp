'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Polygon, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { buildPinSvg, getPinVariant } from '@/lib/markers/pin-svg'
import { parsePointHex } from '@/lib/geo-utils'
import type { MapObject } from '@/lib/types/revier'

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

// --- Hauptkomponente ---

interface RevierMapProps {
  center: [number, number]
  zoom?: number
  objects: MapObject[]
  boundary?: [number, number][][] | null
}

export default function RevierMap({ center, zoom = 14, objects, boundary }: RevierMapProps) {
  return (
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
        const pos = parsePosition(obj.position)
        if (!pos) return null
        return (
          <Marker
            key={obj.id}
            position={[pos.lat, pos.lng]}
            icon={getIcon(obj.type)}
          >
            <Tooltip direction="top" offset={[0, -4]} permanent={objects.length <= 30}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{obj.name}</span>
            </Tooltip>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
