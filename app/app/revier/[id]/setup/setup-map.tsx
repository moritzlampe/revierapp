'use client'

import { useEffect, useCallback } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Polygon, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet Icon Fix
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

// Hochsitz-Icon
const standIcon = L.divIcon({
  className: '',
  html: `<div style="
    width: 2rem; height: 2rem; border-radius: 50%;
    background: var(--green); border: 2px solid white;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.875rem; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  ">🪜</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

// Boundary-Punkt-Icon
const boundaryPointIcon = L.divIcon({
  className: '',
  html: `<div style="
    width: 0.875rem; height: 0.875rem; border-radius: 50%;
    background: var(--orange); border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

type StandItem = {
  id: string
  name: string
  position: { lat: number; lng: number }
}

interface SetupMapProps {
  center: { lat: number; lng: number }
  stands: StandItem[]
  boundaryPoints: { lat: number; lng: number }[]
  mode: 'stands' | 'boundary'
  onMapTap: (lat: number, lng: number) => void
}

// Karte auf Position zentrieren
function CenterMap({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng], 15)
  }, []) // Nur einmal beim Mount
  return null
}

// Map-Events abfangen
function MapClickHandler({ onMapTap }: { onMapTap: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapTap(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function SetupMap({ center, stands, boundaryPoints, mode, onMapTap }: SetupMapProps) {
  // Polygon-Koordinaten für Leaflet (geschlossener Ring)
  const polygonPositions: [number, number][] = boundaryPoints.map(p => [p.lat, p.lng])

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={15}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        maxZoom={17}
      />

      <CenterMap center={center} />
      <MapClickHandler onMapTap={onMapTap} />

      {/* Hochsitz-Marker */}
      {stands.map(s => (
        <Marker
          key={s.id}
          position={[s.position.lat, s.position.lng]}
          icon={standIcon}
        >
          <Tooltip direction="top" offset={[0, -18]} permanent={stands.length <= 20}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{s.name}</span>
          </Tooltip>
        </Marker>
      ))}

      {/* Boundary-Polygon (wenn >= 3 Punkte) */}
      {boundaryPoints.length >= 3 && (
        <Polygon
          positions={polygonPositions}
          pathOptions={{
            color: '#FF8F00',
            weight: 2,
            fillColor: '#FF8F00',
            fillOpacity: 0.08,
            dashArray: '6, 4',
          }}
        />
      )}

      {/* Boundary-Linie (wenn 2 Punkte) */}
      {boundaryPoints.length >= 2 && boundaryPoints.length < 3 && (
        <Polyline
          positions={polygonPositions}
          pathOptions={{ color: '#FF8F00', weight: 2, dashArray: '6, 4' }}
        />
      )}

      {/* Boundary-Punkte als Marker */}
      {boundaryPoints.map((p, i) => (
        <Marker
          key={`bp-${i}`}
          position={[p.lat, p.lng]}
          icon={boundaryPointIcon}
        >
          <Tooltip direction="top" offset={[0, -10]} permanent={false}>
            <span style={{ fontSize: '0.6875rem' }}>Punkt {i + 1}</span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
}
