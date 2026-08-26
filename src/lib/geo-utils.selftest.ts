/**
 * Selbsttest für die beiden Geometrie-Parser.
 *
 * **Anlass, und er ist teuer bezahlt** (26.08.2026): `parsePointHex` kannte nur
 * den Hex-Pfad, `parsePolygonHex` beide. PostgREST liefert geometry-Spalten als
 * GeoJSON — die Jagdkarte zeigte deshalb **keinen einzigen** von 32 Ständen,
 * während die Reviergrenze daneben stand. Der Fehler sah aus wie ein Revier
 * ohne Stände; gefunden hat ihn erst ein Mensch, der davorsaß.
 *
 * **Was dieser Test kann und was nicht:** er hält die beiden Parser auf
 * denselben zwei Eingabeformen fest. Er kann NICHT prüfen, was PostgREST
 * tatsächlich schickt — das entscheidet der Server. Genau deshalb müssen beide
 * Formen durchgehen: welche kommt, ist nicht Sache des Clients.
 *
 * Läuft ohne Netz und ohne Bundler:
 *   node --experimental-strip-types src/lib/geo-utils.selftest.ts
 */

import assert from 'node:assert/strict'
import { parsePointHex, parsePolygonHex } from './geo-utils.ts'

/**
 * Sauberg 6 (Hochsitz) aus Testrevier L7 — **echte Bytes aus der Produktion**
 * (`select position::text …`, 26.08.2026), nicht von Hand gebaut.
 *
 * Der erste Anlauf trug einen erfundenen Hex-String und behauptete damit
 * 20.0269° Länge — mitten im Nichts. **Eine Messung, die ihre eigene Annahme
 * einsetzt, belegt die Annahme nicht** (AGENTS.md); ein Parser-Test mit
 * ausgedachten Bytes prüft den Autor, nicht den Parser.
 */
const PUNKT_HEX = '0101000020E610000099F221A81ACD244055185B0872A64A40'
const PUNKT_LNG = 10.400594
const PUNKT_LAT = 53.300355
const PUNKT_GEOJSON = { type: 'Point', coordinates: [PUNKT_LNG, PUNKT_LAT] }

// --- Punkt: beide Formen ergeben dieselbe Koordinate ---
const ausHex = parsePointHex(PUNKT_HEX)
assert.ok(ausHex, 'Hex-Punkt muss geparst werden')
assert.equal(Math.round(ausHex.lng * 1e6) / 1e6, PUNKT_LNG, 'Hex: Länge')
assert.equal(Math.round(ausHex.lat * 1e6) / 1e6, PUNKT_LAT, 'Hex: Breite')

const ausGeoJson = parsePointHex(PUNKT_GEOJSON)
assert.ok(ausGeoJson, 'GeoJSON-Punkt muss geparst werden — das war der Fehler vom 26.08.2026')
assert.equal(ausGeoJson.lng, PUNKT_LNG, 'GeoJSON: Länge (coordinates[0])')
assert.equal(ausGeoJson.lat, PUNKT_LAT, 'GeoJSON: Breite (coordinates[1])')

/**
 * **Beide Wege müssen DENSELBEN Punkt ergeben** — das ist der eigentliche
 * Vertrag. Welche Form PostgREST schickt, entscheidet der Server; für den
 * Aufrufer darf es keinen Unterschied machen.
 */
assert.equal(Math.round(ausHex.lng * 1e6) / 1e6, ausGeoJson.lng, 'Hex und GeoJSON: gleiche Länge')
assert.equal(Math.round(ausHex.lat * 1e6) / 1e6, ausGeoJson.lat, 'Hex und GeoJSON: gleiche Breite')

// **Die Achsenfolge ist der Fehler, der beim Nachbauen passiert.** GeoJSON ist
// [lng, lat]; wer sie vertauscht, setzt Söder in den Indischen Ozean.
assert.notEqual(ausGeoJson.lat, ausGeoJson.lng, 'Breite und Länge dürfen nicht dasselbe sein')
assert.ok(ausGeoJson.lat > ausGeoJson.lng, 'In Niedersachsen ist die Breite größer als die Länge')

// --- Was KEIN Punkt ist, gibt null — und wirft nicht ---
assert.equal(parsePointHex(null), null, 'null')
assert.equal(parsePointHex(undefined), null, 'undefined')
assert.equal(parsePointHex(''), null, 'leerer String')
assert.equal(parsePointHex('0101'), null, 'zu kurzer Hex')
assert.equal(parsePointHex({ type: 'Polygon', coordinates: [] }), null, 'Polygon ist kein Punkt')
assert.equal(parsePointHex({ type: 'Point' }), null, 'Point ohne coordinates')
assert.equal(parsePointHex({ type: 'Point', coordinates: [10] }), null, 'Point mit einer Zahl')
assert.equal(
  parsePointHex({ type: 'Point', coordinates: [NaN, 53.3] }),
  null,
  'NaN ist keine Koordinate — sonst wandert ein Marker ins Nichts, statt zu fehlen',
)

/**
 * --- Was der Hex-Pfad ABLEHNEN muss (Fremdprüfung 26.08.2026, C6/C7) ---
 *
 * **Der gefährlichere Fehler ist nicht das fehlende Ergebnis, sondern das
 * erfundene.** Für den Aufrufer ist ein zurückgegebenes `{lat, lng}` eine
 * Position; ein Marker im Nirgendwo sieht aus wie Wissen, ein fehlender sieht
 * aus wie eine Lücke. Diese vier Fälle kamen bis zum 26.08.2026 als gültige
 * Punkte durch.
 */

// Ein LineString mit denselben Bytes — vorher als Punkt nahe 0/0 gelesen.
const LINESTRING_HEX = '0102000020E610000002000000' + '99F221A81ACD2440' + '55185B0872A64A40' + '99F221A81ACD2440' + '55185B0872A64A40'
assert.equal(parsePointHex(LINESTRING_HEX), null, 'LineString ist kein Punkt')

// Abgeschnittenes EWKB: SRID-Flag gesetzt, aber die Koordinaten fehlen zur Hälfte.
assert.equal(
  parsePointHex('0101000020E610000099F221A81ACD2440'),
  null,
  'zu kurzes SRID-EWKB darf keine Koordinate erfinden',
)

// NaN als IEEE-754-Bytes (0x7FF8000000000000, little endian) in der Länge.
assert.equal(
  parsePointHex('0101000020E6100000000000000000F87F55185B0872A64A40'),
  null,
  'kodiertes NaN ist keine Position — im Hex-Pfad so wenig wie im GeoJSON-Pfad',
)

// Unbekannte Byte-Order.
assert.equal(
  parsePointHex('9901000020E610000099F221A81ACD244055185B0872A64A40'),
  null,
  'fremde Byte-Order',
)

// Und die Gegenprobe: der echte Punkt geht weiterhin durch (kein Überschießen).
assert.ok(parsePointHex(PUNKT_HEX), 'die Härtung darf den gültigen Fall nicht mitnehmen')

// --- Polygon: derselbe Vertrag, beide Formen ---
const RING_GEOJSON = {
  type: 'Polygon',
  coordinates: [[[10.40, 53.30], [10.42, 53.30], [10.42, 53.31], [10.40, 53.30]]],
}
const ringe = parsePolygonHex(RING_GEOJSON)
assert.ok(ringe, 'GeoJSON-Polygon muss geparst werden')
assert.equal(ringe.length, 1, 'ein Ring')
assert.deepEqual(ringe[0][0], [53.30, 10.40], 'Polygon: [lat, lng] für Leaflet')
assert.equal(parsePolygonHex({ type: 'Point', coordinates: [10, 53] }), null, 'Punkt ist kein Polygon')
assert.equal(parsePolygonHex(null), null, 'null')

console.log('geo-utils: beide Parser nehmen Hex UND GeoJSON')
