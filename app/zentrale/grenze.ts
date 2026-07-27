/**
 * Die reine Logik hinter „Reviergrenze bearbeiten".
 *
 * Bewusst **ohne jeden Import** — dadurch mit
 * `node --experimental-strip-types app/zentrale/grenze.selftest.ts` prüfbar, ohne
 * Pfad-Alias, Env oder Netz. Dasselbe Muster wie `schreiben.ts`.
 */

export type Punkt = { lat: number; lng: number }

/**
 * Ein Ring? Der Zeichen-Hook (`useBoundaryEditor.startEditing`) nimmt nur
 * `existingBoundary[0]` und speichert am Ende ein einringiges Polygon — eine
 * Grenze mit Enklave würde beim Bearbeiten still ihre Löcher verlieren
 * (Backlog E-R4). Statt sie zu verlieren, verweigert das Portal das Bearbeiten.
 *
 * `null` (keine Grenze) ist unbedenklich: da ist nichts zu verlieren.
 */
export function nurEinRing(grenze: [number, number][][] | null): boolean {
  return !grenze || grenze.length <= 1
}

/** Zwei Strecken kreuzen sich echt (Berührung in einem Endpunkt zählt nicht). */
function kreuzen(a1: Punkt, a2: Punkt, b1: Punkt, b2: Punkt): boolean {
  // Vorzeichen der Fläche des Dreiecks (p,q,r) — links/rechts von pq.
  const seite = (p: Punkt, q: Punkt, r: Punkt) =>
    (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng)

  const d1 = seite(a1, a2, b1)
  const d2 = seite(a1, a2, b2)
  const d3 = seite(b1, b2, a1)
  const d4 = seite(b1, b2, a2)

  // Echte Kreuzung: beide Strecken trennen die Endpunkte der anderen.
  // ponytail: kollineare Überlappung wird nicht erkannt. Aus Mausklicks entsteht
  // sie praktisch nicht, und PostGIS nimmt sie an — wer sie braucht, prüft
  // serverseitig mit ST_IsValid.
  return d1 * d2 < 0 && d3 * d4 < 0
}

/**
 * Prüft einen Grenzentwurf. Gibt eine Meldung für den Bildschirm zurück, oder
 * `null`, wenn er gespeichert werden darf.
 *
 * Grund für die Überschneidungsprüfung: PostGIS nimmt ein sich selbst
 * schneidendes Polygon an, aber `ST_Area` und Enthaltensein-Tests werden danach
 * unsinnig — die Fläche wäre falsch und „liegt der Stand im Revier" nicht mehr
 * beantwortbar. Lieber vor dem Speichern ablehnen (Backlog E-R5 war genau diese
 * fehlende Prüfung im mobilen Pfad).
 */
export function pruefeGrenze(punkte: Punkt[]): string | null {
  if (punkte.length < 3) {
    return `Eine Grenze braucht mindestens 3 Punkte — gesetzt sind ${punkte.length}.`
  }

  const n = punkte.length
  for (let i = 0; i < n; i++) {
    const a1 = punkte[i]
    const a2 = punkte[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      // Benachbarte Kanten teilen einen Punkt und „kreuzen" sich dort nicht.
      if (j === i + 1) continue
      if (i === 0 && j === n - 1) continue
      if (kreuzen(a1, a2, punkte[j], punkte[(j + 1) % n])) {
        return 'Die Grenze überschneidet sich selbst. Punkte entwirren, dann speichern.'
      }
    }
  }
  return null
}

/**
 * Baut das EWKT für die `districts.boundary`-Spalte.
 *
 * Zwei Fallen, beide aus AGENTS.md:
 * - PostgREST **liefert** Geometrie als GeoJSON/Hex, **nimmt** aber EWKT-Strings.
 *   Der alte `gpx-importer` schickte ein GeoJSON-Objekt — das ist der Grund, warum
 *   sein Schreibpfad nicht funktionierte.
 * - WKT ist `lng lat`, nicht `lat lng`. Vertauscht landet Reppenstedt im
 *   Indischen Ozean.
 */
export function ewktAus(punkte: Punkt[]): string {
  const ring = [...punkte, punkte[0]] // Ring schließen
  const koordinaten = ring.map((p) => `${p.lng} ${p.lat}`).join(', ')
  return `SRID=4326;POLYGON((${koordinaten}))`
}
