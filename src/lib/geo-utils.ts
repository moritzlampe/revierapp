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
export function parsePointHex(hex: string): { lat: number; lng: number } | null {
  if (!hex || hex.length < 42) return null

  try {
    const isLE = hex.substring(0, 2) === '01'

    // Type (4 Bytes) — prüfe ob SRID-Flag gesetzt
    const typeHex = hex.substring(2, 10)
    const typeInt = isLE
      ? parseInt(typeHex.match(/../g)!.reverse().join(''), 16)
      : parseInt(typeHex, 16)

    const hasSRID = (typeInt & 0x20000000) !== 0
    const offset = hasSRID ? 18 : 10

    const x = hexToFloat64(hex.substring(offset, offset + 16), isLE)
    const y = hexToFloat64(hex.substring(offset + 16, offset + 32), isLE)

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
 * PostGIS hex-encoded EWKB Polygon → Array von Ringen als [lat, lng][]
 * Format: byteOrder(1) + type(4) + [srid(4)] + numRings(4) + rings[numPoints(4) + points[x(8)+y(8)]]
 */
export function parsePolygonHex(hex: string): [number, number][][] | null {
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
    console.error('[parsePolygonHex] failed:', err, 'input[0:40]:', hex?.substring(0, 40))
    return null
  }
}
