// Gegenprobe fuer die Zustandsachse der Wartungssicht. Kein Test-Runner im
// Repo, deshalb ein eigenstaendiges Skript (Muster: handlungsbedarf.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/wartungsfilter.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
// Wird vom Sammel-Script `npm run selftest` per Glob mitgenommen.
import assert from 'node:assert/strict'
import { STUFEN, stufeSichtbar, stufeVon, type ZustandStufe } from './wartungsfilter.ts'

// Alle sechs Ampelwerte aus `wartung.ts`, hier ausgeschrieben statt importiert.
// **Absicht, und die Doppelung ist der Riegel:** waere es derselbe Wert wie im
// Code, koennte ein vergessener Ampelwert in beiden fehlen und der Test bliebe
// gruen. So faellt eine Erweiterung von `Ampel` hier als fehlende Zeile auf —
// und in `wartungsfilter.ts` als Typfehler im `Record`. Zwei unabhaengige
// Melder fuer denselben Fehler.
const ALLE_AMPELN = [
  'offen',
  'ok-voll',
  'ok-hohl',
  'mangel-voll',
  'mangel-hohl',
  'gesperrt',
] as const

// --- Die Faltung: welche Ampel faellt in welche Stufe ---
assert.equal(stufeVon('ok-voll'), 'heil')
assert.equal(stufeVon('ok-hohl'), 'heil', 'Eine Pruefung aus der Vorsaison bleibt ein HEILER Stand')
assert.equal(stufeVon('mangel-voll'), 'mangel')
assert.equal(stufeVon('mangel-hohl'), 'mangel')
assert.equal(stufeVon('gesperrt'), 'gesperrt')
assert.equal(stufeVon('offen'), 'nie', 'Ohne Pruefzeile: „nie geprueft", nicht „heil"')

// **Der Fall, der das ganze Modul rechtfertigt.** `ok-hohl` heisst „heil, aber
// diese Saison nicht angesehen". Faende es sich unter `nie`, wuerde ein Nutzer,
// der nach unbekannten Staenden sucht, Staende bekommen, deren Zustand sehr
// wohl bekannt ist — und die Karte zeigt sie mit gruenem Ring, waehrend der
// Filter sie als ungeprueft ausweist. Ein Filter, der etwas anderes behauptet
// als die Karte darunter zeigt, ist schlimmer als kein Filter.
assert.notEqual(stufeVon('ok-hohl'), stufeVon('offen'))

// --- Vollstaendigkeit: jede Ampel bekommt eine Stufe ---
const bekannt = new Set<ZustandStufe>(STUFEN.map((s) => s.wert))
for (const a of ALLE_AMPELN) {
  const stufe = stufeVon(a)
  assert.ok(stufe !== undefined, `Ampel ${a} hat keine Stufe`)
  assert.ok(bekannt.has(stufe), `Stufe ${stufe} (aus Ampel ${a}) steht nicht in STUFEN`)
}

// --- Und umgekehrt: jede Stufe wird von mindestens einer Ampel getroffen ---
// **Sonst stuende ein Kaestchen in der Legende, das nie etwas filtert.** Genau
// die Bauform, vor der die AGENTS.md an fuenf Stellen warnt: ein Tor, das
// formal nie zuschlaegt, sieht aus wie ein Tor.
for (const s of STUFEN) {
  assert.ok(
    ALLE_AMPELN.some((a) => stufeVon(a) === s.wert),
    `Stufe ${s.wert} wird von keiner Ampel getroffen`,
  )
}

// --- Keine doppelten Stufen in der Anzeigeliste ---
assert.equal(bekannt.size, STUFEN.length, 'STUFEN enthaelt einen Wert doppelt')

// --- stufeSichtbar(): leere Menge heisst „alles" ---
const nichts = new Set<ZustandStufe>()
for (const a of ALLE_AMPELN) {
  assert.equal(stufeSichtbar(a, nichts), true, `${a} muss ohne Filter sichtbar sein`)
}

// --- Abwaehlen trifft BEIDE Saisonvarianten ---
// Der eigentliche Zweck der Faltung: wer „Heil" abwaehlt, meint auch die
// Staende, die im Vorjahr heil befunden wurden. Vor der Faltung haette man
// zwei Kaestchen abhaken muessen, ohne zu wissen, dass es zwei sind.
const ohneHeil = new Set<ZustandStufe>(['heil'])
assert.equal(stufeSichtbar('ok-voll', ohneHeil), false)
assert.equal(stufeSichtbar('ok-hohl', ohneHeil), false)
assert.equal(stufeSichtbar('gesperrt', ohneHeil), true, 'Abwaehlen darf nur die eigene Stufe treffen')
assert.equal(stufeSichtbar('offen', ohneHeil), true)

const ohneMangel = new Set<ZustandStufe>(['mangel'])
assert.equal(stufeSichtbar('mangel-voll', ohneMangel), false)
assert.equal(stufeSichtbar('mangel-hohl', ohneMangel), false)
assert.equal(stufeSichtbar('ok-voll', ohneMangel), true)

// --- „Zeig mir nur die Gesperrten" — der Hauptanwendungsfall ---
// Alles abgewaehlt ausser `gesperrt`: von sechs Ampeln bleibt genau eine.
const nurGesperrt = new Set<ZustandStufe>(['heil', 'mangel', 'nie'])
const sichtbar = ALLE_AMPELN.filter((a) => stufeSichtbar(a, nurGesperrt))
assert.deepEqual(sichtbar, ['gesperrt'])

// --- Alles abgewaehlt: die Karte ist leer, und das ist erlaubt ---
// **Kein Riegel dagegen, bewusst.** Eine leere Karte ist die ehrliche Antwort
// auf „zeig mir nichts" und sofort selbst erklaerend — die Kaestchen stehen
// daneben und sind alle leer. Ein erzwungenes Minimum („mindestens eins muss
// an bleiben") waere eine Bedienregel, die man erst durch Anstossen lernt.
const alles = new Set<ZustandStufe>(STUFEN.map((s) => s.wert))
assert.equal(ALLE_AMPELN.filter((a) => stufeSichtbar(a, alles)).length, 0)

// --- Wert, Wort und Reihenfolge liegen fest ---
// **Der Test prueft bis hierher nur die MENGE der Stufen, nicht ihre
// Beschriftung** (Fremdpruefung 26.08.2026, `[low]`): vertauschte man „Heil"
// und „Mangel", bliebe alles oben gruen, und die Oberflaeche filterte unter
// jedem Label die jeweils andere Stufe. Ein Test, der die Abdeckung prueft und
// die Zuordnung nicht, ist gegen genau den Fehler blind, der dem Nutzer
// begegnet.
//
// **Der `titel` steht mit im Vergleich, nicht nur als Nicht-Leere-Pruefung**
// (Schlusslesung 26.08.2026). Die vorige Fassung pruefte ihn auf Laenge > 0 —
// damit kam eine sechste Sabotage durch: vertauscht man die Titel von `mangel`
// und `gesperrt`, blieb der Test gruen, und der Tooltip gab am gesperrten Stand
// „Beanstandet, aber benutzbar" aus. **Eine falsche Handlungsanweisung an einer
// Sperre ist genau die Sorte Fehler, gegen die der Label-Vergleich eine Ebene
// hoeher ueberhaupt gebaut wurde** — er lag nur eine Ebene zu hoch.
//
// Der `titel` ist die EINZIGE Stelle, an der ausgeschrieben steht, was „Heil"
// umfasst (beide Saisonvarianten) und dass „Nie geprueft" etwas anderes meint
// als die Kachel daneben. Also gehoert er in den Vergleich wie das Label.
//
// Die Reihenfolge steht mit drin, weil sie eine Entscheidung ist: sie folgt der
// Dringlichkeit und ist dieselbe wie in `ZUSTAND_WAHL` des Inspektors.
assert.deepEqual(STUFEN.map((s) => ({ ...s })), [
  {
    wert: 'heil',
    label: 'Heil',
    titel:
      'Zuletzt in Ordnung befunden — auch wenn die Prüfung aus einer früheren Saison stammt',
  },
  { wert: 'mangel', label: 'Mangel', titel: 'Beanstandet, aber benutzbar' },
  { wert: 'gesperrt', label: 'Gesperrt', titel: 'Nicht besetzen' },
  {
    wert: 'nie',
    label: 'Nie geprüft',
    titel:
      'Zu diesem Objekt gibt es überhaupt keine Prüfzeile — nicht zu verwechseln mit „diese Saison offen"',
  },
])

// --- Die Woerter: „Geprueft" und „Offen" sind auf diesem Bildschirm vergeben ---
// **Der Riegel gegen die dritte Wahrheit** (s. Kommentarkopf von
// `wartungsfilter.ts`). Die Kachel auf derselben Seite traegt `Geprueft` mit
// einer anderen Zaehlung (`sitze - offen`), und `offen` meint dort „diese
// Saison nicht angesehen". Wer hier eine Stufe umbenennt, ohne die Kachel zu
// kennen, laesst zwei verschiedene Zahlen unter einem Wort stehen.
const woerter = STUFEN.map((s) => s.label.toLowerCase())
assert.ok(!woerter.includes('geprüft'), 'Kollidiert mit der Kennzahl-Kachel „Geprüft"')
assert.ok(!woerter.includes('offen'), 'Kollidiert mit „32 offen" der Uebersicht')
