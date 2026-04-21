'use client'

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { Circle, useMap } from 'react-leaflet'
import L from 'leaflet'

export interface OwnPositionMarkerHandle {
  /** Heading in Grad (0=Nord, clockwise) direkt am DOM setzen — rAF-safe */
  setHeading: (deg: number) => void
  /** Kegel ausblenden */
  clearHeading: () => void
}

interface OwnPositionMarkerProps {
  position: { lat: number; lng: number }
  accuracy: number | null
  /** Kegel initial sichtbar? (wenn false → display:none bis setHeading) */
  compassEnabled?: boolean
}

// SVG-Größe: muss groß genug sein für 40px Kegel-Radius + Dot
const SVG_SIZE = 100
const DOT_R = 6
const DOT_STROKE = 2
const RING_R = 12
const CONE_LENGTH = 40
const CONE_HALF_ANGLE = 30 // 60° Öffnung

/**
 * Eigene GPS-Position: Accuracy-Kreis + blauer Punkt + optionaler Sichtkegel.
 *
 * Visuelle Stufen (identisch zu vorheriger CircleMarker-Version):
 * - Accuracy >30m:  Dot 70% Opacity, großer Kreis
 * - Accuracy 10–30m: Dot 100% Opacity, mittlerer Kreis
 * - Accuracy <10m:  Dot 100% Opacity + Pulse, kleiner Kreis
 *
 * Kegel-Rotation erfolgt NICHT über React-State sondern via
 * imperativer setHeading()-Methode (Ref + DOM-Transform).
 */
const OwnPositionMarker = forwardRef<OwnPositionMarkerHandle, OwnPositionMarkerProps>(
  function OwnPositionMarker({ position, accuracy, compassEnabled = false }, ref) {
    const map = useMap()
    const markerRef = useRef<L.Marker | null>(null)
    const coneRef = useRef<SVGGElement | null>(null)
    const center: [number, number] = [position.lat, position.lng]
    const acc = accuracy ?? 999

    // Opacity-Stufen basierend auf Genauigkeit
    const dotOpacity = acc > 30 ? 0.7 : 1
    const ringOpacity = acc > 30 ? 0.25 : 0.4
    const ringFill = acc > 30 ? 0.08 : 0.15
    const pulseClass = acc <= 10 ? 'gps-pulse' : ''

    // Kegel-Pfad berechnen (Dreieck von Mitte nach oben)
    const cx = SVG_SIZE / 2
    const cy = SVG_SIZE / 2
    const rad1 = ((90 - CONE_HALF_ANGLE) * Math.PI) / 180
    const rad2 = ((90 + CONE_HALF_ANGLE) * Math.PI) / 180
    const x1 = cx + CONE_LENGTH * Math.cos(rad1)
    const y1 = cy - CONE_LENGTH * Math.sin(rad1)
    const x2 = cx + CONE_LENGTH * Math.cos(rad2)
    const y2 = cy - CONE_LENGTH * Math.sin(rad2)
    const conePath = `M${cx},${cy} L${x1},${y1} A${CONE_LENGTH},${CONE_LENGTH} 0 0,0 ${x2},${y2} Z`

    // SVG-HTML für den Marker. `currentColor` zieht die Farbe aus dem CSS
    // des Containers (.own-position-marker → color: var(--accent-primary)).
    const svgHtml = `
      <svg width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg">
        <g class="compass-cone" style="transform-origin: ${cx}px ${cy}px; display: ${compassEnabled ? 'block' : 'none'};">
          <path d="${conePath}" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-opacity="0.4" stroke-width="0.5" />
        </g>
        <circle cx="${cx}" cy="${cy}" r="${RING_R}" fill="currentColor" fill-opacity="${ringFill}" stroke="currentColor" stroke-opacity="${ringOpacity}" stroke-width="2" class="${pulseClass}" />
        <circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="currentColor" fill-opacity="${dotOpacity}" stroke="#ffffff" stroke-width="${DOT_STROKE}" />
      </svg>`

    // Imperativ: Marker erzeugen / updaten
    useEffect(() => {
      const icon = L.divIcon({
        className: 'own-position-marker',
        html: svgHtml,
        iconSize: [SVG_SIZE, SVG_SIZE],
        iconAnchor: [cx, cy],
      })

      if (!markerRef.current) {
        markerRef.current = L.marker(center, {
          icon,
          interactive: false,
          zIndexOffset: -100,
        }).addTo(map)
      } else {
        markerRef.current.setIcon(icon)
        markerRef.current.setLatLng(center)
      }

      // Cone-Ref greifen
      const el = markerRef.current.getElement()
      if (el) {
        coneRef.current = el.querySelector('.compass-cone') as SVGGElement | null
      }

      return () => {
        // Cleanup nur bei Unmount
      }
    }) // Bei jedem Render updaten (Position, Accuracy, compassEnabled können sich ändern)

    // Cleanup bei Unmount
    useEffect(() => {
      return () => {
        if (markerRef.current) {
          markerRef.current.remove()
          markerRef.current = null
        }
      }
    }, [map])

    // Imperative Handle: setHeading / clearHeading
    useImperativeHandle(ref, () => ({
      setHeading(deg: number) {
        if (coneRef.current) {
          coneRef.current.style.display = 'block'
          coneRef.current.style.transform = `rotate(${deg}deg)`
        }
      },
      clearHeading() {
        if (coneRef.current) {
          coneRef.current.style.display = 'none'
        }
      },
    }), [])

    return (
      <>
        {/* Accuracy-Kreis (als react-leaflet Circle — bleibt SVG-basiert, Radius in Metern) */}
        {accuracy != null && accuracy > 0 && (
          <Circle
            center={center}
            radius={accuracy}
            pathOptions={{
              color: 'var(--accent-primary)',
              opacity: 0.3,
              fillColor: 'var(--accent-primary)',
              fillOpacity: 0.1,
              weight: 1,
            }}
          />
        )}
      </>
    )
  }
)

export default OwnPositionMarker
