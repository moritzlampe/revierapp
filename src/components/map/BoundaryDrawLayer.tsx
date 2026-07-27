'use client'

import { useMemo, useState } from 'react'
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

  // Ein Zwischenpunkt, der gerade gezogen wird. Nur zur Vorschau: erst beim
  // Loslassen wird er über onMidpointInsert ein echter Punkt.
  const [zug, setZug] = useState<{ nachIndex: number; punkt: DrawPoint } | null>(null)

  /**
   * Umriss für die Vorschau: während des Ziehens steckt der provisorische Punkt
   * schon drin, damit die Linie dem Finger/Zeiger folgt. Ohne das zieht man
   * einen Punkt und nichts bewegt sich — es sähe kaputt aus.
   *
   * Bewusst nur für Polygon und Linien. Die Griffe (Vertices, Zwischenpunkte)
   * rendern weiter aus `drawPoints`, damit ihre Indizes stabil bleiben und die
   * Handler nicht auf den falschen Punkt zeigen.
   */
  const umriss = useMemo(() => {
    if (!zug) return drawPoints
    const next = [...drawPoints]
    next.splice(zug.nachIndex + 1, 0, zug.punkt)
    return next
  }, [drawPoints, zug])

  return (
    <>
      <DrawClickHandler onClick={onMapClick} />

      {drawPoints.length > 0 && (
        <>
          {/* Polygon-Füllung ab 3 Punkten */}
          {umriss.length >= 3 && (
            <Polygon
              positions={umriss.map(p => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: 'hsl(142, 70%, 45%)',
                weight: 2,
                fillColor: 'hsl(142, 70%, 45%)',
                fillOpacity: 0.1,
              }}
            />
          )}

          {/* Verbindungslinien zwischen Punkten */}
          {umriss.length >= 2 && (
            <Polyline
              positions={umriss.map(p => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: 'hsl(142, 70%, 45%)',
                weight: 2.5,
              }}
            />
          )}

          {/* Schliessende gestrichelte Linie (erster ↔ letzter Punkt) ab 3 Punkte */}
          {umriss.length >= 3 && (
            <Polyline
              positions={[
                [umriss[umriss.length - 1].lat, umriss[umriss.length - 1].lng],
                [umriss[0].lat, umriss[0].lng],
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
              - Antippen fügt genau in der Mitte ein (Handy, kleine Ziele).
              - Ziehen fügt dort ein, wo losgelassen wird — der Zwischenpunkt
                wird also in einer Geste zum echten Punkt. Das ist die Erwartung
                vom Desktop und aus jedem Karteneditor.
              Leaflet unterdrückt den click nach einem echten Drag selbst
              (Marker prüft dragging.moved()), es fügt also nicht doppelt ein. */}
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
                  drag: (e) => {
                    const ll = e.target.getLatLng()
                    setZug({ nachIndex: i, punkt: { lat: ll.lat, lng: ll.lng } })
                  },
                  dragend: (e) => {
                    const ll = e.target.getLatLng()
                    setZug(null)
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
