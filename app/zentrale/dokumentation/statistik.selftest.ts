/**
 * Selbsttest für `statistik.ts`.
 *
 *   node --experimental-strip-types app/zentrale/dokumentation/statistik.selftest.ts
 *
 * **Nicht `npx tsx`** — dieselbe Begründung wie in `strecke.selftest.ts`.
 *
 * ## Die Fixtures tragen echte Zahlen und erfundene Namen
 *
 * Alle Mengen, Jahre und Lücken unten sind aus dem Bestand abgelesen
 * (27.08.2026). Die **Namen sind ersetzt**, und das ist kein Zufall:
 * `github.com/moritzlampe/revierapp` ist öffentlich (AGENTS.md,
 * „Infrastruktur"), und die Chronik führt 213 reale Personen mit
 * Klarnamen. Ein Fixture mit echten Namen wäre eine Veröffentlichung.
 *
 * **Die sechs Kollektivzeilen stehen dagegen im Klartext** („Hunde",
 * „Fallwild") — sie benennen keine Person, und sie sind die eigentliche
 * Testfalle: sie haben keinen Kontakt und dürfen trotzdem nicht in einen Topf
 * fallen.
 *
 * Jede Fixture trägt eine Besonderheit des echten Bestands:
 * - zwei Generationen, die nur der Papiername trennt („…, Club" / „…, Lev.")
 * - ein Kontakt unter zwei Papiernamen (Mädchen- und Ehename)
 * - drei Kollektivzeilen ohne `kontakt_id`
 * - **Person Y: 5 belegte Jahre in 14 Kalenderjahren** — die Reihe, die
 *   **keine** Kurve bekommen darf, mit den echten Jahren 2007, 2008, 2013,
 *   2014, 2020 und ihren echten Mengen
 * - Person X: acht lückenlose Jahre, die Gegenprobe dazu
 */

import assert from 'node:assert/strict'
import {
  anteil,
  blaetter,
  blattkurve,
  jagdjahrVon,
  jahrestabelle,
  journal,
  OHNE_ART,
  OHNE_ORT,
  rangliste,
  segmente,
  verteilung,
  type Chronikzeile,
} from './statistik.ts'

function r(
  kontakt_id: string | null,
  erleger_name: string,
  art_text: string,
  anzahl: number,
): Chronikzeile {
  return { kontakt_id, erleger_name, art_text, jagdjahr: null, anzahl }
}

function f(
  kontakt_id: string | null,
  erleger_name: string,
  jagdjahr: number,
  art_text: string,
  anzahl: number,
): Chronikzeile {
  return { kontakt_id, erleger_name, art_text, jagdjahr, anzahl }
}

// --- Rangliste -------------------------------------------------------------

// Die drei Fälle, an denen eine falsche Gruppierung still danebenliegt —
// alle drei aus dem Bestand abgelesen, alle drei mit ersetzten Namen:
//
//  1. **Zwei Generationen**, die das Papier durch einen Ortszusatz trennt
//     („…, Club" gegen „…, Lev."). Verschiedene `kontakt_id`, verschiedener
//     Papiername, IDENTISCHER Kontakt-Anzeigename — wer den anzeigt, stellt
//     zwei gleichnamige Zeilen untereinander.
//  2. **Ein Kontakt mit zwei Papiernamen** (Mädchen- und Ehename). Nach dem
//     Papiernamen gruppiert bekäme diese Person zwei Zeilen.
//  3. **Kollektivzeilen ohne Kontakt.** Nach `kontakt_id` gruppiert fielen
//     alle in einen Topf.
const RANG: Chronikzeile[] = [
  r('k1', 'Person A', 'Sauen', 210),
  r('k1', 'Person A', 'D&R&F', 134),
  // Fall 1 — zwei Menschen, ein Kontakt-Anzeigename, zwei Papiernamen.
  r('k2', 'Person B, Club', 'Sauen', 88),
  r('k2', 'Person B, Club', 'D&R&F', 78),
  r('k3', 'Person B, Lev.', 'Sauen', 6),
  r('k3', 'Person B, Lev.', 'D&R&F', 5),
  // Fall 2 — ein Mensch, zwei Papiernamen.
  r('k4', 'Person C geb. Vorher', 'Sauen', 2),
  r('k4', 'Person C verh. Nachher', 'D&R&F', 1),
  // Fall 3 — drei Kollektivzeilen, keine davon ein Mensch.
  r(null, 'Hunde', 'Sauen', 54),
  r(null, 'Fallwild', 'D&R&F', 3),
  r(null, 'Treiber', 'Sauen', 1),
]

const liste = rangliste(RANG)

// --- Die Kernzusicherung: der Schlüssel ist weder Name noch Kontakt allein --
//
// Nach dem PAPIERNAMEN gruppiert zerfiele Person C in zwei Zeilen; nach der
// KONTAKT-ID gruppiert verschmölzen die drei Kollektivzeilen. Beide Fallen
// zusammen fängt nur die Kombination.

assert.equal(liste.zeilen.length, 7, 'Vier Personen und drei Kollektivzeilen bleiben sieben Zeilen')

const club = liste.zeilen.find((z) => z.papiername === 'Person B, Club')!
const lev = liste.zeilen.find((z) => z.papiername === 'Person B, Lev.')!
assert.equal(club.gesamt, 166, 'Die ältere Generation behält ihre eigene Strecke')
assert.equal(lev.gesamt, 11, 'Die jüngere bekommt nicht die Strecke der älteren')

// Fall 2: EINE Zeile, beide Papiernamen zusammengeführt, und der angezeigte
// Name ist deterministisch der alphabetisch erste — nicht der zuerst gelesene.
const beideNamen = liste.zeilen.filter((z) => z.kontaktId === 'k4')
assert.equal(beideNamen.length, 1, 'Ein Kontakt mit zwei Papiernamen ergibt EINE Zeile')
assert.equal(beideNamen[0].gesamt, 3, 'Ihre beiden Papiernamen zählen zusammen')
assert.equal(
  beideNamen[0].papiername,
  'Person C geb. Vorher',
  'Der alphabetisch erste Papiername gewinnt — sonst hinge die Anzeige an der Lieferreihenfolge',
)
assert.equal(
  rangliste([...RANG].reverse()).zeilen.find((z) => z.kontaktId === 'k4')!.papiername,
  'Person C geb. Vorher',
  'SABOTAGE-BELEG: umgekehrt eingelesen kommt derselbe Name heraus',
)

// --- Die Zeile ohne jede Namensangabe -------------------------------------
//
// **Diese Zusicherungen fehlten, und ohne sie blieben zwei echte Fehler grün**
// (Fremdprüfung 27.08.2026, A9): eine Zeile ohne Kontakt UND ohne Namen wurde
// vorher ganz verworfen — ihre Stücke fehlten damit in `gesamt`, und eine
// Rangliste, deren Summe nicht die Revierstrecke ist, ist keine. Sämtliche
// Fixtures oben tragen nichtleere Namen; der Fall kam schlicht nicht vor.

const NAMENLOS = rangliste([
  r('kn', 'Person N', 'Sauen', 5),
  r(null, '', 'Sauen', 2),
  r(null, '   ', 'D&R&F', 3),
])
assert.equal(NAMENLOS.gesamt, 10, 'Die namenlosen Zeilen fehlen der Gesamtstrecke NICHT')
const namenlos = NAMENLOS.zeilen.filter((z) => z.papiername === '')
assert.equal(namenlos.length, 1, 'Leerer Name und blosser Leerraum sind dieselbe Zeile')
assert.equal(namenlos[0].gesamt, 5, 'Ihre beiden Zeilen zählen zusammen')

// A2: ein leerer Name darf einen gültigen nicht verdrängen — und zwar in
// BEIDEN Lieferreihenfolgen. `''` sortiert vor jedem nichtleeren String, ein
// blosser `localeCompare` hätte den leeren Initialwert nie ersetzt.
const ZUERST_LEER = [r('km', '', 'Sauen', 1), r('km', 'Person M', 'Sauen', 1)]
assert.equal(
  rangliste(ZUERST_LEER).zeilen[0].papiername,
  'Person M',
  'Der gültige Name gewinnt gegen den leeren, auch wenn der leere zuerst kommt',
)
assert.equal(
  rangliste([...ZUERST_LEER].reverse()).zeilen[0].papiername,
  'Person M',
  'SABOTAGE-BELEG: und ebenso in der umgekehrten Reihenfolge',
)

const kollektiv = liste.zeilen.filter((z) => !z.kontaktId)
assert.equal(kollektiv.length, 3, 'Drei kontaktlose Zeilen bleiben drei, nicht eine')
assert.equal(liste.ohneKontakt, 3, 'Die Zahl wird ausgewiesen, nicht verschwiegen')
assert.deepEqual(
  kollektiv.map((z) => z.gesamt).sort((a, b) => b - a),
  [54, 3, 1],
  'Jede Kollektivzeile behält ihre eigene Menge',
)

// --- Die Summe ist die Revierstrecke, nicht die Summe der Menschen ---------
//
// Der Kontakt-Inspektor lässt die Kollektivzeilen fallen, und das ist dort
// richtig. Hier wäre es falsch: eine Rangliste, deren Summe nicht die
// Revierstrecke ergibt, ist keine.

assert.equal(liste.gesamt, 582, 'Die Summe schliesst Hunde, Fallwild und Treiber ein')
assert.equal(
  liste.zeilen.filter((z) => z.kontaktId).reduce((s, z) => s + z.gesamt, 0),
  524,
  'Die Summe über die Menschen allein ist kleiner — genau darum steht sie nirgends als Gesamtstrecke',
)

// --- Sortierung und Spalten ------------------------------------------------

assert.equal(liste.zeilen[0].papiername, 'Person A', 'Absteigend nach Gesamtstrecke')
assert.deepEqual(
  liste.spalten.map((s) => [s.art, s.anzahl]),
  [['Sauen', 361], ['D&R&F', 221]],
  'Stärkste Art links — und die Spaltensumme fällt beim Gruppieren mit an, statt im Tabellenfuss ein zweites Mal gerechnet zu werden',
)
assert.equal(
  liste.spalten.reduce((sum, s) => sum + s.anzahl, 0),
  liste.gesamt,
  'Die Spaltensummen ergeben zusammen die Gesamtstrecke — sonst hätte der Fuss zwei Rechenwege für eine Zahl',
)

// Gleichstand: zwei Zeilen mit derselben Menge müssen eine stabile Reihenfolge
// haben, sonst kippt die Liste zwischen zwei Lesungen ohne Änderung.
const gleich = rangliste([
  r('x', 'Zacharias', 'Sauen', 5),
  r('y', 'Anton', 'Sauen', 5),
])
assert.deepEqual(
  gleich.zeilen.map((z) => z.papiername),
  ['Anton', 'Zacharias'],
  'Bei Gleichstand alphabetisch — nicht in Einlesereihenfolge',
)

// --- Verteilung ------------------------------------------------------------

const k = verteilung(liste)
assert.equal(k.find((x) => x.label === 'ab 100')!.personen, 2, 'Person A (344) und die aeltere Generation (166)')
assert.equal(k.find((x) => x.label === 'genau 1')!.personen, 1, 'Die Treiber-Zeile')
assert.equal(
  k.reduce((s, x) => s + x.stueck, 0),
  liste.gesamt,
  'Die Klassen zerlegen die Gesamtstrecke vollständig und überschneidungsfrei',
)

// --- Familienblätter -------------------------------------------------------

// Person Y: die echten fünf Jahre der dünnsten Reihe des Bestands.
const Y: Chronikzeile[] = [
  f('ky', 'Person Y', 2007, 'Sauen', 2),
  f('ky', 'Person Y', 2007, 'Rehwild', 1),
  f('ky', 'Person Y', 2008, 'Sauen', 1),
  f('ky', 'Person Y', 2013, 'Sauen', 1),
  f('ky', 'Person Y', 2014, 'Sauen', 1),
  f('ky', 'Person Y', 2020, 'Sauen', 1),
]

// Person X: acht lückenlose Jahre, echte Mengen. Die Gegenprobe zu Person Y.
const X: Chronikzeile[] = [
  f('kx', 'Person X', 2018, 'Sauen', 2),
  f('kx', 'Person X', 2019, 'Sauen', 10),
  f('kx', 'Person X', 2020, 'Sauen', 5),
  f('kx', 'Person X', 2021, 'Sauen', 4),
  f('kx', 'Person X', 2022, 'Sauen', 7),
  f('kx', 'Person X', 2023, 'Sauen', 1),
  f('kx', 'Person X', 2024, 'Sauen', 6),
  f('kx', 'Person X', 2025, 'Sauen', 5),
]

const bl = blaetter([...Y, ...X])
assert.equal(bl.length, 2, 'Zwei Personen, zwei Blätter')
assert.equal(bl[0].papiername, 'Person X', 'Absteigend nach Gesamtstrecke: 40 vor 7')

const duenn = bl.find((b) => b.papiername === 'Person Y')!
assert.equal(duenn.gesamt, 7, 'Sieben Stück in 14 Kalenderjahren')
assert.equal(duenn.jahre.length, 5, 'Fünf belegte Jahre — die neun leeren erzeugen keine Zeile')
assert.equal(duenn.vonJahr, 2007)
assert.equal(duenn.bisJahr, 2020)
assert.equal(duenn.starkJahr, 2007, 'Das stärkste Jahr ist 2007 mit drei Stück')
assert.equal(duenn.starkSumme, 3)

// --- A10: die Namensregel gilt auch für die Blätter ------------------------
//
// **Sie galt zuerst NUR in `rangliste()`.** `blaetter()` übernahm weiter den
// zuerst gelieferten Namen, die sichtbare Identität eines Blattes hing also an
// der Reihenfolge, in der PostgREST liefert (Fremdprüfung 27.08.2026, A10).
// Derselbe Fall, dieselbe Datei, zwölf Zeilen tiefer — ein wörtlich behobener
// Befund schliesst die genannte Lücke, nicht ihre Klasse.

const ZWEI_NAMEN = [
  f('kz', 'Zulu', 2010, 'Sauen', 1),
  f('kz', 'Alpha', 2011, 'Sauen', 1),
]
assert.equal(
  blaetter(ZWEI_NAMEN)[0].papiername,
  'Alpha',
  'Auch ein Blatt nimmt den alphabetisch ersten Papiernamen seines Kontakts',
)
assert.equal(
  blaetter([...ZWEI_NAMEN].reverse())[0].papiername,
  'Alpha',
  'SABOTAGE-BELEG: umgekehrt geliefert heisst das Blatt genauso',
)

// --- Segmente: eine Lücke trennt, sie wird nicht überbrückt ----------------

assert.deepEqual(
  segmente(duenn.jahre).map((l) => l.map((j) => j.jahr)),
  [[2007, 2008], [2013, 2014], [2020]],
  'Drei Läufe — zwischen 2008 und 2013 liegen vier Jahre, über die die Chronik nichts sagt',
)

const dicht = bl.find((b) => b.papiername === 'Person X')!
assert.equal(segmente(dicht.jahre).length, 1, 'Acht lückenlose Jahre sind EIN Lauf')

// --- Die Zusicherung, die beim Schreiben der Fixtures entstanden ist -------
//
// Die dünne Reihe darf KEINE Kurve bekommen: eine Linie behauptet einen
// Verlauf, über den die Chronik nichts weiss.
//
// **Und das Kriterium „kein Lauf mit zwei Punkten" hätte sie nicht gefangen.**
// Person D hat ZWEI Läufe mit je zwei Jahren (2007–2008 und 2013–2014); die
// Kurve wäre entstanden — zwei kurze Striche und ein Jahr, das gar nicht
// erscheint. Deshalb prüft `blattkurve` zusätzlich, ob mehr Jahre fehlen als
// belegt sind. Die Sabotage dazu steht unten.

assert.equal(
  blattkurve(duenn, 720, 120),
  null,
  'Fünf belegte Jahre in 14 Kalenderjahren ergeben keine Kurve, sondern ein Register',
)
assert.ok(
  segmente(duenn.jahre).filter((l) => l.length >= 2).length >= 2,
  'SABOTAGE-BELEG: es gibt sehr wohl zwei zeichenbare Läufe — das alte Kriterium allein hätte die Kurve zugelassen',
)

const kurveX = blattkurve(dicht, 720, 120)
assert.ok(kurveX, 'Acht lückenlose Jahre ergeben eine Kurve')
assert.equal(kurveX.zuege.length, 1, 'Ein Lauf, ein Zug')
assert.equal(dicht.starkSumme, 10, 'Skaliert wird auf das stärkste Jahr dieser Person')

// --- Die Kurve skaliert von NULL, nicht vom Minimum ------------------------
//
// Anders als `kurve()` in `strecke.ts`. Dort ist die Frage „wie verlief es",
// hier steht die Kurve neben drei anderen: eine Reihe, die ihr Minimum auf die
// Grundlinie legt, sähe neben einer zehnmal grösseren gleich stark aus.

const punkte = kurveX.zuege[0].split(' ').map((p) => Number(p.split(',')[1]))
const jahr2019 = dicht.jahre.findIndex((j) => j.jahr === 2019)
const jahr2023 = dicht.jahre.findIndex((j) => j.jahr === 2023)
assert.equal(punkte[jahr2019], 0, 'Das stärkste Jahr (10) liegt an der Oberkante')
assert.ok(
  punkte[jahr2023] > 100 && punkte[jahr2023] < 120,
  'Das schwächste Jahr (1) liegt NICHT auf der Grundlinie — bei Skalierung ab dem Minimum wäre es exakt 120',
)

// --- Randfälle -------------------------------------------------------------

assert.equal(rangliste([]).zeilen.length, 0, 'Ohne Zeilen keine Rangliste')
assert.equal(blaetter([]).length, 0, 'Ohne Zeilen keine Blätter')
assert.deepEqual(segmente([]), [], 'Ohne Jahre keine Segmente')

// Ein einzelnes Jahr: `bisJahr - vonJahr + 1` ist 1, `jahre.length * 2` ist 2 —
// das Dichte-Kriterium greift NICHT, das Segment-Kriterium schon. Ohne das
// zweite gäbe es hier eine Kurve aus einem Punkt, die lautlos nichts zeichnet.
const einJahr = blaetter([f('ke', 'Person E', 2020, 'Sauen', 4)])[0]
assert.equal(
  blattkurve(einJahr, 720, 120),
  null,
  'Ein einzelnes Jahr ergibt keine Linie — beide Kriterien werden gebraucht',
)

// Eine Zeile ohne Jagdjahr gehört nicht in `familie_jahr` (CHECK NOT NULL) und
// darf kein Blatt erzeugen, falls sie doch je auftaucht.
assert.equal(
  blaetter([{ kontakt_id: 'kx', erleger_name: 'Person X', art_text: 'Sauen', jagdjahr: null, anzahl: 3 }])
    .length,
  0,
  'Eine Zeile ohne Jagdjahr erzeugt kein Blatt',
)


// --- Das Journal -----------------------------------------------------------

// Die Jahresgrenze ist die ganze Frage: das Jagdjahr läuft vom 1. April bis
// zum 31. März und heisst nach seinem Anfangsjahr. Ein Tag daneben verschiebt
// eine Strecke um eine ganze Saison.

assert.equal(jagdjahrVon('2020-04-01'), 2020, 'Der 1. April eröffnet das Jagdjahr 2020/21')
assert.equal(jagdjahrVon('2020-03-31'), 2019, 'Der 31. März gehört noch zu 2019/20')
assert.equal(jagdjahrVon('2020-12-31'), 2020, 'Silvester liegt im Jagdjahr des Kalenderjahres')
assert.equal(jagdjahrVon('2020-01-01'), 2019, 'Neujahr gehört zum Jagdjahr davor')
// Der letzte Tag des echten Bestands.
assert.equal(jagdjahrVon('2026-01-22'), 2025, 'Die Chronik endet in der Saison 2025/26')
assert.equal(jagdjahrVon('kein Datum'), null, 'Was kein ISO-Datum ist, ergibt kein Jahr')

// Gerechnet wird auf dem String. `new Date('2020-04-01')` wäre UTC-Mitternacht
// — westlich von Greenwich der 31. März, und die Zeile spränge ins Vorjahr.
assert.equal(
  jagdjahrVon('2020-04-01'),
  2020,
  'SABOTAGE-BELEG: über ein Date gerechnet hinge dieses Ergebnis an der Zeitzone des Lesers',
)

// Echte Struktur des Bestands: 1997 einzeln, dann eine Lücke bis 2002.
const JOURNAL = [
  { erlegt_am: '1997-11-01', ort_text: 'Söder', art_text: 'Sau', anzahl: 1 },
  { erlegt_am: '2002-10-05', ort_text: 'Fernost', art_text: 'Fasan', anzahl: 8 },
  { erlegt_am: '2003-01-11', ort_text: 'Fernost', art_text: 'Fasan', anzahl: 9 },
  { erlegt_am: '2003-11-02', ort_text: 'Söder', art_text: 'Sau', anzahl: 4 },
  { erlegt_am: '2004-12-18', ort_text: 'Söder', art_text: 'Sau', anzahl: 8 },
]

const jr = journal(JOURNAL)!
assert.ok(jr, 'Fünf Zeilen ergeben ein Journal')
assert.equal(jr.gesamt, 30)
assert.equal(jr.vonJahr, 1997)
assert.equal(jr.bisJahr, 2004, 'Der 11.01.2003 fällt ins Jagdjahr 2002, der 18.12.2004 ins Jahr 2004')
assert.deepEqual(
  jr.jahre.map((j) => [j.jahr, j.summe]),
  [[1997, 1], [2002, 17], [2003, 4], [2004, 8]],
  'Der Januar 2003 zählt zur Saison 2002/03 (8 + 9 = 17), der November 2003 zur Saison 2003/04',
)
assert.equal(jr.starkJahr, 2002, 'Die stärkste Saison ist 2002/03')
assert.deepEqual(jr.arten.map((a) => a.art), ['Fasan', 'Sau'], '17 Fasane vor 13 Sauen')
assert.deepEqual(
  jr.orte.map((o) => [o.art, o.anzahl]),
  [['Fernost', 17], ['Söder', 13]],
  'Absteigend nach Menge — der Ort mit den meisten Stücken ist nicht das eigene Revier',
)

// --- Die Lücke bleibt eine Lücke, auch im Journal --------------------------

assert.deepEqual(
  segmente(jr.jahre).map((l) => l.map((j) => j.jahr)),
  [[1997], [2002, 2003, 2004]],
  'Zwischen 1997 und 2002 sagt das Journal nichts — die Linie unterbricht',
)

// Vier belegte Jahre in acht Kalenderjahren: das Dichte-Kriterium greift.
assert.equal(
  blattkurve(jr, 720, 120),
  null,
  'Halb so viele belegte Jahre wie Kalenderjahre ergeben ein Register, keine Kurve',
)

// --- Das Jahr, das allein zwischen Lücken steht ---------------------------
//
// **Diese Zusicherung fehlte, und die Fixture darüber hatte den Fall bereits.**
// Gefunden erst beim Lauf gegen den echten Bestand: das Journal beginnt 1997,
// danach folgen vier leere Jahre. Der Lauf [1997] hat kein Segment, fiel aus
// `zuege` heraus — und die Achse nannte 1997/98 weiter als Anfang der Reihe.
// Ein Jahr verschwand lautlos aus einem Diagramm, das behauptete, es zu zeigen.

const MIT_INSEL = [
  { erlegt_am: '1997-11-01', ort_text: 'Söder', art_text: 'Sau', anzahl: 1 },
  ...Array.from({ length: 10 }, (_, i) => ({
    erlegt_am: `${2002 + i}-11-01`,
    ort_text: 'Söder',
    art_text: 'Sau',
    anzahl: 3 + i,
  })),
]
const insel = journal(MIT_INSEL)!
const inselkurve = blattkurve(insel, 720, 120)!
assert.ok(inselkurve, 'Elf belegte Jahre in fünfzehn ergeben eine Kurve')
assert.equal(inselkurve.zuege.length, 1, 'Nur der zusammenhängende Lauf wird zur Linie')
assert.equal(
  inselkurve.einzelne.length,
  1,
  'Das allein stehende Jahr 1997 bekommt einen Punkt — sonst zeigt die Kurve es gar nicht',
)
assert.equal(
  inselkurve.einzelne[0].split(',')[0],
  '0.00',
  'Und zwar am linken Rand, dort wo die Achse den Anfang der Reihe nennt',
)
assert.equal(
  blattkurve(dicht, 720, 120)!.einzelne.length,
  0,
  'Eine lückenlose Reihe hat keine einzelnen Jahre',
)

assert.equal(journal([]), null, 'Ohne Zeilen kein Journal')
assert.equal(
  journal([{ erlegt_am: null, ort_text: 'x', art_text: 'y', anzahl: 1 }]),
  null,
  'Eine Zeile ohne Datum erzeugt kein Jahr',
)


// --- Die Jahrestabelle -----------------------------------------------------
//
// Sie ist der Ort, an dem die Jahreswerte als ZAHL stehen. Ohne sie wäre die
// Kurve die einzige Darstellung — für ein Vorlesegerät also gar keine.

const tab = jahrestabelle([dicht, duenn])!
assert.ok(tab, 'Zwei Reihen ergeben eine Tabelle')
assert.equal(tab.zeilen.length, 19, 'Von 2007 bis 2025 sind es 19 Jahre — auch die leeren')
assert.equal(tab.zeilen[0].jahr, 2007, 'Die Spanne beginnt beim frühesten Jahr aller Reihen')
assert.equal(tab.zeilen[18].jahr, 2025, 'und endet beim spätesten')

// Die Kernzusicherung: eine leere Zelle ist null, niemals 0.
const z2010 = tab.zeilen.find((z) => z.jahr === 2010)!
assert.deepEqual(
  z2010.zellen,
  [null, null],
  '2010 hat keine der beiden Reihen einen Eintrag — beide Zellen sind null, keine 0',
)
const z2019 = tab.zeilen.find((z) => z.jahr === 2019)!
assert.deepEqual(z2019.zellen, [10, null], 'Die dichte Reihe trägt 10, die dünne nichts')

assert.deepEqual(tab.summen, [40, 7], 'Die Spaltensummen sind die Gesamtstrecken der Reihen')
assert.equal(jahrestabelle([]), null, 'Ohne Reihen keine Tabelle')


// --- Der leere `art_text` --------------------------------------------------
//
// **Der offene Punkt der Schlusslesung (27.08.2026).** Der CHECK aus 110
// verlangt nur `art_text IS NOT NULL`; ein leerer String erfüllt ihn. Eine
// solche Zeile zählte in `gesamt`, aber in keine Spalte — und damit ergäben
// die Spaltensummen im Tabellenfuss still nicht mehr die Gesamtsumme. Dieselbe
// Leerstring-Lücke wie bei `erleger_name`, an der dritten Spalte.

const LEERE_ART = rangliste([
  r('ka', 'Person A', 'Sauen', 5),
  r('kb', 'Person B', '', 3),
  r('kc', 'Person C', '   ', 2),
])
assert.equal(LEERE_ART.gesamt, 10, 'Die Zeilen ohne Artangabe zählen in die Gesamtstrecke')
assert.equal(
  LEERE_ART.spalten.reduce((sum, s) => sum + s.anzahl, 0),
  LEERE_ART.gesamt,
  'Und sie zählen in eine Spalte — sonst widersprächen sich Fuss und Summe',
)
assert.ok(
  LEERE_ART.spalten.some((s) => s.art === OHNE_ART),
  'Sie bekommen einen eigenen, benannten Topf statt gar keinen',
)
assert.equal(
  LEERE_ART.spalten.find((s) => s.art === OHNE_ART)!.anzahl,
  5,
  'Leerer String und blosser Leerraum landen im selben Topf',
)

// Eine Zeile mit `art_text = null` gehört zur Quelle `jagden_soeder`, die diese
// Datei gar nicht liest — sie bekommt KEINEN Topf, zählt aber in die Summe.
const NULL_ART = rangliste([r('kd', 'Person D', null as unknown as string, 4)])
assert.equal(NULL_ART.gesamt, 4, 'Auch sie fehlt der Gesamtstrecke nicht')
assert.equal(NULL_ART.spalten.length, 0, 'Aber sie erzeugt keine Artenspalte')


// --- Der leere `art_text` an den ANDEREN zwei Stellen ----------------------
//
// **`artVon()` sitzt an drei Aufrufstellen, die Zusicherung sass an einer**
// (Delta-Durchgang 27.08.2026). Genau die Bauform, die dieser Diff schon
// zweimal produziert hat: der Fix greift überall, der Beleg an einer Stelle —
// und damit bliebe eine spätere Änderung an `blaetter()` oder `journal()`
// unbemerkt, die den Topf wieder fallen lässt.

const BLATT_LEERE_ART = blaetter([
  f('kl', 'Person L', 2020, 'Sauen', 3),
  f('kl', 'Person L', 2021, '', 2),
])[0]
assert.equal(BLATT_LEERE_ART.gesamt, 5, 'Die Zeile ohne Artangabe zählt in die Blattsumme')
assert.equal(
  BLATT_LEERE_ART.arten.reduce((s, a) => s + a.anzahl, 0),
  5,
  'Und in eine Art — sonst widerspräche das Register der Kopfzeile darüber',
)
assert.ok(
  BLATT_LEERE_ART.arten.some((a) => a.art === OHNE_ART),
  'Auch im Blatt bekommt sie den benannten Topf',
)

const JOURNAL_LEER = journal([
  { erlegt_am: '2020-11-01', ort_text: 'Söder', art_text: 'Sau', anzahl: 3 },
  { erlegt_am: '2021-11-01', ort_text: '', art_text: '  ', anzahl: 2 },
])!
assert.equal(JOURNAL_LEER.gesamt, 5)
assert.equal(
  JOURNAL_LEER.arten.reduce((s, a) => s + a.anzahl, 0),
  5,
  'Auch im Journal zählt die Zeile ohne Artangabe in eine Art',
)
assert.equal(
  JOURNAL_LEER.orte.reduce((s, o) => s + o.anzahl, 0),
  5,
  'und in einen Ort — das Ort-Register muss die Gesamtsumme ergeben',
)
assert.ok(
  JOURNAL_LEER.orte.some((o) => o.art === OHNE_ORT),
  'Der Sammeltopf für Zeilen ohne Ortsangabe ist benannt, nicht leer',
)

// --- Der Sammeltopf ist KEIN Ort ------------------------------------------
//
// `orte.length` wäre hier 2, und die Seite nennt diese Zahl zweimal in Prosa
// („reicht über N Orte"). Ein einziger Eintrag ohne Ortsangabe machte aus 56
// Orten 57 (Delta-Durchgang 27.08.2026).

assert.equal(JOURNAL_LEER.orte.length, 2, 'Das Register zeigt beide Töpfe')
assert.equal(
  JOURNAL_LEER.orteBenannt,
  1,
  'Gezählt wird aber nur der benannte — „Ohne Ortsangabe" ist kein Ort',
)
assert.equal(
  journal([{ erlegt_am: '2020-11-01', ort_text: 'Söder', art_text: 'Sau', anzahl: 1 }])!
    .orteBenannt,
  1,
  'Ohne Sammeltopf sind beide Zahlen gleich',
)

// --- `anteil()` ------------------------------------------------------------
//
// Steht in `statistik.ts` statt in der Seite, damit genau diese Zeilen
// laufen können (Delta-Durchgang 27.08.2026).

assert.equal(anteil(697, 1394), '50 %', 'Die Hälfte ist 50 %')
assert.equal(anteil(1394, 1394), '100 %')
assert.equal(anteil(6, 1394), '< 1 %', 'Sechs von 1394 sind gerundet 0 — das wäre gelogen')
assert.equal(anteil(7, 1394), '1 %', 'Sieben runden auf 1 und dürfen es zeigen')
assert.equal(anteil(0, 1394), '< 1 %', 'Auch die echte Null steht nie als „0 %" da')
assert.equal(anteil(1, 0), '—', 'Ohne Gesamtmenge gibt es keinen Anteil, auch kein NaN')

console.log('statistik.selftest.ts: alle Zusicherungen erfüllt')
