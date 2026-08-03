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
