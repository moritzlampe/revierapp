import { parsePointHex } from '@/lib/geo-utils'

/**
 * Punkt-Geometrie-Helper für die Tagebuch-Detailseiten.
 *
 * PostgREST serialisiert PostGIS-Spalten je nach Typ unterschiedlich:
 *   - geometry  (kills.position)         → GeoJSON-Objekt { coordinates: [lng, lat] }
 *   - geography (wild_events.location)   → EWKB-Hex-String "0101000020E6100000…"
 * extractLatLng normalisiert ALLE Shapes auf { lat, lng } (Leaflet-Reihenfolge):
 * GeoJSON-Objekt, {lat,lng}-Objekt, GeoJSON-als-JSON-String und EWKB-Hex-String
 * (delegiert an parsePointHex). Damit greift derselbe Helper für Erlegung
 * (geometry) UND Anblick (geography) — die gemeinsame Obermenge der robusten
 * Parser aus map-context.tsx / RevierMap.tsx. Konsolidiert die zuvor in
 * ErlegungDetailContent + AnblickDetailContent duplizierten Inline-Helfer
 * (künftiger 3. Konsument: GesellDetailContent).
 */

export type LatLng = { lat: number; lng: number }

export function extractLatLng(position: unknown): LatLng | null {
  if (!position) return null

  // String-Fall: geography-Spalten kommen als EWKB-Hex-String; GeoJSON kann
  // auch als JSON-Text kommen. Erst JSON versuchen (→ Objekt-Branch via
  // Rekursion), bei Parse-Fehler als Hex behandeln (parsePointHex).
  if (typeof position === 'string') {
    try {
      return extractLatLng(JSON.parse(position))
    } catch {
      return parsePointHex(position)
    }
  }

  if (typeof position !== 'object') return null

  if ('coordinates' in position) {
    const c = (position as { coordinates?: unknown }).coordinates
    if (
      Array.isArray(c) &&
      c.length >= 2 &&
      typeof c[0] === 'number' &&
      typeof c[1] === 'number'
    ) {
      // GeoJSON Point: [lng, lat]
      return { lat: c[1], lng: c[0] }
    }
  }
  if ('lat' in position && 'lng' in position) {
    const p = position as { lat?: unknown; lng?: unknown }
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      return { lat: p.lat, lng: p.lng }
    }
  }
  return null
}
