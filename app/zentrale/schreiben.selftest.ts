// Gegenprobe fuer die Schreib-Tuer der Revierzentrale. Dieses Repo hat keinen
// Test-Runner, deshalb ein eigenstaendiges Skript statt eines Frameworks
// (gleiches Muster wie src/lib/safe-next.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/schreiben.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import { ausWriteErgebnis, schreibe, schreibeViele, type WriteErgebnis } from './schreiben.ts'

// Die R3-Allowlist ist am 29.07.2026 weggefallen (Phase 3 abgenommen, alle
// Reviere bearbeitbar). Ihre drei Testfaelle sind mit ihr verschwunden — ein
// Test, der eine geloeschte Regel prueft, ist kein Sicherheitsnetz, sondern
// eine Behauptung ueber Code, den es nicht mehr gibt. Was bleibt, ist der
// wertvollere Teil: die Ergebnisdeutung.

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

// --- schreibe(): Erfolgsfall gibt die betroffene Zeile zurueck ---
const zeile = await schreibe<{ id: string }>('Reviergrenze', () =>
  Promise.resolve({ data: [{ id: 'a' }], error: null }),
)
assert.deepEqual(zeile, { id: 'a' })

// --- schreibe(): 0 Zeilen wirft ---
await assert.rejects(
  () =>
    schreibe('Reviergrenze', () =>
      Promise.resolve({ data: null, error: null } as WriteErgebnis<{ id: string }>),
    ),
  /kein Datensatz betroffen/,
)

// --- schreibe(): der Thunk laeuft genau einmal ---
// Ohne den Guard ist `schreibe` nur noch Deutung. Der Test haelt fest, dass sie
// den Write nicht versehentlich zweimal ausloest.
let laeufe = 0
await schreibe('Reviergrenze', () => {
  laeufe += 1
  return Promise.resolve({ data: [{ id: 'a' }], error: null })
})
assert.equal(laeufe, 1)

// --- schreibeViele(): Positivkontrolle ---
const zeilen = await schreibeViele<{ id: string }>('Die Staende', 2, () =>
  Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }),
)
assert.deepEqual(zeilen, [{ id: 'a' }, { id: 'b' }])

// **Der Fall, fuer den es die Funktion gibt: eine TEILweise durchgekommene
// Menge.** Ein Buendel-Insert ueber RLS ist kein Alles-oder-nichts; wer nur auf
// „mehr als null" prueft, meldet vier von zwanzig Staenden als Erfolg.
await assert.rejects(
  () =>
    schreibeViele<{ id: string }>('Die Staende', 3, () =>
      Promise.resolve({ data: [{ id: 'a' }], error: null }),
    ),
  /1 von 3 Datens/,
)

// 0 Zeilen ist derselbe Fehler, nicht ein eigener.
await assert.rejects(
  () =>
    schreibeViele<{ id: string }>('Die Staende', 1, () =>
      Promise.resolve({ data: null, error: null }),
    ),
  /0 von 1 Datens/,
)

// MEHR als erwartet ist ebenfalls ein Fehler — dann fehlt eine Einschraenkung.
await assert.rejects(
  () =>
    schreibeViele<{ id: string }>('Die Staende', 1, () =>
      Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }),
    ),
  /2 von 1 Datens/,
)

// Ein echter Fehler schlaegt die Zeilenpruefung.
await assert.rejects(
  () =>
    schreibeViele<{ id: string }>('Die Staende', 1, () =>
      Promise.resolve({ data: null, error: { message: '23505' } }),
    ),
  /konnte nicht geschrieben werden: 23505/,
)

// Nichts zu schreiben ist kein Fehler: `erwartet = 0` mit leerer Antwort geht
// durch. Der Aufrufer darf damit bedingungslos aufrufen, statt vorher zu zaehlen.
assert.deepEqual(
  await schreibeViele<{ id: string }>('Die Staende', 0, () =>
    Promise.resolve({ data: [], error: null }),
  ),
  [],
)

console.log('zentrale/schreiben: alle Faelle ok')
