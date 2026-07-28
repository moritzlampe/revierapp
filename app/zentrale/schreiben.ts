/**
 * Eine Tür für jeden schreibenden Zugriff der Revierzentrale.
 *
 * Sie schließt zwei Löcher, die sonst in jedem Aufrufer einzeln vergessen werden:
 *
 * 1. **R3** — geschrieben wird nur gegen ein Testrevier, nie gegen Pilotdaten.
 *    Der Guard steht hier, nicht in der Disziplin des Aufrufers.
 * 2. **Ein Write, der 0 Zeilen trifft, ist ein Fehler und kein Erfolg.**
 *    PostgREST liefert bei RLS-gefilterten 0 Zeilen `{ data: null, error: null }`.
 *    Der Löschpfad der PWA kommentiert diese Falle selbst
 *    (`app/app/du/revier/[id]/revier-content.tsx:450`), während die drei
 *    Update-Pfade daneben hineinlaufen — Backlog E-R1. Das Portal fängt sie an
 *    einer Stelle ab.
 *
 * Bewusst **ohne jeden Import**: dadurch ist die Datei mit
 * `node --experimental-strip-types` prüfbar (siehe `schreiben.selftest.ts`), ohne
 * Pfad-Alias, Env-Variablen oder Netz. Den Supabase-Client baut der Aufrufer und
 * schließt ihn in den Thunk ein:
 *
 *     await schreibe(revierId, 'Reviergrenze', () =>
 *       createClient()
 *         .from('districts')
 *         .update({ boundary: ewkt })
 *         .eq('id', revierId)
 *         .select('id'),
 *     )
 *
 * Das `.select()` ist Pflicht — ohne es ist `data` immer `null`, und dann wirft
 * `ausWriteErgebnis` sofort. Vergessen fällt damit beim ersten Lauf auf statt
 * still zu bleiben.
 */

/** Was PostgREST bei `.select()` zurückgibt, auf das reduziert, was hier zählt. */
export type WriteErgebnis<T> = {
  data: T[] | null
  error: { message: string } | null
}

/**
 * R3-Allowlist. Solange Phase 3 nicht abgenommen ist, darf das Portal nur hier
 * hinein schreiben — lieber ein Fehler beim Entwickeln als eine stille Änderung
 * in Brockwinel.
 *
 * ponytail: harte Allowlist statt Konfiguration, weil es genau einen Wert gibt
 * und er sich einmal ändert. Bei Abnahme von Phase 3 fällt die Liste zusammen
 * mit `pruefeSchreibrevier` in einem Commit weg; bis dahin ist sie die einzige
 * Stelle, die angefasst werden muss.
 */
const SCHREIB_REVIERE = new Set([
  // "Test 5" — 2 Objekte und seit dem 27.07.2026 eine gezeichnete Grenze
  // (7,4 ha, nachgemessen 28.07.2026). Der Zusatz ist nicht nur Buchhaltung:
  // solange das Revier keine Grenze hatte, war ein ganzer Fehlerfall dort
  // unprüfbar — eine interaktive Grenzfläche schluckt den Kartenklick.
  'ec27bd95-c8bc-48fc-ac87-da9914d09033',
])

export function darfSchreiben(revierId: string): boolean {
  return SCHREIB_REVIERE.has(revierId)
}

export function pruefeSchreibrevier(revierId: string): void {
  if (!darfSchreiben(revierId)) {
    throw new Error(
      `Schreiben in dieses Revier ist gesperrt (${revierId}). Die Revierzentrale ` +
        'schreibt bis zur Abnahme von Phase 3 nur gegen ein Testrevier (R3).',
    )
  }
}

/**
 * Deutet ein PostgREST-Write-Ergebnis, oder wirft.
 *
 * Gegenstück zu `geladen()` in `page.tsx`: lieber nichts anzeigen als eine
 * falsche Zahl — hier lieber laut scheitern als einen Erfolg melden, den es
 * nicht gab.
 */
export function ausWriteErgebnis<T>({ data, error }: WriteErgebnis<T>, was: string): T {
  if (error) {
    throw new Error(`${was} konnte nicht gespeichert werden: ${error.message}`)
  }
  if (!data || data.length === 0) {
    throw new Error(
      `${was} wurde nicht gespeichert: kein Datensatz betroffen. Entweder greift ` +
        'eine RLS-Policy, die ID stimmt nicht, oder dem Aufruf fehlt .select().',
    )
  }
  // Mehr als eine Zeile heißt: die Einschränkung fehlt (z. B. kein .eq('id', …)).
  // Der Schaden ist dann schon passiert — aber lieber laut als unbemerkt.
  // ponytail: Phase 3 schreibt ausschließlich einzeilig. Braucht ein späterer
  // Aufrufer Mehrzeiler, bekommt er eine eigene Funktion, nicht eine Lockerung
  // dieser hier.
  if (data.length > 1) {
    throw new Error(
      `${was}: ${data.length} Datensätze betroffen, erwartet war genau einer. ` +
        'Fehlt eine Einschränkung auf die ID?',
    )
  }
  return data[0]
}

/**
 * Der einzige Weg, aus der Revierzentrale zu schreiben.
 *
 * Prüft zuerst R3 und führt den Thunk nur dann aus — der Guard ist ein Tor, kein
 * Nachtest. Danach wird das Ergebnis gedeutet oder es wirft.
 */
export async function schreibe<T>(
  revierId: string,
  was: string,
  ausfuehren: () => PromiseLike<WriteErgebnis<T>>,
): Promise<T> {
  pruefeSchreibrevier(revierId)
  return ausWriteErgebnis(await ausfuehren(), was)
}
