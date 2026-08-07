/**
 * Selbsttest für `strecke.ts`.
 *
 *   node --experimental-strip-types app/zentrale/dokumentation/strecke.selftest.ts
 *
 * **Nicht `npx tsx`** — die Datei hat kein Top-Level-await, aber der Rest des
 * Portals wird so gefahren und ein zweiter Weg wäre ein zweiter Fehlerfall.
 *
 * Die Fixtures unten sind **echte Produktionszeilen** (gemessen 07.08.2026,
 * fünf der 33 Saisons). Sie sind so gewählt, dass jede eine Besonderheit trägt:
 * 1993/94 die einzige mit fünf Terminen, 1995/96 das einzige „Nov. spät" der
 * ganzen Chronik, 1998/99 die dünnste Saison (zwei Termine, kein Dezember),
 * 2010/11 die stärkste (178), 2025/26 die letzte. Ein erfundener Datensatz
 * hätte keinen dieser Fälle.
 */

import assert from 'node:assert/strict'
import { TERMINE, alsSaison, kurve, streckenbuch, type Jagdzeile } from './strecke.ts'

function z(jagdjahr: number, termin: string, anzahl: number): Jagdzeile {
  return { jagdjahr, termin, anzahl }
}

const ECHT: Jagdzeile[] = [
  z(1993, 'okt', 16), z(1993, 'nov_frueh', 25), z(1993, 'dez_frueh', 46),
  z(1993, 'dez_spaet', 4), z(1993, 'jan_frueh', 32),
  z(1995, 'nov_frueh', 11), z(1995, 'nov_spaet', 18), z(1995, 'dez_frueh', 20),
  z(1995, 'jan_frueh', 23),
  z(1998, 'okt', 3), z(1998, 'jan_frueh', 17),
  z(2010, 'nov_frueh', 35), z(2010, 'dez_frueh', 60), z(2010, 'jan_frueh', 80),
  z(2010, 'jan_spaet', 3),
  z(2025, 'dez_frueh', 85), z(2025, 'jan_frueh', 23), z(2025, 'jan_spaet', 8),
]

const b = streckenbuch(ECHT)!
assert.ok(b, 'Streckenbuch aus echten Zeilen darf nicht null sein')

// --- Kein Bestand heisst kein Screen, nicht ein leeres Gerüst ---

assert.equal(streckenbuch([]), null, 'Ohne Zeilen gibt es kein Streckenbuch')

// --- Die Kernzusicherung: leere Zelle ist null, niemals 0 ---
//
// `anzahl > 0` ist Constraint in 110. Eine 0 in der Tabelle behauptete eine
// Jagd ohne Strecke; gemeint ist „zu diesem Termin wurde keine Jagd gemeldet".
// Wer die Zellen auf `number` umstellt und mit `?? 0` füllt, macht aus 1998/99
// fünf erfolglose Jagden, die es nie gab.

const s1998 = b.saisons.find((s) => s.jahr === 1998)!
assert.equal(s1998.zellen[3], null, '1998/99 hatte keine Dezemberjagd — die Zelle muss null sein')
assert.notEqual(s1998.zellen[3], 0, 'Eine nicht gemeldete Jagd darf nie als 0 erscheinen')
assert.equal(
  s1998.zellen.filter((z) => z !== null).length,
  2,
  '1998/99 ist die dünnste Saison: zwei belegte Termine',
)
assert.equal(s1998.summe, 20, '1998/99: 3 + 17')

// --- Kreuztabelle gegen das Papier ---

const s1993 = b.saisons.find((s) => s.jahr === 1993)!
assert.deepEqual(
  s1993.zellen,
  [16, 25, null, 46, 4, 32, null],
  '1993/94 in Kalenderreihenfolge: Okt 16, Nov früh 25, Dez früh 46, Dez spät 4, Jan früh 32',
)
assert.equal(s1993.summe, 123, '1993/94 gesamt')
assert.equal(
  s1993.zellen.filter((z) => z !== null).length,
  5,
  '1993/94 hat fünf belegte Termine',
)

const s1995 = b.saisons.find((s) => s.jahr === 1995)!
assert.equal(s1995.zellen[2], 18, '1995/96 trägt das einzige „Nov. spät" der Chronik')

const s2025 = b.saisons.find((s) => s.jahr === 2025)!
assert.deepEqual(
  s2025.zellen,
  [null, null, null, 85, null, 23, 8],
  '2025/26: drei Termine, kein November',
)
assert.equal(s2025.summe, 116, '2025/26 gesamt')

// --- Neueste Saison zuerst ---

assert.equal(b.saisons[0].jahr, 2025, 'Die Tabelle beginnt mit der jüngsten Saison')
assert.equal(b.saisons.at(-1)!.jahr, 1993, 'und endet mit der ältesten')
assert.equal(b.vonJahr, 1993)
assert.equal(b.bisJahr, 2025)

// --- Spalten stehen in Kalenderreihenfolge, nicht nach Häufigkeit ---
//
// Nach Menge sortiert stünde „Jan. früh" (175) vor „Okt." (19), und eine
// Saisonzeile erzählte ihren eigenen Verlauf nicht mehr.

assert.deepEqual(
  b.spalten.map((s) => s.schluessel),
  ['okt', 'nov_frueh', 'nov_spaet', 'dez_frueh', 'dez_spaet', 'jan_frueh', 'jan_spaet'],
  'Spaltenreihenfolge ist der Kalender',
)
assert.equal(b.spalten.length, TERMINE.length, 'Jeder erlaubte Termin bekommt eine Spalte')

// --- `belegt` zählt Saisons, `summe` zählt Stücke ---
//
// Die zweite Kopfzeile der Tabelle steht und fällt damit: „Nov. spät 1×" neben
// „18" ist eine Auskunft, „18×" wäre eine Falschaussage.

assert.equal(b.spalten[2].belegt, 1, '„Nov. spät" kommt in genau einer Saison vor')
assert.equal(b.spalten[2].summe, 18, '… mit 18 Stück')
assert.equal(b.spalten[5].belegt, 5, '„Jan. früh" ist in allen fünf Saisons belegt')
assert.equal(b.spalten[5].summe, 175, '32 + 23 + 17 + 80 + 23')

// --- Spaltensummen, Zeilensummen und Gesamtsumme müssen übereinstimmen ---
//
// **Das ist KEIN Riegel gegen verschluckte Zeilen, und die erste Fassung dieses
// Kommentars behauptete genau das** (Fremdprüfung 07.08.2026, P8): alle drei
// Wege lesen dieselbe `jeJahr`-Zellstruktur. Fiele dort eine Zeile heraus,
// fehlte sie in allen dreien und der Vergleich bliebe grün.
//
// Was er wirklich prüft, ist die Rechnung darüber — dass Zeilen- und
// Spaltenaggregation dasselbe Raster gleich auslesen. Der Riegel gegen
// verschluckte Zeilen sitzt woanders: `streckenbuch()` wirft bei einem Termin,
// den es nicht kennt. Gegen ein stilles Verschlucken hilft nur die Gegenprobe
// an der Datenbank (124 Zeilen, 3221 Stück, gefahren am 07.08.2026).

assert.equal(b.gesamt, 509, 'Summe aller fünf Saisons')
assert.equal(
  b.spalten.reduce((s, sp) => s + sp.summe, 0),
  b.gesamt,
  'Spaltensummen und Gesamtsumme müssen übereinstimmen',
)
assert.equal(
  b.saisons.reduce((s, sa) => s + sa.summe, 0),
  b.gesamt,
  'Zeilensummen und Gesamtsumme ebenso',
)
assert.equal(b.gemeldet, 18, '`gemeldet` zählt gemeldete Termine, nicht Saisons und nicht Stücke')

// --- Eine Zeile, die nicht in diese View gehört, muss anstossen ---
//
// Still überspringen hiesse: die Strecke wird zu klein, und niemand sieht es.

assert.throws(
  () => streckenbuch([z(2020, 'feb_frueh', 5)]),
  /Unbekannter Termin/,
  'Ein achter Termin im CHECK muss hier anstossen, nicht verschwinden',
)
assert.throws(
  () => streckenbuch([{ jagdjahr: null, termin: 'okt', anzahl: 5 }]),
  /ohne Jagdjahr oder Termin/,
  'Eine Zeile ohne Jagdjahr gehört nicht in diese View',
)
assert.throws(
  () => streckenbuch([{ jagdjahr: 2020, termin: null, anzahl: 5 }]),
  /ohne Jagdjahr oder Termin/,
  'Eine Zeile ohne Termin ebenso',
)

// --- Zwei Meldungen zum selben Termin werden addiert, nicht überschrieben ---
//
// Eindeutig ist heute nur `quell_zeile`, nicht (Jahr, Termin). Überschreiben
// verlöre eine Jagd lautlos.

const doppelt = streckenbuch([z(2000, 'okt', 4), z(2000, 'okt', 6)])!
assert.equal(doppelt.saisons[0].zellen[0], 10, 'Zwei Zeilen auf demselben Termin addieren sich')
assert.equal(doppelt.gesamt, 10)
assert.equal(doppelt.gemeldet, 2, 'gemeldet zählt beide Zeilen')

// --- Saisonbezeichnung, inklusive Jahrhundertwechsel ---

assert.equal(alsSaison(1993), '1993/94')
assert.equal(alsSaison(1999), '1999/00', 'Der Jahrhundertwechsel darf nicht 1999/100 ergeben')
assert.equal(alsSaison(2000), '2000/01')
assert.equal(alsSaison(2025), '2025/26')
assert.equal(alsSaison(2009), '2009/10', 'Einstellige Folgejahre bleiben zweistellig')

// --- Die Kurve läuft chronologisch, gegen die Reihenfolge der Tabelle ---
//
// Eine Zeitreihe von rechts nach links liest sich als Abstieg, wo ein Anstieg
// steht. `b.saisons` ist absteigend — `kurve()` muss es selbst umdrehen.

const k = kurve(b.saisons, 400, 300)!
const punkte = k.punkte.split(' ').map((p) => p.split(',').map(Number))
assert.equal(punkte.length, 5, 'Ein Punkt je Saison')
assert.equal(punkte[0][0], 0, 'Der erste Punkt sitzt am linken Rand')
assert.equal(punkte.at(-1)![0], 400, 'Der letzte am rechten')
// In SVG wächst y nach UNTEN: die stärkere Saison bekommt das kleinere y.
assert.ok(
  punkte[0][1] < punkte.at(-1)![1],
  'Erster Punkt ist 1993/94 (123), letzter 2025/26 (116) — läge links das grössere y, liefe die Reihe rückwärts',
)

// --- Die Achse beginnt bei 0, nicht beim Minimum ---
//
// Sonst würde aus dem Verhältnis 20:178 optisch 0:158, und die schwächste
// Saison sähe aus wie ein Totalausfall.

assert.equal(k.hoch, 178)
assert.equal(k.hochJahr, 2010, 'Stärkste Saison der Chronik')
assert.equal(k.schwach, 20)
assert.equal(k.schwachJahr, 1998)
const y2010 = punkte[3][1]
assert.equal(y2010, 0, 'Die stärkste Saison berührt die Oberkante')
const y1998 = punkte[2][1]
assert.equal(
  Math.round(y1998),
  Math.round(300 - (20 / 178) * 300),
  'Die schwächste Saison sitzt bei 20/178 der Höhe, nicht auf der Grundlinie',
)
assert.ok(y1998 < 300, 'Bei Skalierung ab dem Minimum läge sie exakt auf 300')

// --- Randfälle der Kurve ---
//
// Unter zwei Saisons gibt es keine Linie: eine `<polyline>` mit einem Punkt hat
// kein Segment und zeichnet lautlos nichts. Der Screen zeigte dann ein leeres
// Kästchen mit Achsenbeschriftung und behauptete eine Reihe, die es nicht gibt.

assert.equal(kurve([], 400, 300), null, 'Ohne Saison keine Kurve')
assert.equal(
  kurve(streckenbuch([z(2020, 'okt', 7)])!.saisons, 400, 300),
  null,
  'Eine einzelne Saison ergibt keine Kurve — die Tabelle trägt den Fall allein',
)
assert.ok(
  kurve(streckenbuch([z(2020, 'okt', 7), z(2021, 'okt', 9)])!.saisons, 400, 300),
  'Ab zwei Saisons gibt es eine Linie',
)

console.log('strecke.selftest.ts: alle Zusicherungen erfüllt')
