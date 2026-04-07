'use client'

import { Circle, CircleMarker } from 'react-leaflet'

interface OwnPositionMarkerProps {
  position: { lat: number; lng: number }
  accuracy: number | null
}

/**
 * Eigene GPS-Position: Accuracy-Kreis + pulsierender blauer Punkt.
 * Zeigt sofort den ersten Fix — Genauigkeit wird über den Kreis kommuniziert.
 *
 * Visuelle Stufen:
 * - Accuracy >30m:  Dot 70% Opacity, großer Kreis
 * - Accuracy 10–30m: Dot 100% Opacity, mittlerer Kreis
 * - Accuracy <10m:  Dot 100% Opacity + Pulse, kleiner Kreis
 */
export default function OwnPositionMarker({ position, accuracy }: OwnPositionMarkerProps) {
  const center: [number, number] = [position.lat, position.lng]
  const acc = accuracy ?? 999

  // Opacity-Stufen basierend auf Genauigkeit
  const dotOpacity = acc > 30 ? 0.7 : 1
  const ringOpacity = acc > 30 ? 0.25 : 0.4
  const ringFill = acc > 30 ? 0.08 : 0.15

  // Pulse-Klasse nur bei guter Genauigkeit
  const pulseClass = acc <= 10 ? 'gps-pulse' : ''

  return (
    <>
      {/* Accuracy-Kreis */}
      {accuracy != null && accuracy > 0 && (
        <Circle
          center={center}
          radius={accuracy}
          pathOptions={{
            color: `rgba(66, 165, 245, 0.3)`,
            fillColor: `rgba(66, 165, 245, 0.1)`,
            fillOpacity: 1,
            weight: 1,
          }}
        />
      )}

      {/* Äußerer Puls-Ring */}
      <CircleMarker
        center={center}
        radius={12}
        pathOptions={{
          color: `rgba(66, 165, 245, ${ringOpacity})`,
          fillColor: `rgba(66, 165, 245, ${ringFill})`,
          fillOpacity: 1,
          weight: 2,
        }}
        className={pulseClass}
      />

      {/* Innerer Punkt */}
      <CircleMarker
        center={center}
        radius={6}
        pathOptions={{
          color: '#ffffff',
          fillColor: '#42A5F5',
          fillOpacity: dotOpacity,
          weight: 2,
        }}
      />
    </>
  )
}
