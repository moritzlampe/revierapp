/**
 * Ein Name zu einer Kennung — der Typ zu `konto_namen()` (Migration 115).
 *
 * **Warum es diese Datei gibt, und warum sie nur einen Typ enthält.** Der
 * Browser-Client der PWA wird ohne `<Database>` erzeugt
 * (`src/lib/supabase/client.ts`), eine RPC-Antwort kommt also als `any` an.
 * Ohne diesen Typ stünde die Annotation an fünf Aufrufstellen wörtlich
 * gleich da.
 *
 * **Keine Funktion, und das ist Absicht.** Nativ gibt es einen echten Helfer
 * (`quickhunt-native/src/lib/data/konto-namen.ts`); hier ginge das nicht:
 * einer der Aufrufer steht in einem `Promise.all` und braucht die rohe
 * `{ data, error }`-Form (`app/zentrale/jagden/[id]/page.tsx`). Ein Helfer,
 * den ein Aufrufer umgehen muss, ist ein Helfer, der driftet.
 *
 * ## Wofür die Funktion eintritt
 *
 * Bis zum 22.08.2026 gab `profiles_select_authenticated`
 * (`using (auth.role() = 'authenticated')`) jedem Angemeldeten jede
 * Profilzeile mit allen zwölf Spalten — `phone`, `jagdschein_nr`, `waffe`
 * und `kaliber` eingeschlossen (Backlog A-P1). Migration 116 nimmt sie weg;
 * danach sieht man nur noch Profile von Chat-Partnern und Mitjägern
 * derselben beigetretenen Jagd.
 *
 * **Neun Lesepfade in beiden Clients brauchten aber nur EINES davon: den
 * Namen.** Sechs Einladelisten und drei Auflöser, deren Beziehung weder Chat
 * noch Jagd ist — der Aussteller eines Begehungsscheins und der Prüfer eines
 * Standes. Die zweite Gruppe ist ein Befund der Fremdprüfung vom 22.08.2026:
 * **ein Begehungsschein IST die Beziehung, die keine gemeinsame Jagd
 * voraussetzt.** Das ist sein Zweck.
 *
 * `konto_namen()` ist SECURITY DEFINER und gibt genau `id` und
 * `display_name` heraus. **Wer dort eine Spalte ergänzt, macht sie für jeden
 * Angemeldeten über jedes Konto sichtbar** — das ist genau das Loch, das 116
 * schließt.
 *
 * **Ungepagt:** PostgREST kappt eine RPC-Antwort bei 1000 Zeilen, Bestand
 * sind 9 Konten (22.08.2026). Genannt, nicht behoben — fällig mit einer
 * Suche über die Konten.
 *
 * Volle Begründung: `quickhunt-native/docs/migrationen/115_konto_namen.md`.
 */
export type KontoName = { id: string; display_name: string }

/**
 * Wo PostgREST eine ungepagte Antwort abschneidet.
 *
 * Der Server-Default (`db-max-rows`). Wer ihn GENAU trifft, ist verdächtig:
 * eine Antwort mit exakt 1000 Zeilen ist fast nie eine vollständige.
 */
const KONTO_NAMEN_DECKEL = 1000

/**
 * Ist die Antwort von `konto_namen()` vollständig — oder hat PostgREST
 * gekappt?
 *
 * **Ein Prädikat und ausdrücklich KEIN Helfer, der die Folge mitentscheidet.**
 * Das ist die Regel, die im Dateikopf steht („ein Helfer, den ein Aufrufer
 * umgehen muss, ist ein Helfer, der driftet") — und die beiden Aufrufer
 * brauchen hier tatsächlich Verschiedenes:
 *
 * - **Das Portal wirft** (`app/zentrale/revier/page.tsx`). Eine Revier-Auskunft,
 *   die halb stimmt, ist schlimmer als keine; das ist die Haltung von
 *   `laden.ts`, und am Schreibtisch kostet ein Abbruch nichts.
 * - **Die PWA im Wald wirft NICHT** (`app/app/du/revier/[id]/page.tsx`). Dort
 *   ist die Karte der Zweck. Ein Revier-Editor, der sich nicht öffnet, weil ein
 *   Prüfername fehlen KÖNNTE, ist der teurere Fehler — die Namen fallen
 *   stattdessen sämtlich weg, und „ohne Namen" ist die bereits dokumentierte
 *   Bedeutung von „Konto nicht auflösbar".
 *
 * **Warum überhaupt geprüft wird:** `konto_namen()` ist ungepagt und nimmt
 * bewusst KEINEN Parameter — eine übergebene Kennung wäre ein Orakel zum
 * Durchprobieren (dieselbe Entscheidung wie bei `meine_einladungen()`,
 * Migration 080). Es gibt also keinen gefilterten Weg. Ohne diese Prüfung
 * stünde nach dem Kappen bei einer vorhandenen Prüfung „ohne Namen", obwohl
 * der Name abrufbar wäre — eine stille Falschauskunft.
 *
 * **Bestand am 25.08.2026: 9 Konten.** Der Fall ist weit außer Reichweite; er
 * kostet eine Zeile je Aufrufer. **Sechs weitere `konto_namen()`-Leser im Repo
 * prüfen ihn bis heute nicht** — das ist Backlog CP-71, und dies ist das
 * Werkzeug dafür. (Hier stand „fünf"; nachgezählt und korrigiert von der
 * Schlusslesung am 25.08.2026, T8. Das Backlog nannte die richtige Zahl.)
 *
 * Die Zahl selbst ist modulprivat (Ponytail 25.08.2026): eine exportierte
 * Konstante, die niemand von außen liest, ist Fläche ohne Leser.
 */
export function kontoNamenVollstaendig(zeilen: readonly KontoName[]): boolean {
  return zeilen.length < KONTO_NAMEN_DECKEL
}
