'use client'

import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { BKG_TOPPLUS } from '@/lib/map/tiles'

export type Punkt = { id: string; name: string; typ: string; lat: number; lng: number }

export type KarteProps = {
  /** Reviergrenze als Leaflet-Ringe ([lat,lng][]), serverseitig geparst. */
  grenze: [number, number][][] | null
  punkte: Punkt[]
}

/** Alles, worauf ein Schütze sitzt — bekommt den Akzent, der Rest tritt zurück. */
const STAND_TYPEN = new Set(['hochsitz', 'kanzel', 'drueckjagdstand'])

const ACCENT = '#4A5A2A'
const NEUTRAL = '#8B8775'

/**
 * Ausschnitt auf den vorhandenen Bestand legen. Zusätzlich invalidateSize(),
 * weil Leaflet beim Mount in einem noch nicht ausgemessenen Container sonst
 * bei 0×0 bleibt (graue Karte) — dasselbe Muster wie in PointMap.
 */
function Ausschnitt({ grenze, punkte }: KarteProps) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    // Grenze UND Objekte: Stände können außerhalb der gezeichneten Grenze
    // liegen (nicht jedes Revier ist sauber vermessen) und wären sonst
    // beim ersten Blick nicht im Bild.
    const ecken: [number, number][] = [
      ...(grenze?.flat() ?? []),
      ...punkte.map((p) => [p.lat, p.lng] as [number, number]),
    ]
    if (ecken.length > 0) {
      map.fitBounds(L.latLngBounds(ecken), { padding: [24, 24] })
    }
  }, [map, grenze, punkte])
  return null
}

/**
 * Revierkarte der Übersicht: reine Anzeige. Kein Zeichnen, kein Verschieben,
 * keine Auswahl — Bearbeiten ist Phase 3. Deshalb CircleMarker statt der
 * SVG-Pins: bei 196 Objekten (Revier Söder) ist das spürbar billiger und der
 * Pin trägt hier keine Information, die der Tooltip nicht auch trägt.
 *
 * Einbindung über revierkarte.tsx (dynamic, ssr:false) — react-leaflet fasst
 * beim Import `window` an.
 */
export default function RevierkarteMap({ grenze, punkte }: KarteProps) {
  return (
    <MapContainer
      center={[51.2, 10.4]} // Platzhalter bis Ausschnitt greift
      zoom={6}
      zoomControl
      // Kein Wheel-Zoom: die Karte ist ein 420px-Block in einer scrollenden
      // Seite. Zwei Finger auf dem Trackpad würden sonst die Seite anhalten
      // und stattdessen zoomen. Gezoomt wird über +/−.
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url={BKG_TOPPLUS.url}
        attribution={BKG_TOPPLUS.attribution}
        maxZoom={BKG_TOPPLUS.maxZoom}
      />

      {grenze && grenze.length > 0 && (
        <Polygon
          positions={grenze as L.LatLngExpression[][]}
          pathOptions={{ color: ACCENT, weight: 2.5, fillColor: ACCENT, fillOpacity: 0.07 }}
        />
      )}

      {punkte.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={5}
          pathOptions={{
            color: '#FFFFFF',
            weight: 1.5,
            fillColor: STAND_TYPEN.has(p.typ) ? ACCENT : NEUTRAL,
            fillOpacity: 0.9,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}

      <Ausschnitt grenze={grenze} punkte={punkte} />
    </MapContainer>
  )
}
