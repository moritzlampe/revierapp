import { parsePointHex } from '@/lib/geo-utils'

/**
 * `map_objects.position` → Kartenkoordinate.
 *
 * PostgREST liefert geometry als GeoJSON; der Hex-Pfad ist der Fallback für
 * andere Aufrufer (dieselbe Asymmetrie wie in `parsePolygonHex`).
 *
 * **Warum eine eigene Datei, und zwar beim ZWEITEN Aufrufer statt beim
 * vierten:** die Funktion stand lokal in `revier/page.tsx` und war schon einmal
 * umgezogen, als die Übersicht ihre Karte abgab. Mit der Treiben-Karte (4b) hat
 * sie zwei Aufrufer — und anders als ein dreizeiliger Riegel (dort ist die
 * Hausregel „zusammenlegen ab der vierten Kopie", s. `laden.ts`) ist sie ein
 * PARSER mit zwei Zweigen. Zwei Fassungen, die sich im Fallback unterscheiden,
 * lassen auf einer der beiden Karten lautlos Punkte fehlen — das sieht nicht
 * wie ein Fehler aus, sondern wie ein Revier ohne Stände.
 */
export function punktAus(input: unknown): { lat: number; lng: number } | null {
  if (input && typeof input === 'object' && 'type' in input && 'coordinates' in input) {
    const geo = input as { type: string; coordinates: number[] }
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return { lat: geo.coordinates[1], lng: geo.coordinates[0] }
    }
    return null
  }
  return typeof input === 'string' ? parsePointHex(input) : null
}
