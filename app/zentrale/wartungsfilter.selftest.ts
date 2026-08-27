// Gegenprobe fuer die Zustandsachse der Wartungssicht. Kein Test-Runner im
// Repo, deshalb ein eigenstaendiges Skript (Muster: handlungsbedarf.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/wartungsfilter.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
// Wird vom Sammel-Script `npm run selftest` per Glob mitgenommen.
import assert from 'node:assert/strict'
import {
  STUFEN,
  kartePunktSichtbar,
  stufeSichtbar,
  stufeVon,
  type ZustandStufe,
} from './wartungsfilter.ts'

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

// ============================================================
// kartePunktSichtbar — beide Filterachsen (CP-84, 27.08.2026)
// ============================================================
//
// **Dieser Block existiert wegen eines Fehlers, der beim Bauen passiert ist**
// und den kein Werkzeug gemeldet haette: die Ausnahme des ZUSTANDsfilters
// (`istWartbar`) schlug auf den TYPfilter durch. Ein abgewaehlter Parkplatz
// waere sichtbar geblieben — die Ausnahme des einen Filters hob den anderen
// auf, und `tsc` und ESLint sagen dazu nichts.

// Ein Ersatz fuer `istWartbar` aus `wartung.ts`. **Ausgeschrieben statt
// importiert**, damit dieser Test die Regel prueft und nicht die Tabelle:
// wandert ein Typ dort von wartbar nach nicht-wartbar, soll HIER nichts
// umkippen.
const wartbar = (typ: string) => typ === 'kanzel' || typ === 'hochsitz'

const kanzelHeil = { id: 'k1', typ: 'kanzel', ampel: 'ok-voll' as const }
const kanzelGesperrt = { id: 'k2', typ: 'kanzel', ampel: 'gesperrt' as const }
const parkplatz = { id: 'p1', typ: 'parkplatz', ampel: 'offen' as const }

const OHNE_FILTER = {
  auswahlId: null,
  typFiltert: false,
  versteckt: new Set<string>(),
  zustandFiltert: false,
  zustandAus: new Set<ZustandStufe>(),
  istWartbar: wartbar,
}

// Ohne Filter ist alles sichtbar.
assert.equal(kartePunktSichtbar(kanzelHeil, OHNE_FILTER), true)
assert.equal(kartePunktSichtbar(parkplatz, OHNE_FILTER), true)

// --- Regel 2: der Typfilter gilt OHNE Ausnahme ---
//
// **Der Fehler, den es gab.** Ein abgewaehlter Parkplatz ist nicht wartbar —
// wer die `istWartbar`-Ausnahme hier greifen laesst, zeigt ihn trotzdem an,
// obwohl der Nutzer ihn gerade abgewaehlt hat.
const nurTyp = { ...OHNE_FILTER, typFiltert: true, versteckt: new Set(['parkplatz']) }
assert.equal(
  kartePunktSichtbar(parkplatz, nurTyp),
  false,
  'Ein abgewaehlter Typ verschwindet AUCH, wenn er nicht wartbar ist',
)
assert.equal(kartePunktSichtbar(kanzelHeil, nurTyp), true)

// Und derselbe Fall bei GLEICHZEITIG laufendem Zustandsfilter — hier sass der
// Fehler wirklich, weil dort die Ausnahme steht.
const beide = {
  ...OHNE_FILTER,
  typFiltert: true,
  versteckt: new Set(['parkplatz']),
  zustandFiltert: true,
  zustandAus: new Set<ZustandStufe>(['heil']),
}
assert.equal(
  kartePunktSichtbar(parkplatz, beide),
  false,
  'Die Ausnahme des Zustandsfilters darf den Typfilter nicht aufheben',
)

// ============================================================
// Beide Achsen an: ALLE VIER Felder der Matrix
// ============================================================
//
// ⚠ **Diese Tabelle steht hier, weil DREI Pruefer nacheinander je EIN
// fehlendes Feld gefunden haben** (Fremdpruefung Lauf D Punkt 7,
// Schlusslesung Punkt 7, Delta-Durchgang Punkt 1 — alle drei am 27.08.2026,
// alle drei per Sabotage belegt). Jedes Mal wurde der GENANNTE Fall
// nachgetragen; jedes Mal blieb ein anderes Feld offen.
//
// **Die Lehre ist nicht „gruendlicher testen", sondern: wer einen Befund
// woertlich fixt, schliesst die genannte Luecke — nicht ihre Klasse.** Zwei
// Achsen mit je zwei Zustaenden sind vier Faelle. Drei davon einzeln
// nachzureichen dauert drei Prueflaeufe; die Tabelle einmal hinzuschreiben
// dauert eine Minute.
//
// Aufbau: `beide` hat `versteckt=['parkplatz']` und `zustandAus=['heil']`,
// beide Flaggen an. Je Zeile sagt eine, keine oder beide Achsen „weg".
//
//   Objekt          | Typ abgewaehlt | Stufe abgewaehlt | erwartet
//   ----------------|----------------|------------------|---------
//   parkplatz       | JA             | (nicht wartbar)  | weg
//   kanzelHeil      | nein           | JA               | weg
//   kanzelGesperrt  | nein           | nein             | DA
//   kanzel+versteckt| JA             | nein             | weg
//
// **Die dritte Zeile ist die, die dreimal fehlte** — und die einzige, in der
// beide Achsen aktiv sind und NICHTS sagen. Ohne sie besteht eine
// Implementierung `if (typFiltert && zustandFiltert) return id === auswahlId`
// alle uebrigen Zusicherungen: sie liefert genau dann `false`, wenn die
// anderen drei Zeilen `false` erwarten.

// Zeile 1 — nur der Typfilter greift (die Ausnahme des Zustandsfilters darf
// ihn nicht aufheben).
assert.equal(
  kartePunktSichtbar(parkplatz, beide),
  false,
  'Typ abgewaehlt schlaegt durch, auch bei nicht wartbarem Objekt',
)

// Zeile 2 — nur der Zustandsfilter greift (der Typfilter darf ihn nicht
// verdraengen).
assert.equal(
  kartePunktSichtbar(kanzelHeil, beide),
  false,
  'Stufe abgewaehlt schlaegt durch, auch wenn der Typ sichtbar ist',
)

// Zeile 3 — **KEINE Achse sagt weg: das Objekt MUSS stehen bleiben.**
// Ohne diese Zusicherung ist „beide Filter an" nicht von „alles weg"
// unterscheidbar.
assert.equal(
  kartePunktSichtbar(kanzelGesperrt, beide),
  true,
  'Beide Achsen aktiv, beide sagen nichts → sichtbar. Das Feld, das dreimal fehlte',
)

// Zeile 4 — der Typfilter greift bei einem WARTBAREN Objekt, dessen Stufe
// sichtbar waere. Er darf nicht uebersprungen werden.
assert.equal(
  kartePunktSichtbar(kanzelGesperrt, { ...beide, versteckt: new Set(['kanzel']) }),
  false,
  'Wartbar, Stufe sichtbar, Typ abgewaehlt → weg',
)

// Gegenproben, damit kein Fall aus einem anderen Grund rot ist: jeweils
// dieselbe Frage mit abgeschalteter Gegenachse.
assert.equal(kartePunktSichtbar(kanzelHeil, { ...beide, zustandFiltert: false }), true)
assert.equal(
  kartePunktSichtbar(kanzelGesperrt, {
    ...beide,
    versteckt: new Set(['kanzel']),
    typFiltert: false,
  }),
  true,
)

// --- Regel 3: der Zustandsfilter ueberspringt nicht wartbare Objekte ---
const nurZustand = {
  ...OHNE_FILTER,
  zustandFiltert: true,
  zustandAus: new Set<ZustandStufe>(['heil', 'mangel', 'gesperrt', 'nie']),
}
assert.equal(
  kartePunktSichtbar(parkplatz, nurZustand),
  true,
  'Alle Stufen abgewaehlt: die Orientierungsmarken bleiben stehen',
)
assert.equal(kartePunktSichtbar(kanzelHeil, nurZustand), false)
assert.equal(kartePunktSichtbar(kanzelGesperrt, nurZustand), false)

// --- Regel 1: die Auswahl gewinnt ueber BEIDE Achsen ---
//
// Sonst verschwaende unter der geoeffneten Detailansicht genau der Punkt, den
// sie beschreibt.
assert.equal(
  kartePunktSichtbar(kanzelHeil, { ...beide, auswahlId: 'k1' }),
  true,
  'Das ausgewaehlte Objekt bleibt sichtbar, egal welcher Filter greift',
)
assert.equal(
  kartePunktSichtbar(parkplatz, { ...beide, auswahlId: 'p1' }),
  true,
  'Auch gegen den Typfilter, der sonst keine Ausnahme kennt',
)

// --- Die Flaggen sind der Ausschalter ---
//
// `typFiltert`/`zustandFiltert` tragen die Erreichbarkeit der Bedienung
// (`legendeBedienbar` in der Karte). Steht die Flagge auf false, ist die
// Menge egal — sonst wirkte ein Filter im Standgruppen-Reiter weiter, wo seine
// Kaestchen gar nicht stehen. Genau der schwerste Befund vom 26.08.2026.
assert.equal(
  kartePunktSichtbar(parkplatz, { ...beide, typFiltert: false, zustandFiltert: false }),
  true,
  'Nicht bedienbare Legende: kein Filter wirkt, obwohl die Mengen gefuellt sind',
)
assert.equal(kartePunktSichtbar(kanzelHeil, { ...beide, typFiltert: false, zustandFiltert: false }), true)
