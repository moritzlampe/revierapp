/**
 * Fläche eines Polygons in Hektar (Shoelace-Formel mit Breitengrad-Korrektur)
 * Genauigkeit: ±2–5 % — reicht für Revier-Anzeige
 */
export function polygonAreaHectares(points: { lat: number; lng: number }[]): number {
  if (points.length < 3) return 0

  const toRad = (d: number) => d * (Math.PI / 180)
  const R = 6371000 // Erdradius in Metern

  // Mittlerer Breitengrad für Korrektur
  const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const mPerDegLat = (Math.PI / 180) * R
  const mPerDegLng = (Math.PI / 180) * R * Math.cos(toRad(avgLat))

  // Shoelace-Formel in Meter-Koordinaten
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const xi = points[i].lng * mPerDegLng
    const yi = points[i].lat * mPerDegLat
    const xj = points[j].lng * mPerDegLng
    const yj = points[j].lat * mPerDegLat
    area += xi * yj - xj * yi
  }
  area = Math.abs(area) / 2

  return area / 10000 // m² → Hektar
}

/**
 * Haversine-Formel: Entfernung zwischen zwei Koordinaten in Metern
 */
export function distanceInMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000 // Erdradius in Metern
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * PostGIS hex-encoded EWKB Point → { lat, lng }
 * Format: byteOrder(1) + type(4) + [srid(4)] + x(8) + y(8)
 */
export function parsePointHex(input: unknown): { lat: number; lng: number } | null {
  /**
   * **PostgREST liefert geometry-Spalten als GeoJSON-Objekt** — derselbe Zweig
   * wie in `parsePolygonHex`, und er hat hier bis zum 26.08.2026 gefehlt.
   *
   * **Was das gekostet hat, ist gemessen und nicht geschätzt:** die Jagdkarte
   * zeigte für Testrevier L7 **keinen einzigen** der 32 Kartenobjekte — die
   * Reviergrenze daneben schon, weil `parsePolygonHex` den Zweig hat. Moritz
   * am Gerät: *„vll gibt es ja gar keine."* Genau davor warnt der Dateikopf von
   * `app/zentrale/karte-geo.ts`: *„Zwei Fassungen, die sich im Fallback
   * unterscheiden, lassen auf einer der beiden Karten lautlos Punkte fehlen —
   * das sieht nicht wie ein Fehler aus, sondern wie ein Revier ohne Stände."*
   *
   * **Der alte Wächter fing den Fall nicht, er verdeckte ihn:** bei einem
   * Objekt ist `hex.length` `undefined`, und `undefined < 42` ist `false` — der
   * frühe Ausstieg griff also NICHT. Eine Zeile später warf `hex.substring`,
   * der `catch` schluckte den Fehler, und heraus kam `null`. **Ein
   * Typfehler, der sich als „kein Punkt vorhanden" ausgibt.** Das `as string`
   * an der Aufrufstelle (`app/app/hunt/[id]/page.tsx`) hat TypeScript die
   * falsche Annahme durchgehen lassen.
   *
   * **Sechs Aufrufer hatten sich je einen eigenen Vorfilter gebaut**
   * (`punktAus`, `parseObjectPosition`, `RevierMap`, `map-context`,
   * `diary/geo`, `hunt/create`), zwei nicht: die Jagdkarte und der
   * Positions-Snapshot in `useHuntPositions`. Die Fallunterscheidung gehört an
   * DIESE Stelle, dann kann sie kein Aufrufer mehr vergessen. Die vorhandenen
   * Vorfilter bleiben unverändert gültig — sie reichen einen String durch, und
   * genau den nimmt der Hex-Pfad unten.
   */
  if (input && typeof input === 'object' && 'type' in input && 'coordinates' in input) {
    const geo = input as { type: string; coordinates: number[] }
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      const [lng, lat] = geo.coordinates
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      return { lat, lng }
    }
    return null
  }

  const hex = typeof input === 'string' ? input : null
  if (!hex || hex.length < 42) return null

  try {
    /**
     * **Byte-Order, Geometrietyp, Länge und Endlichkeit werden geprüft** —
     * alle vier fehlten bis zum 26.08.2026 (Fremdprüfung C6/C7 `[mittel]`).
     *
     * Was ohne sie durchkam, ist nicht theoretisch: **ein LineString wurde als
     * Punkt nahe 0/0 gelesen**, abgeschnittenes EWKB zu einer erfundenen
     * Koordinate aufgefüllt, und ein kodiertes `NaN` kam als gültiges
     * `{ lat, lng }` zurück. Der Aufrufer kann das nicht mehr erkennen — für
     * ihn ist ein zurückgegebenes Objekt eine Position. **Ein Marker im
     * Nirgendwo ist schlimmer als ein fehlender**, weil er wie Wissen aussieht.
     */
    const order = hex.substring(0, 2)
    if (order !== '01' && order !== '00') return null
    const isLE = order === '01'

    // Type (4 Bytes) — prüfe ob SRID-Flag gesetzt
    const typeHex = hex.substring(2, 10)
    const typeInt = isLE
      ? parseInt(typeHex.match(/../g)!.reverse().join(''), 16)
      : parseInt(typeHex, 16)
    if (!Number.isFinite(typeInt)) return null

    // Die oberen Bits tragen Z/M/SRID-Flags; unten steht der Basistyp.
    // 1 = Point. Alles andere ist kein Punkt, auch wenn Bytes dastehen.
    if ((typeInt & 0x1fffffff) !== 1) return null

    const hasSRID = (typeInt & 0x20000000) !== 0
    const offset = hasSRID ? 18 : 10
    // Ohne diese Prüfung liest `substring` über das Ende hinaus und
    // `hexToFloat64` füllt still auf — aus zu wenig Bytes wird eine Koordinate.
    if (hex.length < offset + 32) return null

    const x = hexToFloat64(hex.substring(offset, offset + 16), isLE)
    const y = hexToFloat64(hex.substring(offset + 16, offset + 32), isLE)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    return { lat: y, lng: x } // PostGIS: x = longitude, y = latitude
  } catch {
    return null
  }
}

function hexToFloat64(hex: string, isLE: boolean): number {
  const bytes = hex.match(/../g)!.map(h => parseInt(h, 16))
  if (isLE) bytes.reverse()
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  bytes.forEach((b, i) => view.setUint8(i, b))
  return view.getFloat64(0)
}

function readUint32Hex(hex: string, charOffset: number, isLE: boolean): number {
  const sub = hex.substring(charOffset, charOffset + 8)
  const bytes = sub.match(/../g)!
  if (isLE) bytes.reverse()
  return parseInt(bytes.join(''), 16)
}

/**
 * PostGIS Polygon → Array von Ringen als [lat, lng][]
 * Akzeptiert BEIDE Formate:
 *   1. GeoJSON-Objekt (PostgREST liefert geometry-Spalten so aus)
 *   2. Hex-encoded EWKB String (Fallback für andere Aufrufer)
 */
export function parsePolygonHex(input: unknown): [number, number][][] | null {
  // PostgREST liefert geometry-Spalten als GeoJSON-Objekt
  if (input && typeof input === 'object' && 'type' in input && 'coordinates' in input) {
    const geo = input as { type: string; coordinates: number[][][] }
    if (geo.type !== 'Polygon' || !Array.isArray(geo.coordinates) || geo.coordinates.length === 0) {
      return null
    }
    // GeoJSON ist [lng, lat], Leaflet will [lat, lng]
    return geo.coordinates.map(ring => {
      if (!Array.isArray(ring) || ring.length < 3) return []
      return ring.map(([lng, lat]) => [lat, lng] as [number, number])
    }).filter(ring => ring.length > 0)
  }

  // Ab hier: bisheriger Hex-Pfad, unverändert
  const hex = typeof input === 'string' ? input : null
  if (!hex || hex.length < 26) return null

  try {
    const isLE = hex.substring(0, 2) === '01'

    const typeHex = hex.substring(2, 10)
    const typeInt = isLE
      ? parseInt(typeHex.match(/../g)!.reverse().join(''), 16)
      : parseInt(typeHex, 16)

    const hasSRID = (typeInt & 0x20000000) !== 0
    let pos = hasSRID ? 18 : 10

    const numRings = readUint32Hex(hex, pos, isLE)
    pos += 8

    const rings: [number, number][][] = []
    for (let r = 0; r < numRings; r++) {
      const numPoints = readUint32Hex(hex, pos, isLE)
      pos += 8
      const ring: [number, number][] = []
      for (let p = 0; p < numPoints; p++) {
        const x = hexToFloat64(hex.substring(pos, pos + 16), isLE)
        const y = hexToFloat64(hex.substring(pos + 16, pos + 32), isLE)
        ring.push([y, x]) // [lat, lng] — PostGIS: x = longitude, y = latitude
        pos += 32
      }
      rings.push(ring)
    }
    return rings
  } catch (err) {
    console.error('[parsePolygonHex] failed:', err, 'inputType:', typeof input)
    return null
  }
}
