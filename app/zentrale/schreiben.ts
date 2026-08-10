/**
 * Eine Tür für jeden schreibenden Zugriff der Revierzentrale.
 *
 * Sie schließt ein Loch, das sonst in jedem Aufrufer einzeln vergessen wird:
 * **ein Write, der 0 Zeilen trifft, ist ein Fehler und kein Erfolg.** PostgREST
 * liefert bei RLS-gefilterten 0 Zeilen `{ data: null, error: null }`. Genau
 * daran sind in der PWA vier Schreibpfade jahrelang still vorbeigelaufen
 * (Backlog E-R1, behoben 29.07.2026); das Portal fängt es seit Phase 3 an einer
 * Stelle ab.
 *
 * **Die R3-Allowlist ist am 29.07.2026 weggefallen** (Entscheidung Moritz):
 * Phase 3 ist abgenommen, und vor dem Testlauf mit Freunden sollen alle Reviere
 * bearbeitbar sein. Sie war ein Entwicklungsriegel, kein Produktmerkmal — die
 * echte Berechtigungsgrenze war immer RLS. `/zentrale` lädt ohnehin nur Reviere
 * mit `owner_id = <angemeldeter Nutzer>` (siehe `page.tsx`), es gab also nie
 * einen Weg, ein fremdes Revier auch nur anzuzeigen.
 *
 * Bewusst **ohne jeden Import**: dadurch ist die Datei mit
 * `node --experimental-strip-types` prüfbar (siehe `schreiben.selftest.ts`), ohne
 * Pfad-Alias, Env-Variablen oder Netz. Den Supabase-Client baut der Aufrufer und
 * schließt ihn in den Thunk ein:
 *
 *     await schreibe('Reviergrenze', () =>
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
 * Deutet ein PostgREST-Write-Ergebnis, oder wirft.
 *
 * Gegenstück zu `geladen()` in `page.tsx`: lieber nichts anzeigen als eine
 * falsche Zahl — hier lieber laut scheitern als einen Erfolg melden, den es
 * nicht gab.
 */
export function ausWriteErgebnis<T>({ data, error }: WriteErgebnis<T>, was: string): T {
  if (error) {
    throw new Error(`${was} konnte nicht geschrieben werden: ${error.message}`)
  }
  if (!data || data.length === 0) {
    // „geschrieben" statt „gespeichert", und „gibt es nicht (mehr)" als erste
    // Ursache: seit Schritt 3c läuft auch ein DELETE hier durch, und für den
    // war beides falsch. „Gespeichert" beschreibt kein Löschen, und der
    // häufigste 0-Zeilen-Fall eines DELETE ist nicht RLS, sondern eine Zeile,
    // die die Feld-App schon entfernt hat. Wer dann „eine RLS-Policy" liest,
    // sucht eine Berechtigung, die nie gefehlt hat.
    throw new Error(
      `${was} wurde nicht geschrieben: kein Datensatz betroffen. Entweder gibt es ` +
        'die Zeile nicht (mehr), es greift eine RLS-Policy, oder dem Aufruf fehlt ' +
        '.select().',
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
 * Seit dem Wegfall der R3-Allowlist ist das nur noch die Ergebnisdeutung — der
 * Parameter `revierId` ist mit dem Guard verschwunden, statt als toter Wert
 * stehenzubleiben. Ein Argument, das niemand mehr liest, sieht beim nächsten
 * Lesen wie eine Prüfung aus, die es nicht gibt.
 *
 * Die Funktion bleibt trotzdem: sie ist die eine Stelle, an der „0 Zeilen
 * betroffen ist ein Fehler" steht, und genau deshalb hat das Portal diesen
 * Fehler nie gehabt.
 */
export async function schreibe<T>(
  was: string,
  ausfuehren: () => PromiseLike<WriteErgebnis<T>>,
): Promise<T> {
  return ausWriteErgebnis(await ausfuehren(), was)
}

/**
 * Dasselbe für einen Write, der mehrere Zeilen auf einmal trifft.
 *
 * **Eine eigene Funktion, keine Lockerung von `ausWriteErgebnis`** — der
 * `ponytail:`-Marker dort sagt genau das voraus, und der erste Aufrufer ist
 * Phase 4b: die Standmenge eines Treibens wird als Bündel geschrieben
 * (`hunt_drive_stands`), ein Stand je Zeile. Die Einzeiler-Prüfung
 * beizubehalten heißt, dass ein zweiter betroffener Datensatz weiterhin ein
 * Fehler ist, wo er einer ist.
 *
 * **`erwartet` ist der eigentliche Riegel und der Grund, warum es nicht
 * `data.length > 0` heißt.** Wer nur auf „mehr als null" prüft, meldet vier von
 * zwanzig betroffenen Ständen als Erfolg — und der Jagdleiter sieht am Abend
 * vor der Jagd eine Standmenge, die er so nie gesetzt hat. Genau die Klasse
 * Fehler, gegen die diese Datei existiert.
 *
 * **Wogegen der Riegel WIRKLICH wirkt, und die erste Fassung schrieb hier etwas
 * Falsches** (Schlusslesung 10.08.2026, 10a): sie behauptete, ein Bündel-Insert
 * über RLS sei „kein Alles-oder-nichts, PostgREST liefert zurück, was durchkam".
 * Das stimmt nicht — ein mehrzeiliges INSERT ist EIN Statement und damit atomar;
 * eine WITH-CHECK-Verletzung bricht die ganze Anweisung mit `42501` ab. Zwei
 * andere Fälle bleiben, und für die steht der Riegel:
 *
 * 1. **DELETE mit `.in(...)`** trifft, was noch da ist. Wurde eine Zeile parallel
 *    entfernt, kommen weniger zurück — der einzige Weg, das zu bemerken.
 * 2. **Das `RETURNING` läuft durch die SELECT-Policy.** Wer schreiben, aber nicht
 *    lesen darf, bekommt eine kleinere Zahl zurück, als er geschrieben hat. Das
 *    meldet dann fälschlich einen Fehlschlag — laut und ohne Datenverlust, und
 *    besser als ein stiller Teilerfolg.
 *
 * `.select()` bleibt Pflicht, aus demselben Grund wie oben.
 */
export async function schreibeViele<T>(
  was: string,
  erwartet: number,
  ausfuehren: () => PromiseLike<WriteErgebnis<T>>,
): Promise<T[]> {
  const { data, error } = await ausfuehren()
  if (error) {
    throw new Error(`${was} konnte nicht geschrieben werden: ${error.message}`)
  }
  const zeilen = data ?? []
  if (zeilen.length !== erwartet) {
    throw new Error(
      `${was}: ${zeilen.length} von ${erwartet} Datensätzen betroffen. Entweder gibt es ` +
        'eine der Zeilen nicht (mehr), es greift eine RLS-Policy, oder dem Aufruf fehlt ' +
        '.select().',
    )
  }
  return zeilen
}
