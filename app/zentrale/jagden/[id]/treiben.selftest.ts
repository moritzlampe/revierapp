// Gegenprobe fuer die Standmengen-Rechnung der Treiben (Portal-Phase 4b).
// Kein Test-Runner im Repo, deshalb ein eigenstaendiges Skript
// (Muster: handlungsbedarf.selftest.ts):
//
//   node --experimental-strip-types "app/zentrale/jagden/[id]/treiben.selftest.ts"
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
// Wird vom Sammel-Script `npm run selftest` per Glob mitgenommen.
import assert from 'node:assert/strict'
import {
  ausZeilen,
  bearbeitbar,
  markierungAus,
  naechsteSequenz,
  sichtbarerName,
  standDiff,
  type Treiben,
  type TreibenStand,
} from './treiben.ts'

// --- bearbeitbar(): nur ein noch nicht gelaufenes Treiben ---
assert.equal(bearbeitbar('pending'), true)
assert.equal(bearbeitbar('active'), false, 'ein laufendes Treiben gehoert dem Jagdtag')
assert.equal(bearbeitbar('completed'), false, 'ein beendetes Treiben ist ein Protokoll')

// --- naechsteSequenz() ---
assert.equal(naechsteSequenz([]), 1, 'das erste Treiben bekommt 1')
const mitNummern = (nummern: number[]): Treiben[] =>
  nummern.map((sequence, i) => ({
    id: `t${i}`,
    name: `T${i}`,
    sequence,
    status: 'pending',
    stands: [],
  }))
assert.equal(naechsteSequenz(mitNummern([1, 2, 3])), 4)
assert.equal(naechsteSequenz(mitNummern([3, 1])), 4, 'max, nicht Anzahl')
assert.equal(naechsteSequenz(mitNummern([2, 2])), 3, 'doppelte Nummern werden nicht repariert')

// --- sichtbarerName(): was `trim()` allein NICHT deckt ---
assert.equal(sichtbarerName('  Buchenkamp  '), 'Buchenkamp', 'Positivkontrolle')
assert.equal(sichtbarerName(''), '')
assert.equal(sichtbarerName('   '), '', 'gewoehnliche Leerzeichen')
// NBSP ist Kategorie `Zs` — `trim()` nimmt ihn mit. Genau daran ist Migration
// 111 haengengeblieben, dort ging er durch einen `btrim` ohne Zeichenmenge.
assert.equal(sichtbarerName('\u00A0'), '', 'NBSP U+00A0')
// **Der eigentliche Grund fuer diese Funktion**: `Cf` ist kein Leerzeichen, ein
// blosses `trim()` liefert hier `length === 1` und damit ein sichtbar leeres
// Treiben mit gueltigem Namen.
assert.equal('\u200B'.trim().length, 1, 'Beleg: trim() laesst ZWSP stehen')
assert.equal(sichtbarerName('\u200B'), '', 'ZERO WIDTH SPACE U+200B')
assert.equal(sichtbarerName('\u200C\u200D\uFEFF'), '', 'ZWNJ, ZWJ und BOM')
// **Die drei, die eine Zeichenliste durchliess** (Fremdpruefung 10.08.2026, A6).
// Sie sind der Grund fuer \\p{Cf} statt einer Aufzaehlung.
assert.equal(sichtbarerName('\u2060'), '', 'WORD JOINER U+2060')
assert.equal(sichtbarerName('\u200E'), '', 'LEFT-TO-RIGHT MARK U+200E')
assert.equal(sichtbarerName('\u00AD'), '', 'SOFT HYPHEN U+00AD')
assert.equal(sichtbarerName('Buchen\u00ADkamp'), 'Buchenkamp', 'auch mitten im Wort')
assert.equal(sichtbarerName('\u200BKessel\u200B'), 'Kessel', 'unsichtbares am Rand faellt weg')

// --- standDiff(): der Kern ---
const stand = (id: string, standId: string, fest = true): TreibenStand => ({
  id,
  standId,
  fest,
})

// Positivkontrolle zuerst: ohne sie belegt die Reihe darunter nur, dass die
// Funktion gern nichts tut.
const basis = [stand('r1', 'A'), stand('r2', 'B')]
const diffPositiv = standDiff(basis, new Set(['B', 'C']), new Set(['A', 'B', 'C']))
assert.deepEqual(diffPositiv.loeschen, ['r1'], 'A wurde abgewaehlt')
assert.deepEqual(diffPositiv.legen, ['C'], 'C ist neu')
assert.equal(
  diffPositiv.loeschen.length + diffPositiv.legen.length,
  2,
  'eine Aenderung je Richtung',
)

// Nichts geaendert heisst nichts schreiben.
const diffGleich = standDiff(basis, new Set(['A', 'B']), new Set(['A', 'B', 'C']))
assert.deepEqual(diffGleich, { loeschen: [], legen: [] })
assert.equal(diffGleich.loeschen.length + diffGleich.legen.length, 0, 'nichts zu schreiben')

// **Ad-hoc-Sitze ueberleben.** Sie stehen in `hunt_seat_assignments`, nicht in
// `map_objects`, tauchen also weder auf der Karte noch in `sichtbar` auf — der
// `sichtbar`-Riegel haelt sie. Ohne ihn loeschte der erste Speichervorgang
// jeden Sitz, den die App angelegt hat.
const mitAdhoc = [stand('r1', 'A'), stand('rAdhoc', 'S1', false)]
const diffAdhoc = standDiff(mitAdhoc, new Set(['A']), new Set(['A', 'B']))
assert.deepEqual(diffAdhoc.loeschen, [], 'der Ad-hoc-Sitz bleibt')
assert.deepEqual(diffAdhoc.legen, [])
// ... auch dann, wenn sonst alles abgewaehlt wird.
const diffAdhocLeer = standDiff(mitAdhoc, new Set(), new Set(['A', 'B']))
assert.deepEqual(diffAdhocLeer.loeschen, ['r1'], 'nur der feste Stand geht')

// **Ein Stand auf einem geloeschten Kartenobjekt ueberlebt.** An der Produktion
// gemessen: eine solche Zeile existiert (08.08.2026). Die Karte laedt nur
// `deleted_at is null`, der Nutzer kann sie also gar nicht abwaehlen — ein Diff
// gegen „alles, was nicht markiert ist" haette sie beim ersten Speichern
// weggeraeumt, ohne dass sie je jemand gesehen haette.
const mitWeg = [stand('r1', 'A'), stand('rWeg', 'GELOESCHT')]
const diffWeg = standDiff(mitWeg, new Set(['A']), new Set(['A', 'B']))
assert.deepEqual(diffWeg.loeschen, [], 'unsichtbar heisst nicht abgewaehlt')
assert.deepEqual(diffWeg.legen, [])
// **`markiert` ist NICHT immer eine Teilmenge von `sichtbar`, und genau daran
// haengt der zweite Riegel.** Der Fall ist real und nicht konstruiert: waehrend
// die Auswahl im Browser steht, loescht jemand anderes das Kartenobjekt. Beim
// naechsten Rendern ist der Stand markiert, aber nicht mehr sichtbar.
//
// Wuerde `legen` nur gegen die SICHTBAREN Zeilen geprueft, waere die vorhandene
// Zeile nicht auffindbar und der Insert liefe in UNIQUE (drive_id,
// map_object_id) — 23505 mitten im Speichern. Deshalb gegen ALLE festen Zeilen.
const nurWeg = [stand('rWeg', 'GELOESCHT')]
const diffWegMarkiert = standDiff(nurWeg, new Set(['GELOESCHT']), new Set(['A']))
assert.deepEqual(diffWegMarkiert.legen, [], 'die Zeile gibt es schon, auch wenn sie unsichtbar ist')
assert.deepEqual(diffWegMarkiert.loeschen, [], 'und abgewaehlt wurde sie auch nicht')

// **Ein markierter, aber unsichtbarer Stand wird NICHT angelegt**
// (Fremdpruefung 10.08.2026, A2). Die Auswahl steht im Browser, jemand loescht
// das Kartenobjekt, ein Refresh nimmt es aus `sichtbar` — `markiert` traegt es
// weiter. Der FK griffe nicht, denn die `map_objects`-Zeile existiert noch, sie
// traegt nur `deleted_at`: das Treiben bekaeme lautlos einen Stand, den keine
// Karte je wieder zeigt.
const diffTot = standDiff([], new Set(['WEG']), new Set(['A']))
assert.deepEqual(diffTot.legen, [], 'was nicht auf der Karte steht, wird nicht verknuepft')
assert.deepEqual(diffTot.loeschen, [])
// Positivkontrolle daneben: sichtbar UND markiert wird sehr wohl angelegt.
assert.deepEqual(standDiff([], new Set(['A']), new Set(['A'])).legen, ['A'])

// Ein leeres Treiben laesst sich befuellen, ein volles komplett raeumen.
assert.deepEqual(standDiff([], new Set(['A', 'B']), new Set(['A', 'B'])).legen, ['A', 'B'])
assert.deepEqual(standDiff(basis, new Set(), new Set(['A', 'B'])).loeschen, ['r1', 'r2'])

// --- ausZeilen(): die beiden Fremdschluessel fallen in einen Schluesselraum ---
const ausDrei = ausZeilen([
  {
    id: 't1',
    name: 'Buchenkamp',
    sequence: 1,
    status: 'pending',
    hunt_drive_stands: [
      { id: 'r1', map_object_id: 'M1', seat_assignment_id: null },
      { id: 'r2', map_object_id: null, seat_assignment_id: 'S1' },
      // Der CHECK macht das unerreichbar — es faellt trotzdem heraus, statt
      // ein `null` als Stand-Id weiterzureichen.
      { id: 'r3', map_object_id: null, seat_assignment_id: null },
    ],
  },
])
assert.equal(ausDrei.length, 1)
assert.deepEqual(ausDrei[0].stands, [
  { id: 'r1', standId: 'M1', fest: true },
  { id: 'r2', standId: 'S1', fest: false },
])
assert.deepEqual(ausZeilen([]), [], 'eine Jagd ohne Treiben')

// --- markierungAus(): der Ausgangszustand der Karte ---
const einTreiben: Treiben = {
  id: 't1',
  name: 'Buchenkamp',
  sequence: 1,
  status: 'pending',
  stands: [stand('r1', 'A'), stand('rAdhoc', 'S1', false)],
}
assert.deepEqual([...markierungAus(einTreiben)], ['A'], 'nur feste Staende sind markierbar')
