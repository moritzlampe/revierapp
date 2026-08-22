/**
 * Der Lesepfad der Revierzentrale — Gegenstück zu `schreiben.ts`.
 *
 * Bis zum 03.08.2026 stand `geladen()` dreimal wortgleich in den Seiten
 * (`page.tsx`, `gaeste/page.tsx`, `jagderlaubnisse/page.tsx`), mit einem
 * `ponytail:`-Marker daran: "Zusammenlegen, sobald eine vierte dazukommt —
 * dann ist es ein Muster und kein Zufall." Die Jagden-Seite war die vierte.
 */

/** Was PostgREST beim Lesen zurückgibt, auf das reduziert, was hier zählt. */
export interface LeseErgebnis {
  data: unknown
  error: { message: string } | null
}

/** Dasselbe, plus dem Zähler aus `{ count: 'exact' }`. */
export interface ZaehlErgebnis extends LeseErgebnis {
  count: number | null
}

/** Server-Default von PostgREST. Wer ihn genau trifft, ist verdächtig. */
export const POSTGREST_LIMIT = 1000

/**
 * Deutet ein Leseergebnis, oder wirft.
 *
 * Die Haltung ist die des Portals insgesamt: **lieber nichts anzeigen als eine
 * falsche Zahl.** Ein verschluckter Ladefehler wird sonst zu einer leeren
 * Liste, und eine leere Liste liest sich wie eine gültige Auskunft ("keine
 * Jagden") statt wie das, was sie ist ("nicht geladen").
 *
 * Kein Gegenstück zur 0-Zeilen-Prüfung aus `schreiben.ts`: beim Lesen ist
 * "nichts da" ein legitimes Ergebnis, beim Schreiben nie.
 */
export function geladen<T>({ data, error }: LeseErgebnis, was: string): T {
  if (error) throw new Error(`${was} konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as T
}

/**
 * Wie `geladen()`, prüft zusätzlich auf stille Abschneidung. Für jede Abfrage
 * mit `{ count: 'exact' }` und ohne Paginierung.
 *
 * **PostgREST schneidet bei Überschreitung des Server-Limits bei 1000 Zeilen
 * ab.** Es sagt das durchaus — per HTTP 206 und `Content-Range` —, aber
 * **supabase-js macht daraus keinen `error`**: die Antwort kommt als Erfolg an,
 * `geladen()` sieht nichts, und die Seite zeigt eine zu kleine Zahl. In einem
 * Streckenbuch oder über Geld ist das schlimmer als ein Fehler, weil es sich
 * wie eine Auskunft liest. Genau deshalb muss der Riegel im Client stehen.
 *
 * **Zwei Riegel, weil der erste fail-OPEN ist** (Fremdprüfung 07.08.2026, P1):
 * ohne brauchbaren Zähler greift der Vergleich lautlos nicht mehr. Der zweite
 * hängt an nichts als der Zeilenzahl selbst.
 *
 * **Der zweite läuft NUR, wenn der erste nicht laufen konnte** (Fremdprüfung
 * 08.08.2026, F2). Liegt ein Zähler vor und stimmt er mit der Zeilenzahl
 * überein, ist die Antwort nachweislich vollständig; ein Verdacht allein aus
 * der Zeilenzahl wäre dann ein Fehlalarm, der eine korrekte Seite abschösse.
 * Der erste Entwurf prüfte beides immer und hätte `count = length = 1001`
 * abgewiesen.
 *
 * **`Number.isFinite`, nicht `!= null` — und das ist der Unterschied zwischen
 * Riegel und Deko** (Schlusslesung 08.08.2026): supabase-js rechnet
 * `count = parseInt(contentRange[1])` **ohne Prüfung**
 * (`postgrest-js/dist/index.cjs:128`). Bei `Content-Range: 0-999/*` ist das
 * **NaN, nicht null**. `NaN != null` ist wahr, `length < NaN` ist falsch — der
 * frühe `return` hätte den zweiten Riegel also genau dann übersprungen, wenn
 * der erste unbrauchbar ist. Mit `!= null` war diese Fassung an dieser einen
 * Eingabe **schwächer** als der handgebaute Riegel, den sie ersetzt.
 *
 * **Der Preis des zweiten Riegels bleibt und steht hier, statt behauptet zu
 * werden:** ein legitim vollständiger Bestand von 1000 oder mehr Zeilen OHNE
 * Zähler wird abgewiesen. Dann ist ohnehin Paginierung fällig.
 *
 * ponytail: der zweite Riegel kennt genau EINE Grenze (1000, den
 * PostgREST-Default). Stünde `db-max-rows` auf dem Server niedriger, ginge
 * eine Abschneidung bei z. B. 500 ohne Zähler durch beide Riegel. Heute
 * unerreichbar — Supabase fährt den Default; fällig, wenn jemand ihn senkt.
 *
 * **Nur für Listen und nur für `count: 'exact'`.** Bei `.single()` ist `data`
 * kein Array, `zeilen.length` damit `undefined`, und beide Vergleiche laufen
 * wirkungslos durch. Bei `count: 'planned'|'estimated'` ist der Zähler eine
 * Schätzung, die unterschätzen darf — dann greift Riegel 1 nicht und Riegel 2
 * ist schon übersprungen. Weder Typ noch Name erzwingen das; der Aufrufer muss
 * es wissen. **Und `T` ist das ZEILEN-Typ, nicht der Listentyp**
 * (`vollstaendig<Zahlung>`, nicht `<Zahlung[]>` — anders als bei `geladen()`
 * eine Zeile höher). `vollstaendig<Zahlung[]>` typprüft sauber durch und
 * ergibt lautlos `Zahlung[][]`.
 *
 * Stand 08.08.2026 stand dieser Riegel dreimal von Hand da, in drei
 * verschiedenen Stärken: **vollständig** nur in `dokumentation/page.tsx`; in
 * `gaeste` ohne den zweiten Riegel; und in `jagderlaubnisse` als
 * `(count ?? 0) > length`, das bei fehlendem Zähler **konstruktionsbedingt nie
 * feuern konnte** — die dritte Kopie war die schwächste, und das ist die
 * interessantere Tatsache als der fehlende zweite Riegel. Genau davor warnte
 * die Übergabe zu A-C4: „Wer das A-C3-Muster kopiert, kopiert die Lücke mit."
 *
 * **Es gibt in der Zentrale eine VIERTE Stelle mit einer anderen Strategie,
 * und sie bleibt bewusst dort:** `jagden/page.tsx:121/213` deckelt per
 * `.limit(1000)` und weist das Erreichen mit einem **Banner** aus, statt zu
 * werfen. Eine Jagdliste, die zu viele Zeilen hat, ist noch benutzbar; eine
 * Summe, die zu klein ist, nicht. Zwei Strategien an vier Stellen sind hier
 * also kein Versehen — wer sie vereinheitlicht, nimmt der Jagdliste etwas weg.
 */
export function vollstaendig<T>(antwort: ZaehlErgebnis, was: string): T[] {
  const zeilen = geladen<T[]>(antwort, was)
  const { count } = antwort
  // `count != null` allein genügt nicht — NaN käme durch, s. oben.
  if (count != null && Number.isFinite(count)) {
    if (zeilen.length < count) {
      throw new Error(
        `${was}: ${zeilen.length} von ${count} Zeilen geladen — PostgREST hat ` +
          `abgeschnitten. Ab hier braucht der Screen Paginierung oder eine Aggregat-View.`
      )
    }
    return zeilen
  }
  if (zeilen.length >= POSTGREST_LIMIT) {
    throw new Error(
      `${was}: ${zeilen.length} Zeilen ohne Zähler — das ist der PostgREST-Default und damit ` +
        `vermutlich abgeschnitten. Ab hier braucht der Screen Paginierung oder eine Aggregat-View.`
    )
  }
  return zeilen
}
