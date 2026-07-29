// Gegenprobe fuer die Schreib-Tuer der Revierzentrale. Dieses Repo hat keinen
// Test-Runner, deshalb ein eigenstaendiges Skript statt eines Frameworks
// (gleiches Muster wie src/lib/safe-next.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/schreiben.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  darfSchreiben,
  pruefeSchreibrevier,
  ausWriteErgebnis,
  schreibe,
  type WriteErgebnis,
} from './schreiben.ts'

// Echte IDs aus der Produktions-DB, damit der Test belegt, was er behauptet.
const TEST_5 = 'ec27bd95-c8bc-48fc-ac87-da9914d09033'
const BROCKWINEL = '66eeed5f-6f18-4d9c-adf4-00d6bc2ae5a0' // Pilotdaten
const SOEDER = 'fdaf24a7-6467-40e7-952b-91deceaae53e' // Echtdaten

// --- R3: nur das Testrevier ist offen ---
assert.equal(darfSchreiben(TEST_5), true)
assert.equal(darfSchreiben(BROCKWINEL), false, 'Pilotrevier muss gesperrt sein')
assert.equal(darfSchreiben(SOEDER), false, 'Echtdaten-Revier muss gesperrt sein')
assert.equal(darfSchreiben(''), false)

pruefeSchreibrevier(TEST_5) // wirft nicht
assert.throws(() => pruefeSchreibrevier(BROCKWINEL), /gesperrt/)
assert.throws(() => pruefeSchreibrevier(SOEDER), /R3/)

// --- Ergebnisdeutung: Fehler ---
assert.throws(
  () => ausWriteErgebnis({ data: null, error: { message: 'boom' } }, 'Reviergrenze'),
  /Reviergrenze konnte nicht geschrieben werden: boom/,
)
// „geschrieben", nicht „gespeichert": seit Schritt 3c laeuft auch ein DELETE
// durch diese Deutung, und „gespeichert" beschreibt kein Loeschen. Der Test
// haelt die Formulierung fest, damit sie nicht zurueckwandert.
assert.throws(
  () => ausWriteErgebnis({ data: null, error: null }, 'Das Objekt'),
  /gibt es die Zeile nicht \(mehr\)/,
  'der haeufigste 0-Zeilen-Fall eines DELETE ist eine schon entfernte Zeile, nicht RLS',
)

// --- Ergebnisdeutung: 0 Zeilen ist KEIN Erfolg ---
// Das ist der Fall, der in der PWA still durchgeht (Backlog E-R1): RLS filtert,
// PostgREST meldet keinen Fehler.
assert.throws(() => ausWriteErgebnis({ data: null, error: null }, 'Reviergrenze'), /kein Datensatz betroffen/)
assert.throws(() => ausWriteErgebnis({ data: [], error: null }, 'Reviergrenze'), /kein Datensatz betroffen/)
// Der Hinweis auf das fehlende .select() muss in der Meldung stehen, sonst sucht
// man beim naechsten Mal wieder an der falschen Stelle.
assert.throws(() => ausWriteErgebnis({ data: null, error: null }, 'x'), /\.select\(\)/)

// --- Ergebnisdeutung: genau eine Zeile ---
assert.deepEqual(ausWriteErgebnis({ data: [{ id: 'a' }], error: null }, 'Objekt'), { id: 'a' })

// --- Ergebnisdeutung: mehr als eine Zeile heisst fehlende Einschraenkung ---
assert.throws(
  () => ausWriteErgebnis({ data: [{ id: 'a' }, { id: 'b' }], error: null }, 'Objekt'),
  /2 Datensätze betroffen/,
)

// --- schreibe(): der Guard ist ein TOR, kein Nachtest ---
// Der Thunk darf bei gesperrtem Revier gar nicht laufen — sonst waere der Write
// schon draussen, bevor die Pruefung greift.
let thunkLief = false
await assert.rejects(
  () =>
    schreibe(BROCKWINEL, 'Reviergrenze', () => {
      thunkLief = true
      return Promise.resolve({ data: [{ id: 'x' }], error: null })
    }),
  /gesperrt/,
)
assert.equal(thunkLief, false, 'Thunk darf bei gesperrtem Revier nicht ausgefuehrt werden')

// --- schreibe(): Erfolgsfall gibt die betroffene Zeile zurueck ---
const zeile = await schreibe<{ id: string }>(TEST_5, 'Reviergrenze', () =>
  Promise.resolve({ data: [{ id: TEST_5 }], error: null }),
)
assert.deepEqual(zeile, { id: TEST_5 })

// --- schreibe(): 0 Zeilen aus einem erlaubten Revier wirft ebenfalls ---
await assert.rejects(
  () =>
    schreibe(TEST_5, 'Reviergrenze', () =>
      Promise.resolve({ data: null, error: null } as WriteErgebnis<{ id: string }>),
    ),
  /kein Datensatz betroffen/,
)

console.log('zentrale/schreiben: alle Faelle ok')
