// Gegenprobe fuer die Standzustands-Logik der Revierzentrale. Kein Test-Runner
// im Repo, deshalb ein eigenstaendiges Skript (Muster: objekte.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/wartung.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import { OBJEKT_TYPEN } from './objekte.ts'
import {
  WARTBAR,
  alsPruefungen,
  ampel,
  bilanz,
  inDieserSaison,
  istWartbar,
  zustandsSatz,
  type Pruefung,
  type PruefStatus,
} from './wartung.ts'

// Das Jagdjahr 26/27: 1. April 2026 bis 1. April 2027, Berliner Mitternacht.
// Am 1. April gilt Sommerzeit, deshalb +02:00. Ein Testintervall, KEIN Nachbau
// der Regel — die steht in `src/lib/diary/season.ts` und wird ueber
// `getJagdjahr()` hereingereicht (s. Dateikopf von `wartung.ts`).
const SAISON = {
  start: new Date('2026-04-01T00:00:00+02:00'),
  end: new Date('2027-04-01T00:00:00+02:00'),
}

/** Ein fester Jetzt-Zeitpunkt, mitten in dieser Saison. */
const JETZT = new Date('2026-08-25T10:00:00+02:00')

function pruefung(status: PruefStatus, checkedAt: string): Pruefung {
  return { status, checkedAt, note: null, checkedBy: null }
}

// ---------------------------------------------------------------------------
// 1. Der Riegel gegen einen neuen Enum-Wert
//
// Das ist der eigentliche Zweck dieses Selbsttests. `WARTBAR` ist eine Kopie
// der Typliste; faellt sie auseinander, zaehlt eine Kachel still falsch. Beide
// Richtungen pruefen: ein fehlender Schluessel liesse den neuen Typ stumm aus
// der Bilanz fallen, ein ueberzaehliger behauptete einen Enum-Wert, den es
// nicht gibt.
//
// **WAS DIESER RIEGEL NICHT LEISTET, und das gehoert hierhin** (Fremdpruefung
// 25.08.2026, `[medium]`): er vergleicht zwei LOKALE Listen miteinander. Fuegt
// eine Migration einen elften `map_object_type` hinzu und ruehrt niemand die
// beiden Kopien an, laeuft dieser Test weiter gruen — `istWartbar()` gibt fuer
// den neuen Typ `false`, und `bilanz()` weist Bestand und offene Arbeit still
// zu KLEIN aus. Gegen das DB-Enum prueft hier nichts, und es gibt in diesem
// Repo keine CI, die es koennte (AGENTS.md: „Coolify baut nur").
// `objekte.selftest.ts` hat dieselbe Grenze; die Enum-Reihenfolge dort ist
// ebenfalls eine Momentaufnahme („gemessen am 27.07.2026"). Wer eine Migration
// an `map_object_type` schreibt, fasst beide Listen an — das ist eine
// Verabredung, kein Riegel, und als solche steht sie hier.
// ---------------------------------------------------------------------------
{
  const ausEnum = OBJEKT_TYPEN.map((t) => t.wert).sort()
  const ausWartbar = Object.keys(WARTBAR).sort()
  assert.deepEqual(
    ausWartbar,
    ausEnum,
    'WARTBAR und OBJEKT_TYPEN sind auseinandergelaufen — ein neuer map_object_type ' +
      'gehoert in beide Listen, mit bewusster Entscheidung true/false',
  )
}

// `adhoc` ist der Typ, den nur die Feld-App kennt. Er darf hier nicht
// auftauchen — und wenn er es doch tut, ist das eine Entscheidung, kein
// Versehen.
assert.equal(istWartbar('adhoc'), false, 'adhoc ist ein Ereignis, kein Inventar')

// Unbekanntes ist nicht wartbar, statt undefined durchzureichen.
assert.equal(istWartbar('gibtesnicht'), false)

// Die sieben, die gepflegt werden — weiter als `istStand()`, s. Begruendung
// in `wartung.ts`.
for (const typ of ['hochsitz', 'kanzel', 'drueckjagdstand', 'kirrung', 'salzlecke', 'wildacker', 'wildkamera']) {
  assert.equal(istWartbar(typ), true, `${typ} sollte wartbar sein`)
}
for (const typ of ['parkplatz', 'notfall_treffpunkt', 'sonstiges']) {
  assert.equal(istWartbar(typ), false, `${typ} hat keinen Wartungszustand`)
}

// ---------------------------------------------------------------------------
// 2. inDieserSaison — die Raender und das, was durchrutschen koennte
// ---------------------------------------------------------------------------
assert.equal(inDieserSaison('2026-04-01T00:00:00+02:00', SAISON, JETZT), true, 'der Anfang zaehlt mit')
assert.equal(inDieserSaison('2026-03-31T23:59:59+02:00', SAISON, JETZT), false, 'der Tag davor nicht')
assert.equal(inDieserSaison('2027-04-01T00:00:00+02:00', SAISON, JETZT), false, 'das Ende ist exklusiv')
assert.equal(inDieserSaison('2026-08-22T13:34:05.756836+00:00', SAISON, JETZT), true, 'echte Zeile aus der Produktion')

// Ein Zeitstempel aus der Zukunft ist NICHT „diese Saison bestaetigt".
// `checked_at` ist client-bestimmbar (Backlog CN-80) — ohne die obere Grenze
// waere so eine Zeile dauerhaft frisch und die Kachel dauerhaft gruen.
assert.equal(inDieserSaison('2099-01-01T00:00:00Z', SAISON, JETZT), false, 'Zukunft zaehlt nicht als frisch')

// **Der Fall, den mein eigener Test verpasst hat** (Fremdpruefung 25.08.2026,
// `[hoch]`): ein Zeitpunkt IN dieser Saison, aber in der ZUKUNFT. Die ferne
// Zukunft faengt schon die Saisongrenze, diese hier nicht — und `checked_at`
// ist client-bestimmbar (CN-80). Ohne die Jetzt-Grenze waere der Stand gruen
// und zugleich aus `offen` verschwunden.
assert.equal(inDieserSaison('2027-03-01T10:00:00+01:00', SAISON, JETZT), false, 'Maerz 2027 hat noch nicht stattgefunden')
assert.equal(inDieserSaison('2026-08-25T10:00:01+02:00', SAISON, JETZT), false, 'eine Sekunde nach jetzt zaehlt nicht')
assert.equal(inDieserSaison('2026-08-25T10:00:00+02:00', SAISON, JETZT), true, 'genau jetzt zaehlt')

// Unlesbares Datum: „muss angesehen werden" statt „ist erledigt".
assert.equal(inDieserSaison('kein datum', SAISON, JETZT), false)
assert.equal(inDieserSaison('', SAISON, JETZT), false)

// ---------------------------------------------------------------------------
// 3. Die Ampel — sechs Zustaende, zwei Achsen
// ---------------------------------------------------------------------------
assert.equal(ampel(undefined, SAISON, JETZT), 'offen', 'nie geprueft traegt keine Marke')

assert.equal(ampel(pruefung('ok', '2026-08-22T10:00:00Z'), SAISON, JETZT), 'ok-voll')
assert.equal(ampel(pruefung('ok', '2025-11-01T10:00:00Z'), SAISON, JETZT), 'ok-hohl', 'heil verfaellt sichtbar')

assert.equal(ampel(pruefung('mangel', '2026-08-22T10:00:00Z'), SAISON, JETZT), 'mangel-voll')
assert.equal(ampel(pruefung('mangel', '2025-11-01T10:00:00Z'), SAISON, JETZT), 'mangel-hohl')

// Die sicherheitsrelevante Haelfte: eine Sperre altert NICHT. Weder in der
// Farbe noch in der Fuellung — es gibt kein `gesperrt-hohl`.
assert.equal(ampel(pruefung('gesperrt', '2026-08-22T10:00:00Z'), SAISON, JETZT), 'gesperrt')
assert.equal(ampel(pruefung('gesperrt', '2019-01-01T10:00:00Z'), SAISON, JETZT), 'gesperrt', 'eine Sperre altert nicht')

// Gelb wird von selbst weder gruen noch rot (Moritz, 25.08.2026). Es aendert
// nur die Fuellung — genau der Unterschied, den die beiden Zeilen oben zeigen.
assert.notEqual(ampel(pruefung('mangel', '2019-01-01T10:00:00Z'), SAISON, JETZT), 'ok-hohl')
assert.notEqual(ampel(pruefung('mangel', '2019-01-01T10:00:00Z'), SAISON, JETZT), 'gesperrt')

// **Ein unbekannter Status kommt gar nicht erst bis hierher** — der Filter
// sitzt in `alsPruefungen()` (s. Punkt 5 unten). Vorher fiel er in den
// `ok`-Zweig und wurde GRUEN; das war fail-open bei einer Sicherheitsaussage
// (Fremdpruefung 25.08.2026, `[medium]`).

// ---------------------------------------------------------------------------
// 4. Die Bilanz — und dass ihre vier Zahlen sich NICHT addieren
// ---------------------------------------------------------------------------
{
  const objekte = [
    { id: 'a', typ: 'hochsitz' },       // diese Saison ok      -> nur sitze
    { id: 'b', typ: 'kanzel' },         // Mangel, frisch       -> mangel
    { id: 'c', typ: 'drueckjagdstand' },// Mangel, alt          -> offen UND mangel
    { id: 'd', typ: 'hochsitz' },       // gesperrt, frisch     -> gesperrt
    { id: 'e', typ: 'kanzel' },         // gesperrt, alt        -> offen UND gesperrt
    { id: 'f', typ: 'kirrung' },        // nie geprueft         -> offen
    { id: 'g', typ: 'sonstiges' },      // nicht wartbar        -> zaehlt gar nicht
    { id: 'h', typ: 'parkplatz' },      // nicht wartbar        -> zaehlt gar nicht
  ]
  const pruefungen = new Map<string, Pruefung>([
    ['a', pruefung('ok', '2026-08-01T10:00:00Z')],
    ['b', pruefung('mangel', '2026-08-01T10:00:00Z')],
    ['c', pruefung('mangel', '2025-11-01T10:00:00Z')],
    ['d', pruefung('gesperrt', '2026-08-01T10:00:00Z')],
    ['e', pruefung('gesperrt', '2019-01-01T10:00:00Z')],
    // 'g' traegt absichtlich eine Pruefzeile, obwohl der Typ nicht wartbar ist:
    // sie darf die Zahlen nicht beruehren.
    ['g', pruefung('gesperrt', '2026-08-01T10:00:00Z')],
  ])

  const b = bilanz(objekte, pruefungen, SAISON, JETZT)
  assert.equal(b.sitze, 6, 'sonstiges und parkplatz zaehlen nicht mit')
  assert.equal(b.offen, 3, 'c (alter Mangel), e (alte Sperre) und f (nie geprueft)')
  assert.equal(b.mangel, 2, 'b und c — unabhaengig vom Alter')
  assert.equal(b.gesperrt, 2, 'd und e — unabhaengig vom Alter')

  // Der Satz, der im Kommentar steht, hier als Zusicherung: waere es eine
  // Summe, muesste 3 + 2 + 2 die 6 ergeben. Tut es nicht, und das ist richtig.
  assert.notEqual(b.offen + b.mangel + b.gesperrt, b.sitze)

  // Eine Pruefzeile zu einem Objekt, das gar nicht in der Liste steht (etwa
  // weil es weich geloescht wurde), aendert nichts.
  const mitWaise = new Map(pruefungen)
  mitWaise.set('zzz', pruefung('gesperrt', '2026-08-01T10:00:00Z'))
  assert.deepEqual(bilanz(objekte, mitWaise, SAISON, JETZT), b, 'eine Waise verschiebt keine Zahl')
}

// Leeres Revier: vier Nullen, kein Fehler.
assert.deepEqual(bilanz([], new Map(), SAISON, JETZT), { sitze: 0, offen: 0, mangel: 0, gesperrt: 0 })

// Ein Revier ganz ohne Pruefungen — der heutige Bestand von Soeder (196
// Objekte, 0 Zeilen): alles Wartbare ist offen, nichts ist beanstandet.
{
  const b = bilanz(
    [
      { id: 'a', typ: 'hochsitz' },
      { id: 'b', typ: 'wildkamera' },
      { id: 'c', typ: 'sonstiges' },
    ],
    new Map(),
    SAISON,
    JETZT,
  )
  assert.deepEqual(b, { sitze: 2, offen: 2, mangel: 0, gesperrt: 0 })

  // **Dieser Block hatte JETZT vergessen und lief trotzdem gruen**
  // (Schlusslesung 25.08.2026, Finding 1). Er konnte es nicht merken: die
  // leere Map erreicht `inDieserSaison` nie, `tsconfig.json:37` nimmt
  // Selbsttests von der Typpruefung aus, und `--experimental-strip-types`
  // prueft keine Typen. Also gruen aus Zufall — bis jemand dem Block eine
  // Pruefung gibt, dann rechnete er gegen `wann <= undefined`.
  //
  // Die Zeile darunter ist der Riegel dagegen: sie GIBT dem Block eine
  // Pruefung und faellt damit auf, wenn `jetzt` je wieder fehlt.
  const mitPruefung = bilanz(
    [{ id: 'a', typ: 'hochsitz' }],
    new Map([['a', pruefung('ok', '2026-08-01T10:00:00Z')]]),
    SAISON,
    JETZT,
  )
  assert.deepEqual(mitPruefung, { sitze: 1, offen: 0, mangel: 0, gesperrt: 0 })
}

// ---------------------------------------------------------------------------
// 5. alsPruefungen — was aus der View kommt, und was davon durchfaellt
// ---------------------------------------------------------------------------
{
  const map = alsPruefungen([
    { map_object_id: 'a', status: 'ok', checked_at: '2026-08-01T10:00:00Z', note: null, checked_by: 'u1' },
    { map_object_id: 'b', status: 'mangel', checked_at: '2026-08-01T10:00:00Z', note: 'latte kaputt', checked_by: null },
    // Die drei Faelle, die nicht eintreten koennen und trotzdem behandelt sind:
    { map_object_id: null, status: 'ok', checked_at: '2026-08-01T10:00:00Z', note: null, checked_by: null },
    { map_object_id: 'c', status: null, checked_at: '2026-08-01T10:00:00Z', note: null, checked_by: null },
    { map_object_id: 'd', status: 'ok', checked_at: null, note: null, checked_by: null },
  ])

  assert.equal(map.size, 2, 'Zeilen ohne Kennung, Status oder Zeitpunkt fallen heraus')
  assert.deepEqual(map.get('a'), { status: 'ok', checkedAt: '2026-08-01T10:00:00Z', note: null, checkedBy: 'u1' })
  assert.equal(map.get('b')?.note, 'latte kaputt')

  // Und die Folge davon, die der eigentliche Punkt ist: ein durchgefallenes
  // Objekt gilt als „noch nie angesehen", nicht als „ok".
  assert.equal(ampel(map.get('c'), SAISON, JETZT), 'offen')
  assert.equal(ampel(map.get('d'), SAISON, JETZT), 'offen')
}

assert.equal(alsPruefungen([]).size, 0)

// **Der Randfilter gegen unbekannte Statuswerte** (Fremdpruefung 25.08.2026,
// `[medium]`). Er ist die EINZIGE Stelle, an der ein fremder Wert abgewiesen
// wird — danach ist `ampel()` erschoepfend. Ohne ihn waere jeder fremde Wert
// gruen geworden.
{
  const map = alsPruefungen([
    { map_object_id: 'a', status: 'gepruft_neu', checked_at: '2026-08-01T10:00:00Z', note: null, checked_by: null },
    { map_object_id: 'b', status: '', checked_at: '2026-08-01T10:00:00Z', note: null, checked_by: null },
    { map_object_id: 'c', status: 'OK', checked_at: '2026-08-01T10:00:00Z', note: null, checked_by: null },
    { map_object_id: 'd', status: 'ok', checked_at: '2026-08-01T10:00:00Z', note: null, checked_by: null },
  ])
  assert.equal(map.size, 1, 'nur der bekannte Kleinbuchstaben-Status kommt durch')
  assert.equal(map.get('d')?.status, 'ok')
  assert.equal(ampel(map.get('a'), SAISON, JETZT), 'offen', 'ein fremder Status ist NICHT gruen')
  assert.equal(ampel(map.get('c'), SAISON, JETZT), 'offen', 'auch nicht in anderer Schreibweise')

  // Und in der Bilanz zaehlt so ein Objekt als OFFEN, nicht als geprueft.
  const b = bilanz([{ id: 'a', typ: 'hochsitz' }], map, SAISON, JETZT)
  assert.deepEqual(b, { sitze: 1, offen: 1, mangel: 0, gesperrt: 0 })
}

// ---------------------------------------------------------------------------
// 6. Die Zustandszeile — woertlich die der Feld-App
// ---------------------------------------------------------------------------
{
  const wann = '3. Nov. 2025, 14:12 von Moritz'

  assert.equal(zustandsSatz(null, wann), 'Noch nie geprüft')
  assert.equal(zustandsSatz(pruefung('ok', '2025-11-03T13:12:00Z'), wann), `Geprüft ${wann}`)
  assert.equal(zustandsSatz(pruefung('mangel', '2025-11-03T13:12:00Z'), wann), `Mangel gemeldet ${wann}`)
  assert.equal(
    zustandsSatz(pruefung('gesperrt', '2025-11-03T13:12:00Z'), wann),
    `Gesperrt — nicht besetzen. Eingetragen ${wann}`,
    'die Sperre steht zuerst, der Zeitpunkt danach',
  )

  // „Noch nie geprueft" ist NICHT dasselbe wie ein Ladefehler. Die Zeile kennt
  // den Fehlerfall gar nicht — er gehoert dem Aufrufer, weil nur der weiss, ob
  // gerade geladen wird (S4: ein Ladefehler darf sich nicht als gueltige
  // Auskunft lesen).
  assert.equal(zustandsSatz(null, ''), 'Noch nie geprüft')
}
