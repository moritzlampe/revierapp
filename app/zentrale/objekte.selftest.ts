// Gegenprobe fuer die Objekt-Logik der Revierzentrale. Kein Test-Runner im
// Repo, deshalb ein eigenstaendiges Skript (Muster: grenze.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/objekte.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  OBJEKT_KATEGORIEN,
  OBJEKT_TYPEN,
  alsSpalten,
  ewktPunkt,
  filterBaum,
  istObjektTyp,
  istStand,
  ortUnveraendert,
  passtZurSuche,
  pruefeObjekt,
  pruefeOrt,
  toggleKategorie,
  toggleTyp,
  typLabel,
  unveraendert,
  wickleLaengengrad,
} from './objekte.ts'

// --- Die zehn Enum-Werte, in Enum-Reihenfolge ---
// Haengt die Datei an der DB fest. Das hat sich am 27.07.2026 sofort bezahlt
// gemacht: waehrend dieser Sitzung hat der native Track mit Migration 063
// 'wildacker' und 'notfall_treffpunkt' ergaenzt und auf die Produktion
// angewendet. Die neuen Werte stehen HINTER 'sonstiges' — ALTER TYPE … ADD
// VALUE haengt an, es sortiert nicht ein.
assert.deepEqual(
  OBJEKT_TYPEN.map((t) => t.wert),
  [
    'hochsitz',
    'kanzel',
    'drueckjagdstand',
    'parkplatz',
    'kirrung',
    'salzlecke',
    'wildkamera',
    'sonstiges',
    'wildacker',
    'notfall_treffpunkt',
  ],
  'Werte und Reihenfolge muessen pg_enum map_object_type entsprechen',
)
assert.equal(new Set(OBJEKT_TYPEN.map((t) => t.label)).size, 10, 'Beschriftungen eindeutig')

// Die zwei Neuzugaenge sind keine Sitze — sonst zaehlte die Kennzahl "Sitze"
// bei Soeder plotzlich einen Wildacker mit.
assert.equal(istStand('wildacker'), false)
assert.equal(istStand('notfall_treffpunkt'), false)
assert.equal(typLabel('notfall_treffpunkt'), 'Notfall-Treffpunkt')

assert.equal(istObjektTyp('kirrung'), true)
assert.equal(istObjektTyp('Hochsitz'), false, 'Enum-Werte sind kleingeschrieben')
assert.equal(istObjektTyp('leiter'), false, 'Leiter ist im Repo ein hochsitz mit Notiz')
assert.equal(istObjektTyp(''), false)

// --- typLabel: unbekanntes kommt roh zurueck, nicht als leerer Kasten ---
assert.equal(typLabel('drueckjagdstand'), 'Drückjagdbock')
assert.equal(typLabel('wildschwein'), 'wildschwein')

// --- istStand: nur worauf ein Schuetze sitzt ---
assert.equal(istStand('hochsitz'), true)
assert.equal(istStand('kanzel'), true)
assert.equal(istStand('drueckjagdstand'), true)
for (const typ of ['parkplatz', 'kirrung', 'salzlecke', 'wildkamera', 'sonstiges']) {
  assert.equal(istStand(typ), false, `${typ} ist kein Sitz`)
}

// --- pruefeObjekt: Name ist Pflicht, auch wenn er nur aus Leerzeichen besteht ---
assert.equal(pruefeObjekt({ name: 'Eicheneck', typ: 'hochsitz', beschreibung: '' }), null)
assert.match(pruefeObjekt({ name: '', typ: 'hochsitz', beschreibung: '' })!, /braucht einen Namen/)
assert.match(
  pruefeObjekt({ name: '   ', typ: 'hochsitz', beschreibung: '' })!,
  /braucht einen Namen/,
  'Leerzeichen sind kein Name — Postgres haelt sie sonst fuer einen Wert',
)
assert.match(
  pruefeObjekt({ name: 'Eicheneck', typ: 'schiessstand', beschreibung: '' })!,
  /Unbekannter Objekttyp/,
  'map_objects.type ist ein Enum — ein falscher Wert waere sonst erst ein DB-Fehler',
)
// Reihenfolge: der Name wird zuerst geprueft, damit die erste Meldung die ist,
// die der Nutzer am ehesten selbst verursacht hat.
assert.match(pruefeObjekt({ name: ' ', typ: 'quatsch', beschreibung: '' })!, /braucht einen Namen/)

// --- alsSpalten: trimmen, leere Notiz zu NULL, Spaltennamen der Tabelle ---
assert.deepEqual(
  alsSpalten({ name: '  Eicheneck  ', typ: 'kanzel', beschreibung: '  Am Waldrand  ' }),
  { name: 'Eicheneck', type: 'kanzel', description: 'Am Waldrand' },
)
assert.deepEqual(alsSpalten({ name: 'A', typ: 'kanzel', beschreibung: '' }), {
  name: 'A',
  type: 'kanzel',
  description: null,
})
assert.deepEqual(
  alsSpalten({ name: 'A', typ: 'kanzel', beschreibung: '   ' }),
  { name: 'A', type: 'kanzel', description: null },
  'nur Leerzeichen ist keine Notiz — sonst hiesse description IS NULL nicht mehr "keine Notiz"',
)

// --- unveraendert: kein Write ohne Aenderung (E-R7 ist last-write-wins) ---
const bestand = { name: 'Eicheneck', type: 'hochsitz', description: 'Am Waldrand' }
assert.equal(
  unveraendert({ name: 'Eicheneck', typ: 'hochsitz', beschreibung: 'Am Waldrand' }, bestand),
  true,
)
assert.equal(
  unveraendert({ name: ' Eicheneck ', typ: 'hochsitz', beschreibung: 'Am Waldrand' }, bestand),
  true,
  'reine Randleerzeichen sind keine Aenderung — sonst schriebe jedes Oeffnen',
)
assert.equal(
  unveraendert({ name: 'Eicheneck', typ: 'kanzel', beschreibung: 'Am Waldrand' }, bestand),
  false,
)
assert.equal(
  unveraendert({ name: 'Eicheneck', typ: 'hochsitz', beschreibung: '' }, bestand),
  false,
  'Notiz loeschen ist eine Aenderung',
)
assert.equal(
  unveraendert({ name: 'A', typ: 'hochsitz', beschreibung: '' }, {
    name: 'A',
    type: 'hochsitz',
    description: null,
  }),
  true,
  'leere Notiz und NULL sind derselbe Zustand',
)

// --- Kategorien: jeder Enum-Wert hat genau eine ---
// Der eigentliche Zweck dieser Datei fuer den Filter. Kaeme ein elfter Enum-Wert
// dazu und niemand ordnete ihn zu, schlaegt es hier an. Der Filter faellt dann
// zwar nicht aus (Unbekanntes landet unter "Sonstiges"), aber der Wert steckte
// in der falschen Schublade — und das soll auffallen, nicht durchrutschen.
const zugeordnet = OBJEKT_KATEGORIEN.flatMap((k) => k.typen as readonly string[])
assert.deepEqual(
  [...zugeordnet].sort(),
  OBJEKT_TYPEN.map((t) => t.wert).sort(),
  'jeder map_object_type gehoert in genau eine Legendenkategorie',
)
assert.equal(new Set(zugeordnet).size, zugeordnet.length, 'kein Typ in zwei Kategorien')
// Schluessel und Reihenfolge sind die des nativen Tracks (object-categories.ts).
assert.deepEqual(
  OBJEKT_KATEGORIEN.map((k) => k.key),
  ['staende', 'futter', 'kamera', 'notfall', 'sonstiges'],
)

// --- toggleTyp: einzeln aus und wieder an ---
const leer: ReadonlySet<string> = new Set()
assert.deepEqual([...toggleTyp(leer, 'kanzel')], ['kanzel'])
assert.deepEqual([...toggleTyp(new Set(['kanzel']), 'kanzel')], [], 'zweiter Klick holt zurueck')
assert.deepEqual(
  [...toggleTyp(new Set(['kanzel']), 'hochsitz')].sort(),
  ['hochsitz', 'kanzel'],
  'Typen sind unabhaengig voneinander',
)

// --- toggleKategorie: "an" gewinnt beim halben Zustand ---
const staende = ['hochsitz', 'kanzel', 'drueckjagdstand']
assert.deepEqual(
  [...toggleKategorie(leer, staende)].sort(),
  [...staende].sort(),
  'aus dem vollen Zustand heraus schaltet die Kategorie alles aus',
)
assert.deepEqual(
  [...toggleKategorie(new Set(staende), staende)],
  [],
  'aus dem leeren Zustand heraus alles an',
)
assert.deepEqual(
  [...toggleKategorie(new Set(['kanzel']), staende)],
  [],
  'halb aus heisst: ein Klick holt die ganze Kategorie zurueck, nicht zwei',
)
assert.deepEqual(
  [...toggleKategorie(new Set(['kirrung']), staende)].sort(),
  ['drueckjagdstand', 'hochsitz', 'kanzel', 'kirrung'].sort(),
  'fremde Kategorien bleiben unberuehrt',
)
// Die Eingabemenge darf nicht veraendert werden — React vergleicht Referenzen,
// und eine mutierte Menge kaeme nie als neuer Zustand an.
const vorher = new Set(['kanzel'])
toggleKategorie(vorher, staende)
toggleTyp(vorher, 'hochsitz')
assert.deepEqual([...vorher], ['kanzel'], 'beide Funktionen geben eine neue Menge zurueck')

// --- filterBaum: nur was vorkommt, mit Anzahl ---
const baum = filterBaum(['hochsitz', 'hochsitz', 'kanzel', 'wildkamera'])
assert.deepEqual(
  baum.map((k) => [k.key, k.anzahl]),
  [
    ['staende', 3],
    ['kamera', 1],
  ],
  'leere Kategorien fallen raus — sonst stuenden zehn Eintraege im Menue, hinter denen nichts ist',
)
assert.deepEqual(
  baum[0].eintraege.map((e) => [e.wert, e.anzahl]),
  [
    ['hochsitz', 2],
    ['kanzel', 1],
  ],
  'drueckjagdstand kommt nicht vor und fehlt deshalb',
)
assert.deepEqual(filterBaum([]), [], 'leeres Revier hat keine Auswahl')
const mitFremdem = filterBaum(['sonstiges', 'wildschwein'])
assert.deepEqual(
  mitFremdem.map((k) => k.key),
  ['sonstiges'],
)
assert.deepEqual(
  mitFremdem[0].eintraege.map((e) => e.wert),
  ['sonstiges', 'wildschwein'],
  'ein Typ ohne Kategorie ist im Filter erreichbar, nicht verschwunden',
)
assert.equal(mitFremdem[0].eintraege[1].label, 'wildschwein', 'roh beschriftet, nicht leer')

// --- passtZurSuche: Name, ausgeschriebener Typ, roher Enum-Wert ---
assert.equal(passtZurSuche('Eicheneck', 'hochsitz', 'eiche'), true)
assert.equal(passtZurSuche('Eicheneck', 'hochsitz', 'ECK'.toLowerCase()), true)
assert.equal(
  passtZurSuche('Eicheneck', 'drueckjagdstand', 'drückjagdbock'),
  true,
  'ueber die Beschriftung, nicht nur den Enum-Wert',
)
assert.equal(
  passtZurSuche('Eicheneck', 'notfall_treffpunkt', 'notfall_'),
  true,
  'der rohe Wert zaehlt mit, sonst waere notfall_treffpunkt schwer zu treffen',
)
assert.equal(passtZurSuche('Eicheneck', 'hochsitz', 'kanzel'), false)
assert.equal(passtZurSuche('Eicheneck', 'hochsitz', ''), true, 'leerer Begriff trifft alles')

// --- Position (Schritt 3b) ---

// Der leere Typ ist eine eigene Meldung, nicht "Unbekannter Objekttyp ''".
assert.equal(
  pruefeObjekt({ name: 'Neuer Bock', typ: '', beschreibung: '' }),
  'Bitte einen Objekttyp wählen.',
)
// Der Name wird vor dem Typ geprueft: ohne Namen ist die Typfrage zweitrangig.
assert.equal(
  pruefeObjekt({ name: '  ', typ: '', beschreibung: '' }),
  'Ein Objekt braucht einen Namen.',
)
assert.equal(pruefeObjekt({ name: 'Neuer Bock', typ: 'kanzel', beschreibung: '' }), null)

// wickleLaengengrad: der Normalfall bleibt unangetastet, die Weltumrundung nicht.
assert.equal(wickleLaengengrad(10.5), 10.5)
assert.equal(wickleLaengengrad(-10.5), -10.5)
assert.equal(Math.abs(wickleLaengengrad(370) - 10) < 1e-9, true, '370 ist 10 nach einer Runde')
assert.equal(Math.abs(wickleLaengengrad(-350) - 10) < 1e-9, true, 'auch nach Westen')
assert.equal(wickleLaengengrad(180), 180, 'im Bereich heisst unangetastet, auch am Rand')
assert.equal(wickleLaengengrad(-180), -180)
assert.equal(wickleLaengengrad(540), -180, 'anderthalb Runden landen auf der Datumsgrenze')
// Wertetreue im Normalfall: die Modulo-Kette liefert fuer 10.2 sonst
// 10.200000000000045, und dann speichert jeder Write etwas anderes als geklickt.
assert.equal(wickleLaengengrad(10.2), 10.2, 'exakt, nicht nur nahe dran')
assert.equal(wickleLaengengrad(9.7345678901), 9.7345678901)

// pruefeOrt: die vier Faelle, die wirklich vorkommen.
assert.deepEqual(pruefeOrt(null), {
  fehler: 'Es ist noch keine Position gesetzt. In die Karte klicken.',
})
assert.deepEqual(pruefeOrt({ lat: 52.1, lng: 10.2 }), { ort: { lat: 52.1, lng: 10.2 } })
assert.deepEqual(
  pruefeOrt({ lat: 52.1, lng: 370.2 }),
  { ort: { lat: 52.1, lng: wickleLaengengrad(370.2) } },
  'ein Klick nach der zweiten Weltumrundung ist gueltig, nur ungewickelt',
)
assert.equal('fehler' in pruefeOrt({ lat: Number.NaN, lng: 10 }), true)
assert.equal('fehler' in pruefeOrt({ lat: 91, lng: 10 }), true, 'Breitengrad wird NICHT gewickelt')

// ewktPunkt: lng vor lat. Der eine Fehler, der lautlos waere — beide Werte sind
// in Deutschland plausibel, vertauscht landet das Objekt im Indischen Ozean.
assert.equal(ewktPunkt({ lat: 52.1, lng: 10.2 }), 'SRID=4326;POINT(10.2 52.1)')
assert.equal(
  ewktPunkt({ lat: 52.1, lng: 10.2 }).indexOf('10.2') < ewktPunkt({ lat: 52.1, lng: 10.2 }).indexOf('52.1'),
  true,
  'Laenge steht vor Breite',
)

// ortUnveraendert: der Klick auf denselben Punkt ist keine Verschiebung, ein
// Meter schon. 1e-6 Grad Breite sind rund 11 cm.
assert.equal(ortUnveraendert({ lat: 52.1, lng: 10.2 }, { lat: 52.1, lng: 10.2 }), true)
assert.equal(
  ortUnveraendert({ lat: 52.1, lng: 10.2 }, { lat: 52.100000005, lng: 10.2 }),
  true,
  'unter 1 cm ist derselbe Klick, kein Verschieben',
)
assert.equal(
  ortUnveraendert({ lat: 52.1, lng: 10.2 }, { lat: 52.10001, lng: 10.2 }),
  false,
  'rund 1 m ist eine echte Verschiebung',
)

console.log('zentrale/objekte: alle Faelle ok')
