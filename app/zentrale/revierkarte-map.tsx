'use client'

import { useEffect, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
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
 * Ab dieser Zoomstufe stehen die Namen dauerhaft an den Punkten, darunter nur
 * beim Überfahren. Grund: Revier Söder hat 196 Objekte — dauerhaft beschriftet
 * wäre die Übersicht ein Schrifthaufen, in dem nichts mehr lesbar ist.
 * ponytail: Schwelle nach Augenmaß gesetzt. Hier drehen, wenn es zu dicht oder
 * zu spät wirkt — 15 zeigt früher, 17 später.
 */
const NAMEN_AB_ZOOM = 16

/**
 * Ausschnitt auf den vorhandenen Bestand legen, und Leaflet neu vermessen,
 * sobald sich der Container ändert.
 *
 * Bewusst ein ResizeObserver statt des sonst üblichen `useInvalidateOnResize`
 * (window-resize): die Karte ändert ihre Größe hier auch ohne Fensteränderung.
 * Der Kinomodus schaltet nur eine CSS-Höhe um, und Vollbild hängt am Element,
 * nicht am Fenster — bei beidem feuert kein resize. Leaflet würde in den alten
 * Ausmaßen weiterrendern (graue Streifen am Rand). Ein Observer deckt alle drei
 * Fälle ab, inklusive Fensteränderung, und ist damit weniger, nicht mehr Code.
 */
function Ausschnitt({ grenze, punkte }: KarteProps) {
  const map = useMap()

  useEffect(() => {
    const beobachter = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    beobachter.observe(map.getContainer())
    return () => beobachter.disconnect()
  }, [map])

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
 * Eigene Komponente, weil `useMapEvents` einen Kartenkontext braucht — den gibt
 * es erst unterhalb von MapContainer, nicht in RevierkarteMap selbst.
 */
function Objekte({ punkte }: { punkte: Punkt[] }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })

  const namenFest = zoom >= NAMEN_AB_ZOOM

  return (
    <>
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
          {/* Das `key` erzwingt ein Neubinden: Leaflet liest `permanent` nur
              beim Anlegen des Tooltips, ein bloßer Prop-Wechsel bliebe wirkungslos. */}
          <Tooltip
            key={namenFest ? 'fest' : 'hover'}
            permanent={namenFest}
            direction="top"
            offset={[0, -6]}
            className="zentrale-karte-label"
          >
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}

/**
 * Revierkarte der Übersicht: reine Anzeige. Kein Zeichnen, kein Verschieben,
 * keine Auswahl — Bearbeiten ist Phase 3. Deshalb CircleMarker statt der
 * SVG-Pins: bei 196 Objekten (Revier Söder) ist das spürbar billiger und der
 * Pin trägt hier keine Information, die der Name nicht auch trägt.
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
      // Wheel-Zoom an. War kurzzeitig aus, um das Seiten-Scrollen zu schützen —
      // ein Problem, das niemand hatte, gegen ein Zoom-Problem, das jeder sofort
      // hatte. Karten zoomen am Rad, das ist die Erwartung.
      scrollWheelZoom
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

      <Objekte punkte={punkte} />
      <Ausschnitt grenze={grenze} punkte={punkte} />
    </MapContainer>
  )
}
