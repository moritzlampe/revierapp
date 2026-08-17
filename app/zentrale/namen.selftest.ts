/**
 * Selbsttest zu `namen.ts`. Lauf: `node --experimental-strip-types` (oder
 * `npm run selftest`, das alle fährt).
 *
 * **Jedes unsichtbare Zeichen steht hier als ESCAPE-SEQUENZ, nie als Byte.**
 * Das ist die Lehre vom 08.08. und 10.08.2026 — und sie ist mir beim Schreiben
 * dieser Datei ein DRITTES Mal passiert: die erste Fassung trug `ef bb bf`
 * (U+FEFF) und Geschwister als echte Bytes im Quelltext, per `xxd` belegt.
 *
 * **Der Riegel dagegen steht jetzt UNTEN in dieser Datei und läuft bei jedem
 * `npm run selftest` mit.** Die bis zum 17.08.2026 hier empfohlene Handprobe
 * war untauglich, und zwar auf eine Art, die man nicht sieht: sie lautete
 * `xxd … | grep -E "e2 80|c2 a0|ef bb"` — und traf die eigene Kommentarzeile,
 * weil diese die Hex-Folgen als TEXT nennt. Sie war also NIE leer. Wer sich
 * an den Treffer gewöhnt, übersieht den echten. Dieselbe Fehlerklasse wie
 * „Messung beantwortet die Frage?": die Probe suchte ihre eigene Beschreibung.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sichtbarerName, UNSICHTBAR } from './namen.ts'

// Der Normalfall bleibt unangetastet.
assert.equal(sichtbarerName('Sauberg'), 'Sauberg')
assert.equal(sichtbarerName('  Sehl-Trift  '), 'Sehl-Trift')

// Leerraum, den trim() ohnehin kann.
assert.equal(sichtbarerName(''), '')
assert.equal(sichtbarerName('   '), '')
assert.equal(sichtbarerName('\n\t\r '), '')

// NBSP U+00A0 — Kategorie Zs, faellt unter trim(). Der Grund, warum Migration
// 111 ihn im SQL-CHECK NICHT faengt: dort gibt es kein \p{Cf}, und `btrim`
// kennt nur die Zeichen, die man ihm aufzaehlt.
assert.equal(sichtbarerName('\u00A0'), '', 'NBSP')

// Die vier, die die alte Zeichenliste [-] abdeckte.
assert.equal(sichtbarerName('\u200B'), '', 'ZERO WIDTH SPACE')
assert.equal(sichtbarerName('\u200C'), '', 'ZERO WIDTH NON-JOINER')
assert.equal(sichtbarerName('\u200D'), '', 'ZERO WIDTH JOINER')
assert.equal(sichtbarerName('\uFEFF'), '', 'ZERO WIDTH NO-BREAK SPACE')

// DIE DREI, DIE SIE DURCHLIESS — der Grund fuer \p{Cf}. Ohne diese drei
// Zusicherungen waere die Zusammenlegung eine Umsortierung ohne Gewinn.
assert.equal(sichtbarerName('\u2060'), '', 'WORD JOINER')
assert.equal(sichtbarerName('\u200E'), '', 'LEFT-TO-RIGHT MARK')
assert.equal(sichtbarerName('\u00AD'), '', 'SOFT HYPHEN')

// Gemischt: unsichtbar aussen, echter Text innen.
assert.equal(sichtbarerName('\u200B Sauberg \u2060'), 'Sauberg')

// Formatzeichen MITTEN im Wort verschwinden ebenfalls.
//
// **Was das NICHT leistet, und das ist die Falle fuer den naechsten Aufrufer:**
// die Funktion liefert einen PRUEFWERT, keinen Speicherwert. `revier-name.tsx`
// speichert `sauber` (nur getrimmt) und prueft nur auf `sichtbar` — ein
// angehaengtes ZWSP geht also in die DB. Fuer `districts.name` folgenlos, dort
// gibt es keinen UNIQUE. **Fuer `standgruppen` gibt es einen**
// (`UNIQUE (district_id, name)`, Migration 112): dort stuenden zwei optisch
// identische Gruppennamen nebeneinander, wenn der Bereich es genauso macht.
// Wer Paket B baut, entscheidet das bewusst — speichern, was geprueft wurde,
// ODER die Doppelung in Kauf nehmen. Beides geht, stillschweigend geht nicht.
assert.equal(sichtbarerName('Sau\u200Bberg'), 'Sauberg')

// SICHTBAR LEER, ABER NICHT `Cf` — der Befund der Fremdpruefung vom 17.08.2026
// (P1). Die vier Hangul-Filler fuehrt Unicode als Kategorie `Lo`, also als
// BUCHSTABEN, das leere Braille-Muster als `So`. Weder `\p{Cf}` noch `trim()`
// fasst sie an; vor dem Fix kamen sie mit `length === 1` durch und ergaben
// einen Namen, den man auf dem Schirm nicht sieht.
assert.equal(sichtbarerName('\u115F'), '', 'HANGUL CHOSEONG FILLER')
assert.equal(sichtbarerName('\u1160'), '', 'HANGUL JUNGSEONG FILLER')
assert.equal(sichtbarerName('\u3164'), '', 'HANGUL FILLER')
assert.equal(sichtbarerName('\uFFA0'), '', 'HALFWIDTH HANGUL FILLER')
assert.equal(sichtbarerName('\u2800'), '', 'BRAILLE PATTERN BLANK')
// Und die Positivkontrolle: ein ECHTES Braille-Zeichen ist kein Leerraum.
assert.equal(sichtbarerName('\u2801'), '\u2801', 'BRAILLE A bleibt')

// Ein normaler Name mit Emoji bleibt ganz.
assert.equal(sichtbarerName('Revier \u{1F332}'), 'Revier \u{1F332}')

// GRENZE, BEWUSST UND GEPRUEFT: ein zusammengesetztes Emoji wird zerlegt, weil
// sein Verbinder (ZWJ, U+200D) selbst Kategorie Cf ist. Fuer Revier- und
// Gruppennamen in Kauf genommen — wer Emoji-Familien im Namen braucht, braucht
// eine andere Regel. Die Zusicherung steht hier, damit die Grenze BEKANNT ist
// statt eines Tages als Fehler entdeckt zu werden.
assert.equal(sichtbarerName('\u{1F468}\u200D\u{1F33E}'), '\u{1F468}\u{1F33E}')

// Der Riegel aus dem Dateikopf, als Zusicherung statt als Bitte: keine dieser
// Dateien darf ein unsichtbares Zeichen als BYTE enthalten. Sucht die ZEICHEN,
// nicht ihre Hex-Schreibweise — deshalb kann er sich nicht selbst treffen,
// anders als die frühere `xxd`-Probe.
//
// **Er teilt seine Zeichenmenge mit `sichtbarerName()` — dieselbe Konstante,
// keine Kopie** (Schlusslesung 17.08.2026, F8). Zwei Lehren stecken darin:
// die erste Fassung prüfte nur `\p{Cf}` und ließ genau die Zeichen durch, die
// beim Erweitern der Funktion als echte Bytes in `namen.ts` gerieten — ein
// Riegel, der eine kleinere Menge kennt als die Regel, die er absichert, hat ein
// Loch in der Größe der Differenz. Und die zweite Fassung schrieb die Menge ein
// zweites Mal von Hand hin, also genau den Drift, den die erste erlitten hatte.
//
// **Was er NICHT deckt, ausdrücklich:** die übrigen `Zs`-Zeichen, die `trim()`
// abdeckt (U+2003 EM SPACE etwa). Sie sind sichtbar breit, nicht unsichtbar —
// ein Byte davon im Quelltext ist ein Schönheitsfehler, kein stiller Riegel.
//
// **Drei Dateien, nicht das Repo** (Fremdprüfung 17.08.2026, P4): geprüft wird,
// wo unsichtbare Zeichen als DATEN vorkommen — die beiden hier und der Live-
// Aufrufer, dessen Kommentar eine Zeichenliste zitiert. Eine repo-weite Regel
// wäre ein Lint-Plugin, kein Selbsttest.
for (const datei of ['namen.ts', 'namen.selftest.ts', 'revier-name.tsx']) {
  const quelle = readFileSync(new URL(datei, import.meta.url), 'utf8')
  assert.equal(
    quelle.replace(UNSICHTBAR, ''),
    quelle,
    `${datei}: unsichtbares Zeichen als Byte im Quelltext`,
  )
  // NBSP getrennt, weil `sichtbarerName()` ihn ueber `trim()` faengt und
  // nicht ueber die Zeichenmenge — im QUELLTEXT ist er trotzdem unerwuenscht.
  assert.ok(!quelle.includes('\u00A0'), `${datei}: NBSP als Byte im Quelltext`)
}

console.log('namen.selftest.ts: alle Zusicherungen gehalten')
