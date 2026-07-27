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

/** Vorzeichen der Dreiecksfläche (p,q,r) — auf welcher Seite von pq liegt r. */
function seite(p: Punkt, q: Punkt, r: Punkt): number {
  return (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng)
}

/** r ist kollinear zu pq — liegt r auch innerhalb der Strecke, nicht nur der Gerade? */
function innerhalb(p: Punkt, q: Punkt, r: Punkt): boolean {
  return (
    Math.min(p.lng, q.lng) <= r.lng &&
    r.lng <= Math.max(p.lng, q.lng) &&
    Math.min(p.lat, q.lat) <= r.lat &&
    r.lat <= Math.max(p.lat, q.lat)
  )
}

/**
 * Zwei Strecken kreuzen sich **oder berühren sich**.
 *
 * Die Berührung muss mit hinein: eine erste Fassung prüfte nur echte
 * Durchkreuzungen (`d1*d2 < 0 && d3*d4 < 0`). Zieht man einen Vertex genau auf
 * eine gegenüberliegende Kante, ist eine der Orientierungen dann null und der
 * Fall galt als sauber. Am 27.07.2026 gegen die DB gemessen, was dabei entsteht:
 * PostGIS nennt so ein Polygon `ST_IsValid = false` („Ring Self-intersection"),
 * und die generierte Spalte `area_ha` liefert für ein ~180-ha-Revier **3.718 ha**
 * — eine zwanzigfach falsche Zahl auf der Kennzahlenseite. Deshalb strikt
 * ablehnen.
 *
 * Kollineare Überlappung ist damit gleich mitabgedeckt: bei ihr liegt immer ein
 * Endpunkt der einen Strecke auf der anderen.
 */
function schneidenSich(a1: Punkt, a2: Punkt, b1: Punkt, b2: Punkt): boolean {
  const d1 = seite(a1, a2, b1)
  const d2 = seite(a1, a2, b2)
  const d3 = seite(b1, b2, a1)
  const d4 = seite(b1, b2, a2)

  // Echte Kreuzung: jede Strecke trennt die Endpunkte der anderen.
  if (d1 * d2 < 0 && d3 * d4 < 0) return true

  // Berührung: ein Endpunkt liegt auf der jeweils anderen Strecke.
  if (d1 === 0 && innerhalb(a1, a2, b1)) return true
  if (d2 === 0 && innerhalb(a1, a2, b2)) return true
  if (d3 === 0 && innerhalb(b1, b2, a1)) return true
  if (d4 === 0 && innerhalb(b1, b2, a2)) return true

  return false
}

/**
 * Prüft einen Grenzentwurf. Gibt eine Meldung für den Bildschirm zurück, oder
 * `null`, wenn er gespeichert werden darf.
 *
 * Grund für die Überschneidungsprüfung: PostGIS **nimmt** ein sich selbst
 * schneidendes Polygon an, meldet es aber als ungültig, und die generierte Spalte
 * `area_ha` rechnet dann Unsinn (gemessen: 3.718 ha für ein ~180-ha-Revier).
 * Lieber vor dem Speichern ablehnen — Backlog E-R5 war genau diese fehlende
 * Prüfung im mobilen Pfad.
 *
 * ponytail: nicht geprüft werden Splitter mit fast keiner Fläche (drei Punkte
 * nahezu auf einer Linie). Die sind geodätisch gültig — nachgemessen: PostGIS
 * meldet für drei kollineare Klicks `ST_IsValid = true` mit 2,56 ha — und der
 * Nutzer sieht die Zahl. Unsinnige, aber gültige Eingabe zu verhindern ist nicht
 * Aufgabe dieser Prüfung.
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
      // Benachbarte Kanten teilen einen Punkt — dort ist Berührung normal.
      if (j === i + 1) continue
      if (i === 0 && j === n - 1) continue
      if (schneidenSich(a1, a2, punkte[j], punkte[(j + 1) % n])) {
        return 'Die Grenze überschneidet oder berührt sich selbst. Punkte entwirren, dann speichern.'
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
