/**
 * Punkt-Geometrie-Helper für die Tagebuch-Detailseiten.
 *
 * PostgREST liefert PostGIS-geometry-Spalten (kills.position,
 * wild_events.location) als GeoJSON-Point: { coordinates: [lng, lat] }.
 * extractLatLng normalisiert das auf { lat, lng } (Leaflet-Reihenfolge)
 * mit defensivem {lat,lng}-Fallback. Konsolidiert die zuvor in
 * ErlegungDetailContent + AnblickDetailContent byte-gleich duplizierten
 * Inline-Helfer (künftiger 3. Konsument: GesellDetailContent, PointMap).
 */

export type LatLng = { lat: number; lng: number }

export function extractLatLng(position: unknown): LatLng | null {
  if (!position || typeof position !== 'object') return null
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
