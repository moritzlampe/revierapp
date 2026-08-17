/**
 * Eingegebene Namen, auf das reduziert, was man sieht.
 *
 * **Dritte Fassung derselben Regel — deshalb gibt es diese Datei.** Der
 * `ponytail:`-Marker in `jagden/[id]/treiben.ts` hatte die Schwelle genannt:
 * *„Zusammenlegen, sobald eine dritte dazukommt."* Die Standgruppen im
 * Revierbereich sind diese dritte. Vorher standen zwei Fassungen nebeneinander,
 * und sie waren NICHT gleich stark (s. unten).
 *
 * Bewusst ohne Import aus dem Projekt, wie `schreiben.ts` und `treiben.ts`:
 * dadurch mit `node --experimental-strip-types` prüfbar, ohne Bundler und ohne
 * Pfad-Alias (`namen.selftest.ts`).
 */

/**
 * Der eingegebene Name, auf das reduziert, was man sieht.
 *
 * `trim()` allein genügt nicht: es entfernt die Unicode-Kategorie `Zs` (darunter
 * NBSP U+00A0, an dem Migration 111 hängen blieb), **nicht** aber `Cf` — ein
 * eingefügtes ZERO WIDTH SPACE (U+200B) ergäbe `length === 1` und damit einen
 * sichtbar leeren Namen.
 *
 * **`\p{Cf}` statt einer Zeichenliste, und die Liste war nachweislich zu kurz**
 * (Fremdprüfung 10.08.2026, A6): sie deckte U+200B–U+200D und U+FEFF, ließ aber
 * U+2060 WORD JOINER und U+200E LEFT-TO-RIGHT MARK durch — beide unsichtbar,
 * beide ergäben einen optisch leeren Namen. Die Kategorie deckt alle
 * Formatzeichen auf einmal, auch das SOFT HYPHEN U+00AD, und ist dabei KÜRZER
 * als die Aufzählung.
 *
 * **Die kurze Liste stand bis zu diesem Diff im LIVE genutzten Revier-Namen-
 * Feld** (`revier-name.tsx`). Die Zusammenlegung ist dort also keine Kosmetik,
 * sondern eine Verschärfung: drei Zeichenklassen mehr.
 *
 * Das ist zugleich die Antwort auf den Punkt, den Migration 111 offenließ: dort
 * steht der Preis als „eine wachsende Zeichenliste im CHECK". In JavaScript
 * kostet die vollständige Fassung nichts; **SQL kennt kein `\p{Cf}`, der dortige
 * Verzicht bleibt also richtig** — und deshalb ist dieser Riegel ein Client-
 * Riegel, der einen DB-CHECK ergänzt und nicht ersetzt. Ein `curl` kommt
 * weiterhin mit einem NBSP durch (Migration 112, Gegenprobe 4).
 *
 * **`\p{Cf}` allein reicht NICHT, und das hat die Fremdprüfung vom 17.08.2026
 * gefunden (P1):** es gibt sichtbar leere Zeichen, die weder `Cf` noch `Zs`
 * sind und deshalb auch `trim()` überstehen — die vier Hangul-Filler
 * (Kategorie `Lo`, also formal BUCHSTABEN) und das leere Braille-Muster
 * U+2800 (Kategorie `So`). An der Funktion nachgemessen: beide kamen mit
 * `length === 1` durch, ZWSP und NBSP wurden gefangen.
 *
 * **Die Liste ist bekannt, nicht vollständig, und das ist die ehrliche
 * Grenze dieses Riegels.** Unicode kennt weitere Zeichen, die je nach Schriftart
 * nichts malen; eine Liste, die alle fängt, gibt es nicht. Der Riegel hält den
 * VERSEHENTLICH leeren Namen ab (Copy-Paste bringt NBSP und ZWSP mit) und den
 * bekannten absichtlichen. Wer einen wirklich dichten Riegel will, braucht den
 * DB-CHECK — er liegt als eigener Vorgang im Backlog.
 */
/**
 * Die Zeichen, die `sichtbarerName()` entfernt — **exportiert, damit der
 * Byte-Riegel in `namen.selftest.ts` dieselbe Menge prueft statt einer Kopie**
 * (Schlusslesung 17.08.2026, F8). Sie stand kurzzeitig zweimal von Hand da,
 * und genau dieser Drift ist an diesem Vormittag schon einmal passiert.
 */
export const UNSICHTBAR = /[\p{Cf}\u115F\u1160\u3164\uFFA0\u2800]/gu

export function sichtbarerName(entwurf: string): string {
  return entwurf.replace(UNSICHTBAR, '').trim()
}
