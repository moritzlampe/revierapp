'use client'

import { useMemo } from 'react'
import L from 'leaflet'
import { Polygon, Polyline, Marker, useMapEvents } from 'react-leaflet'
import type { DrawPoint } from '@/hooks/useBoundaryEditor'

// --- Leaflet divIcons (nutzen CSS-Klassen aus globals.css) ---

function useDrawIcons() {
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

  return { vertexIcon, firstVertexIcon, midpointIcon }
}

// --- Karten-Klick abfangen ---

function DrawClickHandler({ onClick }: { onClick: (latlng: DrawPoint) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// --- Hauptkomponente ---

interface BoundaryDrawLayerProps {
  drawPoints: DrawPoint[]
  onMapClick: (latlng: DrawPoint) => void
  onVertexDrag: (index: number, latlng: DrawPoint) => void
  onVertexDelete: (index: number) => void
  onMidpointInsert: (afterIndex: number, latlng: DrawPoint) => void
}

export default function BoundaryDrawLayer({
  drawPoints,
  onMapClick,
  onVertexDrag,
  onVertexDelete,
  onMidpointInsert,
}: BoundaryDrawLayerProps) {
  const { vertexIcon, firstVertexIcon, midpointIcon } = useDrawIcons()

  /**
   * KEINE Live-Vorschau während des Ziehens — bewusst, nach einem Fehlversuch am
   * 27.07.2026: ein React-State-Update pro `drag`-Event lässt react-leaflet den
   * gezogenen Marker neu positionieren, während Leaflet ihn noch selbst
   * verschiebt. Die beiden überschreiben sich gegenseitig und der Punkt landet
   * an einer falschen Stelle.
   *
   * ponytail: der Umriss folgt deshalb erst beim Loslassen. Wer die Vorschau
   * doch will, darf während des Ziehens nicht rendern — der Weg wäre eine
   * referenzstabile `position` für jeden Marker (react-leaflet vergleicht sie per
   * Referenz und ruft dann kein `setLatLng`). Das hängt an einem Interna-Detail
   * von react-leaflet und ist die Vorschau nicht wert.
   */

  return (
    <>
      <DrawClickHandler onClick={onMapClick} />

      {drawPoints.length > 0 && (
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
                  onVertexDrag(i, { lat: ll.lat, lng: ll.lng })
                },
                click: (e) => {
                  L.DomEvent.stopPropagation(e)
                  if (drawPoints.length > 3) {
                    onVertexDelete(i)
                  }
                },
              }}
            />
          ))}

          {/* Zwischenpunkte (Punkte einfügen) — ab 3 Punkte.
              Zwei Wege, damit beide Erwartungen erfüllt sind:
              - Antippen fügt genau in der Mitte ein.
              - Ziehen fügt dort ein, wo losgelassen wird — der Zwischenpunkt
                wird also in einer Geste zum echten Punkt. Das ist die Erwartung
                vom Desktop und aus jedem Karteneditor.
              Leaflet unterdrückt den click nach einem echten Drag selbst
              (Marker prüft dragging.moved()), es fügt also nicht doppelt ein.

              Am Gerät geprüft (27.07.2026): das Ziehen greift **nur am Desktop**.
              Auf dem Handy bleibt es wirkungslos — 10 px sind kein Fingerziel,
              die Berührung geht an die Karte und schiebt sie. Das ist in Ordnung
              und ausdrücklich so abgenommen: am Handy ist Antippen die richtige
              Geste, und weil kein Drag zustande kommt, entstehen dort auch keine
              versehentlichen Punkte beim Kartenschieben. */}
          {drawPoints.length >= 3 && drawPoints.map((p, i) => {
            const next = drawPoints[(i + 1) % drawPoints.length]
            const midLat = (p.lat + next.lat) / 2
            const midLng = (p.lng + next.lng) / 2
            return (
              <Marker
                key={`mid-${i}`}
                position={[midLat, midLng]}
                icon={midpointIcon}
                draggable
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e)
                    onMidpointInsert(i, { lat: midLat, lng: midLng })
                  },
                  dragend: (e) => {
                    const ll = e.target.getLatLng()
                    onMidpointInsert(i, { lat: ll.lat, lng: ll.lng })
                  },
                }}
              />
            )
          })}
        </>
      )}
    </>
  )
}
