// Gegenprobe fuer die Mitgliedschaftsrechnung der Standgruppen (Portal-Phase 4b).
// Kein Test-Runner im Repo, deshalb ein eigenstaendiges Skript
// (Muster: treiben.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/revier/standgruppen.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
// Wird vom Sammel-Script `npm run selftest` per Glob mitgenommen.
import assert from 'node:assert/strict'
import {
  alleStaende,
  ausZeilen,
  gruppenDiff,
  imRechteck,
  markierungAus,
  vergeben,
} from './standgruppen.ts'

// --- markierungAus(): der Zustand, mit dem die Komponente gruppenDiff fuettert ---
//
// **Diese Reihe gab es zuerst NICHT, und genau in der Luecke sass der schwerste
// Befund des Tages** (Schlusslesung 17.08.2026, F1). Das Seeding stand als
// `new Set(g.staende)` inline in `oeffnen()`; die Umtyp-Zusicherung weiter unten
// fuetterte `gruppenDiff` von Hand mit `markiert = {A}` — einem Zustand, den die
// Komponente nie herstellt. Der Test war gruen und belegte die Funktion, nicht
// das Feature.
//
// **Was diese Reihe NICHT deckt, ausdruecklich** (Delta-Durchgang 17.08.2026,
// D5): die AUFRUFSTELLE. Wer `oeffnen()` auf `new Set(g.staende)` zurueckbaut
// oder dort `sichtbar` statt `waehlbar` uebergibt, bekommt weiterhin einen
// gruenen Lauf — die Mutationsprobe M5 traf den Funktionsrumpf, nicht den
// Aufruf. Ohne Komponententest-Runner bleibt das offen; der Gewinn ist, dass
// die Restluecke jetzt auf zwei kommentierten Zeilen sitzt statt auf einem
// unbenannten Inline-Seeding.
assert.deepEqual(
  [...markierungAus(['A', 'UMGETYPT'], new Set(['A', 'B']))],
  ['A'],
  'ein nicht waehlbares Mitglied startet NICHT als angetippt',
)
assert.deepEqual(
  [...markierungAus(['A', 'IM_PAPIERKORB'], new Set(['A', 'B']))],
  ['A'],
  'ein Mitglied im Papierkorb ebenso wenig',
)
assert.deepEqual(
  [...markierungAus(['A', 'B'], new Set(['A', 'B', 'C']))],
  ['A', 'B'],
  'Positivkontrolle: waehlbare Mitglieder starten angetippt',
)
assert.deepEqual([...markierungAus([], new Set(['A']))], [], 'leere Gruppe')

// --- gruppenDiff(): der Kern ---

// Positivkontrolle zuerst: ohne sie belegt die Reihe darunter nur, dass die
// Funktion gern nichts tut.
const basis = ['A', 'B']
const diffPositiv = gruppenDiff(basis, new Set(['B', 'C']), new Set(['A', 'B', 'C']))
assert.deepEqual(diffPositiv.entfernen, ['A'], 'A wurde abgewaehlt')
assert.deepEqual(diffPositiv.legen, ['C'], 'C ist neu')
assert.equal(
  diffPositiv.entfernen.length + diffPositiv.legen.length,
  2,
  'eine Aenderung je Richtung',
)

// Nichts geaendert heisst nichts schreiben.
const diffGleich = gruppenDiff(basis, new Set(['A', 'B']), new Set(['A', 'B', 'C']))
assert.deepEqual(diffGleich, { entfernen: [], legen: [] })

// **Ein Stand im Papierkorb behaelt seine Mitgliedschaft.** Der Fremdschluessel
// ist `on delete cascade`, aber ein Soft-Delete loescht keine Zeile — die
// Mitgliedschaft bleibt, waehrend die SELECT-Policies auf `map_objects` den
// Stand ausblenden (an der Produktion gemessen 17.08.2026). Ohne den
// `sichtbar`-Riegel raeumte der erste Speichervorgang sie still weg, und wer den
// Stand spaeter zurueckholte, bekaeme ihn ohne seine Gruppen zurueck.
const mitPapierkorb = ['A', 'IM_PAPIERKORB']
const diffPapierkorb = gruppenDiff(mitPapierkorb, new Set(['A']), new Set(['A', 'B']))
assert.deepEqual(diffPapierkorb.entfernen, [], 'unsichtbar heisst nicht abgewaehlt')
assert.deepEqual(diffPapierkorb.legen, [])
// ... auch dann, wenn sonst alles abgewaehlt wird.
const diffPapierkorbLeer = gruppenDiff(mitPapierkorb, new Set(), new Set(['A', 'B']))
assert.deepEqual(diffPapierkorbLeer.entfernen, ['A'], 'nur der sichtbare Stand geht')

// **Ein UMGETYPTER Stand wird abgewaehlt, ein geloeschter nicht — und genau
// dafuer traegt `sichtbar` alle Objekttypen und nicht nur die waehlbaren**
// (Fremdpruefung Codex 17.08.2026, Nr. 5). Wer im Objekt-Inspektor einen
// Hochsitz zum Parkplatz macht, nimmt ihn von der Karte, aber nicht aus dem
// Revier. Waeren beide Mengen dieselbe, fiele er unter den Papierkorb-Schutz
// und die Mitgliedschaft waere GEFANGEN: mitgezaehlt, nicht sichtbar, nicht
// entfernbar ausser durch Loeschen der ganzen Gruppe.
//
// Hier ist 'UMGETYPT' sichtbar (es ist ein Objekt des Reviers), aber nicht
// markiert (es steht nicht auf der Karte) -> es geht raus, sichtbar als `-1`
// am Zaehler, bevor gespeichert wird.
// **Geprueft wird die KETTE, die die Komponente faehrt** — `markierungAus()`
// beim Oeffnen, dann `gruppenDiff()` beim Speichern. Die erste Fassung setzte
// `markiert` hier von Hand auf `{A}` und belegte damit nichts ueber das
// Feature: die Komponente seedete in Wahrheit ALLE Mitglieder, das umgetypte
// war angetippt, fiel aus `entfernen` heraus und blieb gefangen.
const gruppeStaende = ['A', 'UMGETYPT']
const aufDerKarte = new Set(['A', 'B']) // nur Standtypen
const imRevier = new Set(['A', 'B', 'UMGETYPT']) // alle Objekte

const diffUmgetypt = gruppenDiff(
  gruppeStaende,
  markierungAus(gruppeStaende, aufDerKarte),
  imRevier,
)
assert.deepEqual(diffUmgetypt.entfernen, ['UMGETYPT'], 'kein Stand mehr, also raus aus der Gruppe')
assert.deepEqual(diffUmgetypt.legen, [], 'und nichts wird dabei neu angelegt')

// Gegenprobe auf derselben Kette: ein Mitglied im PAPIERKORB ist ebenfalls
// nicht angetippt — es darf trotzdem NICHT hinausfliegen, weil `sichtbar` es
// nicht enthaelt. Die beiden Faelle unterscheiden sich allein darin.
const mitBeiden = ['A', 'UMGETYPT', 'IM_PAPIERKORB']
const diffBeide = gruppenDiff(mitBeiden, markierungAus(mitBeiden, aufDerKarte), imRevier)
assert.deepEqual(
  diffBeide.entfernen,
  ['UMGETYPT'],
  'nur der umgetypte geht, der geloeschte bleibt',
)

// **`markiert` ist NICHT immer eine Teilmenge von `sichtbar`** — die Auswahl
// steht im Browser, waehrend jemand den Stand in den Papierkorb legt. Beim
// naechsten Rendern ist der Stand markiert, aber nicht mehr sichtbar; angelegt
// werden darf er trotzdem nicht, denn die Zeile gibt es schon.
//
// **Was diese Zusicherung NICHT belegt, und der erste Kommentar behauptete es**
// (Mutationsprobe M2, 17.08.2026): dass `vorhanden` gegen ALLE Mitglieder
// pruefen muss statt nur gegen die sichtbaren. Die Mutation blieb gruen —
// `legen` verlangt selbst `sichtbar.has(id)`, ein sichtbares Mitglied liegt
// also in beiden Fassungen von `vorhanden`. Gehalten wird der Fall hier vom
// `sichtbar`-Riegel (M3), nicht von `vorhanden`.
const nurWeg = ['IM_PAPIERKORB']
const diffWegMarkiert = gruppenDiff(nurWeg, new Set(['IM_PAPIERKORB']), new Set(['A']))
assert.deepEqual(diffWegMarkiert.legen, [], 'die Zeile gibt es schon, auch wenn sie unsichtbar ist')
assert.deepEqual(diffWegMarkiert.entfernen, [], 'und abgewaehlt wurde sie auch nicht')

// **Ein markierter, aber unsichtbarer Stand wird NICHT angelegt.** Der
// Fremdschluessel griffe nicht — die `map_objects`-Zeile existiert noch, sie
// traegt nur `deleted_at`. Die Gruppe bekaeme lautlos ein Mitglied, das keine
// Karte je wieder zeigt und das niemand mehr abwaehlen kann.
const diffTot = gruppenDiff([], new Set(['WEG']), new Set(['A']))
assert.deepEqual(diffTot.legen, [], 'was nicht auf der Karte steht, wird nicht verknuepft')
assert.deepEqual(diffTot.entfernen, [])
// Positivkontrolle daneben: sichtbar UND markiert wird sehr wohl angelegt.
assert.deepEqual(gruppenDiff([], new Set(['A']), new Set(['A'])).legen, ['A'])

// Eine leere Gruppe laesst sich befuellen, eine volle komplett raeumen.
assert.deepEqual(gruppenDiff([], new Set(['A', 'B']), new Set(['A', 'B'])).legen, ['A', 'B'])
assert.deepEqual(gruppenDiff(basis, new Set(), new Set(['A', 'B'])).entfernen, ['A', 'B'])

// Ein doppelt gelieferter Stand wird nicht zweimal gelegt. Der
// Primaerschluessel macht das in der DB unmoeglich; hier faellt es auf, falls
// `vorhanden` je von einem Set auf ein Array zurueckgebaut wird.
assert.deepEqual(gruppenDiff(['A', 'A'], new Set(['A']), new Set(['A'])).legen, [])

// --- ausZeilen(): PostgREST-Form -> Domaenenform ---
const ausZwei = ausZeilen([
  {
    id: 'g1',
    name: 'Sauberg',
    standgruppen_staende: [{ map_object_id: 'M1' }, { map_object_id: 'M2' }],
  },
  { id: 'g2', name: 'Buchberg', standgruppen_staende: [] },
])
assert.deepEqual(ausZwei, [
  { id: 'g1', name: 'Sauberg', staende: ['M1', 'M2'] },
  { id: 'g2', name: 'Buchberg', staende: [] },
])
assert.deepEqual(ausZeilen([]), [], 'ein Revier ohne Gruppen')

// --- vergeben(): das UI-Gate vor dem UNIQUE ---
//
// **Die Funktion lebte bis zum 18.08.2026 inline in der Komponente** und war
// damit fuer keinen Test erreichbar. Sie ist herausgezogen worden, weil zwei
// Seiten sie brauchen (Anlegen in der Liste, Umbenennen am Band der Karte) —
// und die Gelegenheit ist genau die, bei der sie Zusicherungen bekommt.
const drei = [
  { id: 'g1', name: 'Sauberg', staende: [] },
  { id: 'g2', name: 'Buchberg', staende: [] },
  { id: 'g3', name: 'sauberg', staende: [] },
]

assert.equal(vergeben(drei, 'Sauberg'), true, 'derselbe Name ist vergeben')
assert.equal(vergeben(drei, 'Dornenbuesche'), false, 'ein freier Name ist frei')
assert.equal(vergeben([], 'Sauberg'), false, 'im leeren Revier ist jeder Name frei')

// Beim UMBENENNEN zaehlt die eigene Zeile nicht mit — sonst koennte eine Gruppe
// ihren eigenen Namen nicht behalten, waehrend man nur Staende aendert.
assert.equal(vergeben(drei, 'Sauberg', 'g1'), false, 'die eigene Zeile zaehlt nicht')
assert.equal(vergeben(drei, 'Sauberg', 'g2'), true, 'eine FREMDE Zeile sehr wohl')

// **Zeichengenau, nicht case-insensitiv** — wie `UNIQUE (district_id, name)`.
// Ein Gate, das mehr verbietet als die Regel dahinter, ist ein Fehler: „sauberg"
// und „Sauberg" duerfen in der DB nebeneinanderstehen, also auch hier.
assert.equal(vergeben(drei, 'SAUBERG'), false, 'Grossschreibung ist ein anderer Name')
assert.equal(
  vergeben([{ id: 'g1', name: 'Sauberg', staende: [] }], 'sauberg'),
  false,
  'Kleinschreibung ebenso — der Constraint erlaubt beide nebeneinander',
)

// --- alleStaende(): Stufe 1 der Kartenanzeige (C-43, 18.08.2026) ---
//
// Die Zusicherung, auf die es ankommt, ist die dritte: waehrend des Bearbeitens
// muss die AKTIVE Gruppe ihre GEZEIGTE Menge beisteuern. Sonst leuchtet ein eben
// abgewaehlter Stand weiter, waehrend der Zaehler daneben `−1` meldet — Karte
// und Zaehler behaupteten Verschiedenes ueber denselben Klick.
const zwei = [
  { id: 'g1', name: 'Sauberg', staende: ['A', 'B'] },
  { id: 'g2', name: 'Buchberg', staende: ['C'] },
]

assert.deepEqual(
  [...alleStaende(zwei, null, null)].sort(),
  ['A', 'B', 'C'],
  'ohne Auswahl zaehlt jede gespeicherte Menge',
)

assert.deepEqual(
  [...alleStaende(zwei, 'g1', null)].sort(),
  ['A', 'B', 'C'],
  'eine aktive Gruppe OHNE Entwurf aendert nichts',
)

assert.deepEqual(
  [...alleStaende(zwei, 'g1', new Set(['A']))].sort(),
  ['A', 'C'],
  'der Entwurf der aktiven Gruppe ersetzt ihre gespeicherte Menge — B ist abgewaehlt',
)

assert.deepEqual(
  [...alleStaende(zwei, 'g1', new Set(['A', 'B', 'D']))].sort(),
  ['A', 'B', 'C', 'D'],
  'ein neu angetippter Stand leuchtet sofort mit',
)

// Ein Stand in ZWEI Gruppen faellt nur einmal an — es ist eine Menge, keine
// Liste. Ohne das zaehlte die Karte ihn doppelt, was heute folgenlos waere und
// beim ersten `size`-Leser nicht mehr.
assert.deepEqual(
  [
    ...alleStaende(
      [
        { id: 'g1', name: 'Sauberg', staende: ['A', 'B'] },
        { id: 'g2', name: 'Buchberg', staende: ['B', 'C'] },
      ],
      null,
      null,
    ),
  ].sort(),
  ['A', 'B', 'C'],
  'ueberlappende Gruppen ergeben eine Menge, keine Doppelung',
)

// Der Entwurf einer Gruppe darf einen Stand NICHT aus einer anderen Gruppe
// nehmen: wer B aus „Sauberg" abwaehlt, waehrend „Buchberg" ihn ebenfalls
// fuehrt, sieht ihn weiter leuchten — richtig so, er ist ja noch vergeben.
assert.deepEqual(
  [
    ...alleStaende(
      [
        { id: 'g1', name: 'Sauberg', staende: ['A', 'B'] },
        { id: 'g2', name: 'Buchberg', staende: ['B'] },
      ],
      'g1',
      new Set(['A']),
    ),
  ].sort(),
  ['A', 'B'],
  'ein Stand, den eine ANDERE Gruppe fuehrt, leuchtet nach dem Abwaehlen weiter',
)

assert.deepEqual([...alleStaende([], null, null)], [], 'ein Revier ohne Gruppen leuchtet nicht')

// --- imRechteck(): die Rechteckauswahl (C-45, 18.08.2026) ---
//
// Ein Raster aus vier Staenden plus einem Objekt, das NICHT waehlbar ist
// (Parkplatz oder im Papierkorb — fuer die Rechnung dasselbe).
const raster = [
  { id: 'NW', lat: 53.30, lng: 10.30 },
  { id: 'NO', lat: 53.30, lng: 10.40 },
  { id: 'SW', lat: 53.20, lng: 10.30 },
  { id: 'SO', lat: 53.20, lng: 10.40 },
  { id: 'PARKPLATZ', lat: 53.25, lng: 10.35 },
]
const nurStaende = new Set(['NW', 'NO', 'SW', 'SO'])

// Positivkontrolle zuerst: ohne sie belegt die Reihe darunter nur, dass die
// Funktion gern nichts trifft.
assert.deepEqual(
  imRechteck(raster, nurStaende, { lat: 53.25, lng: 10.25 }, { lat: 53.35, lng: 10.45 }),
  ['NW', 'NO'],
  'ein Rechteck ueber der Nordhaelfte nimmt genau deren zwei Staende',
)

// **Die Richtungsunabhaengigkeit ist der Grund, warum die Normalisierung hier
// steht und nicht im Layer.** Gezogen wird in alle vier Richtungen; jede muss
// dieselbe Menge liefern.
const vonNW = imRechteck(raster, nurStaende, { lat: 53.35, lng: 10.25 }, { lat: 53.25, lng: 10.45 })
const vonSO = imRechteck(raster, nurStaende, { lat: 53.25, lng: 10.45 }, { lat: 53.35, lng: 10.25 })
const vonNO = imRechteck(raster, nurStaende, { lat: 53.35, lng: 10.45 }, { lat: 53.25, lng: 10.25 })
const vonSW = imRechteck(raster, nurStaende, { lat: 53.25, lng: 10.25 }, { lat: 53.35, lng: 10.45 })
assert.deepEqual(vonNW, ['NW', 'NO'], 'von Nordwest gezogen')
assert.deepEqual(vonSO, vonNW, 'von Suedost gezogen ergibt dasselbe')
assert.deepEqual(vonNO, vonNW, 'von Nordost gezogen ergibt dasselbe')
assert.deepEqual(vonSW, vonNW, 'von Suedwest gezogen ergibt dasselbe')

// **Der `waehlbar`-Riegel, zeichengleich zum Einzelklick.** Der Parkplatz liegt
// mitten im Rechteck und bleibt trotzdem draussen — sonst holte ein Zug ueber
// das halbe Revier genau die Objekte herein, die auf der Karte gar nicht als
// Stand erscheinen.
assert.deepEqual(
  imRechteck(raster, nurStaende, { lat: 53.15, lng: 10.25 }, { lat: 53.35, lng: 10.45 }),
  ['NW', 'NO', 'SW', 'SO'],
  'ein Rechteck ueber allem nimmt die vier Staende und NICHT den Parkplatz',
)
assert.deepEqual(
  imRechteck(raster, new Set(), { lat: 53.15, lng: 10.25 }, { lat: 53.35, lng: 10.45 }),
  [],
  'ohne waehlbare Staende nimmt auch das groesste Rechteck nichts',
)

// Die Kante zaehlt als drinnen: ein Rechteck, das genau auf den Punkten endet,
// nimmt sie mit. Ein Punkt, der auf der Linie liegt und herausfaellt, waere dem
// Nutzer nicht erklaerbar.
assert.deepEqual(
  imRechteck(raster, nurStaende, { lat: 53.30, lng: 10.30 }, { lat: 53.20, lng: 10.40 }),
  ['NW', 'NO', 'SW', 'SO'],
  'Staende genau auf der Kante liegen drinnen',
)

// **Ein entartetes Rechteck trifft, was auf seiner Linie liegt — und das ist
// gewollt.** Die erste Fassung dieses Blocks behauptete das Gegenteil („ein Zug
// ohne Flaeche trifft nichts") und blieb nur deshalb gruen, weil der Testpunkt
// neben allem lag. **Die Fremdpruefung hat beides gefunden** (Codex 19.08.2026,
// P1/P6/P9): die zu starke Behauptung im Kommentar UND die Zusicherung, die sie
// nicht deckt.
//
// Richtig ist: `imRechteck` prueft keine Flaeche. Der Riegel gegen einen
// versehentlichen Klick sitzt als Pixelschwelle im Layer und muss dort sitzen —
// s. den Kopf der Funktion. Ein waagerechter Zug ueber zwei Staende ist ein
// Zug, kein Tipp.
assert.deepEqual(
  imRechteck(raster, nurStaende, { lat: 53.30, lng: 10.25 }, { lat: 53.30, lng: 10.45 }),
  ['NW', 'NO'],
  'ein waagerechter Zug ueber zwei Staende nimmt beide, obwohl er keine Hoehe hat',
)
assert.deepEqual(
  imRechteck(raster, nurStaende, { lat: 53.20, lng: 10.30 }, { lat: 53.30, lng: 10.30 }),
  ['NW', 'SW'],
  'dasselbe senkrecht, ohne Breite',
)
// Neben allem liegt neben allem — auch ohne Flaeche.
assert.deepEqual(
  imRechteck(raster, nurStaende, { lat: 53.2501, lng: 10.3501 }, { lat: 53.2501, lng: 10.3501 }),
  [],
  'ein Punktzug neben den Staenden trifft nichts',
)

assert.deepEqual(
  imRechteck([], nurStaende, { lat: 53.1, lng: 10.1 }, { lat: 53.9, lng: 10.9 }),
  [],
  'ein Revier ohne Objekte liefert nichts',
)

// Nichts getroffen heisst nichts hinzufuegen — das Rechteck liegt neben allem.
assert.deepEqual(
  imRechteck(raster, nurStaende, { lat: 52.0, lng: 9.0 }, { lat: 52.1, lng: 9.1 }),
  [],
  'ein Rechteck abseits des Reviers trifft nichts',
)

console.log('standgruppen.selftest.ts: alle Zusicherungen gehalten')
