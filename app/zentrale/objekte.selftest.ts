// Gegenprobe fuer die Objekt-Logik der Revierzentrale. Kein Test-Runner im
// Repo, deshalb ein eigenstaendiges Skript (Muster: grenze.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/objekte.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  OBJEKT_TYPEN,
  alsSpalten,
  istObjektTyp,
  istStand,
  pruefeObjekt,
  typLabel,
  unveraendert,
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

console.log('zentrale/objekte: alle Faelle ok')
