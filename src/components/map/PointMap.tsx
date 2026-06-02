'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_TILE_LAYER } from '@/lib/map/tiles'
import { useInvalidateOnResize } from '@/hooks/useInvalidateOnResize'

type PointMapProps = {
  lat: number
  lng: number
  /** Kategorie-Akzent als Marker-Fill (Erlegung Bronze, Anblick Forest). */
  markerColor: string
  zoom?: number
}

/**
 * Leaflet Container-Größe nach Mount + bei Rotation/Resize neu messen.
 * Kritisch hier: PointMap mountet in einem initial versteckten Bottom-Sheet,
 * Leaflet bliebe sonst bei 0×0 (leere/graue Karte). Gleiches Pattern wie
 * MapContent (MapResizer): sofort + nochmal nach 200ms (deckt die
 * Sheet-Open-Animation ab).
 */
function Resizer() {
  const map = useMap()
  useInvalidateOnResize(map)
  useEffect(() => {
    map.invalidateSize()
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map])
  return null
}

/**
 * Schlanke Karten-Komponente: ein Marker auf einem Punkt. Bewusst NICHT
 * MapContent (~1750 LOC, hunt-spezifisch) — reine Anzeige, kein Long-Press,
 * keine Marker-Bearbeitung, keine Standort-Korrektur. Default-Tile-Layer
 * aus src/lib/map/tiles.ts (BKG TopPlus, bundesweit).
 *
 * Marker: CircleMarker im Kategorie-Akzent mit weißem Rand — gut sichtbar
 * auf hellem Topo, spart den marker-icon.png-Fix.
 *
 * Einbindung am Verwendungsort via dynamic(() => import(...), { ssr: false }).
 * Erwartet einen Eltern-Container mit definierter Höhe (füllt 100%).
 */
export default function PointMap({
  lat,
  lng,
  markerColor,
  zoom = 15,
}: PointMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      zoomControl
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url={DEFAULT_TILE_LAYER.url}
        attribution={DEFAULT_TILE_LAYER.attribution}
        maxZoom={DEFAULT_TILE_LAYER.maxZoom}
      />
      <CircleMarker
        center={[lat, lng]}
        radius={9}
        pathOptions={{
          color: '#ffffff',
          weight: 3,
          fillColor: markerColor,
          fillOpacity: 0.85,
        }}
      />
      <Resizer />
    </MapContainer>
  )
}
