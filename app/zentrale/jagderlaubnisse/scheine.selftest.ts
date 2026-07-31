// Gegenprobe fuer die Begehungsschein-Regeln. Dieses Repo hat keinen
// Test-Runner, deshalb ein eigenstaendiges Skript statt eines Frameworks
// (gleiches Muster wie app/zentrale/schreiben.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/jagderlaubnisse/scheine.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  alsEinloeseErgebnis,
  alsSpalten,
  alsStatus,
  effektiverStatus,
  jagdjahrEnde,
  pruefeEntwurf,
  zuteilungsArt,
  type Entwurf,
} from './scheine.ts'

// --- Status: Unbekanntes faellt nicht auf "aktiv" ---
assert.equal(alsStatus('aktiv'), 'aktiv')
assert.equal(alsStatus('entzogen'), 'entzogen')
assert.equal(alsStatus(null), 'unbekannt')
// Der teure Fall: ein Wert aus einer spaeteren Migration darf kein gruenes
// Abzeichen bekommen.
assert.equal(alsStatus('ruhend'), 'unbekannt')

// --- Der Ablauf: zeichengleich mit Migration 077, BEIDE Enden einschliessend ---
const V = { von: '2026-04-01', bis: '2027-03-31' }
assert.equal(effektiverStatus('aktiv', V.von, V.bis, '2026-07-31'), 'aktiv')
assert.equal(effektiverStatus('aktiv', V.von, V.bis, V.von), 'aktiv', 'erster Tag gilt')
assert.equal(effektiverStatus('aktiv', V.von, V.bis, V.bis), 'aktiv', 'letzter Tag gilt')
assert.equal(effektiverStatus('aktiv', V.von, V.bis, '2027-04-01'), 'abgelaufen')
assert.equal(effektiverStatus('aktiv', V.von, V.bis, '2026-03-31'), 'nochnicht')
// Eine Sperre schlaegt das Datum: sonst laese der Inhaber "abgelaufen", wo
// jemand ihm den Schein entzogen hat. Der Zugriff ist beide Male zu, aber nur
// ein Text nennt den Grund.
assert.equal(effektiverStatus('entzogen', V.von, V.bis, '2026-07-31'), 'entzogen')
assert.equal(effektiverStatus('entzogen', V.von, V.bis, '2027-04-01'), 'entzogen')
assert.equal(effektiverStatus('pausiert', V.von, V.bis, '2026-07-31'), 'pausiert')

// --- Jagdjahr: 1. April bis 31. Maerz ---
assert.equal(jagdjahrEnde('2026-07-31'), '2027-03-31')
assert.equal(jagdjahrEnde('2026-04-01'), '2027-03-31', 'erster Tag des Jagdjahres')
assert.equal(jagdjahrEnde('2026-03-31'), '2026-03-31', 'letzter Tag zaehlt zum alten')
assert.equal(jagdjahrEnde('2027-01-15'), '2027-03-31')

// --- Zuteilung: Zonen schlagen Staende, leer heisst ganzes Revier ---
assert.equal(zuteilungsArt([], []), 'revier')
assert.equal(zuteilungsArt(null, null), 'revier')
assert.equal(zuteilungsArt([], ['s1']), 'staende')
assert.equal(zuteilungsArt(['z1'], []), 'zonen')
assert.equal(zuteilungsArt(['z1'], ['s1']), 'zonen', 'die groebere Zuteilung gewinnt')

// --- Entwurfspruefung ---
const gut: Entwurf = {
  name: 'Heinrich Beispiel',
  email: 'heinrich@test.de',
  von: '2026-08-01',
  bis: '2027-03-31',
  art: 'revier',
  standIds: [],
  auflagen: '',
}
assert.equal(pruefeEntwurf(gut), null)
assert.match(pruefeEntwurf({ ...gut, name: '   ' })!, /Name/)
assert.match(pruefeEntwurf({ ...gut, email: '' })!, /Anmelde-Adresse/)
assert.match(pruefeEntwurf({ ...gut, email: 'heinrich' })!, /E-Mail-Adresse/)
assert.match(pruefeEntwurf({ ...gut, bis: '2026-07-01' })!, /vor dem Beginn/)
assert.equal(pruefeEntwurf({ ...gut, bis: gut.von }), null, 'ein Tagesschein ist gueltig')
assert.match(pruefeEntwurf({ ...gut, art: 'staende' })!, /Kein Stand/)
assert.equal(pruefeEntwurf({ ...gut, art: 'staende', standIds: ['s1'] }), null)

// --- Die INSERT-Zeile ---
const spalten = alsSpalten(
  { ...gut, email: '  Heinrich@Test.DE  ', auflagen: '  kein Rehwild  ' },
  'revier-1',
  'ich',
)
// Die Schreibweise bleibt: der Vergleich in meine_einladungen() macht selbst
// lower(trim(...)) auf beiden Seiten, und der Revierinhaber erkennt die
// getippte Fassung wieder.
assert.equal(spalten.holder_email, 'Heinrich@Test.DE')
assert.equal(spalten.auflagen, 'kein Rehwild')
assert.equal(alsSpalten({ ...gut, auflagen: '   ' }, 'r', 'i').auflagen, null)
assert.deepEqual(spalten.stand_ids, [], 'Art "revier" traegt keine Staende ein')
assert.deepEqual(spalten.zone_ids, [])
// Zonen kann das Formular nicht setzen (es gibt projektweit keine einzige) —
// aber die Spalte muss trotzdem leer mitgehen, sonst entschiede die Vorgabe.
assert.deepEqual(
  alsSpalten({ ...gut, art: 'staende', standIds: ['a', 'b'] }, 'r', 'i').stand_ids,
  ['a', 'b'],
)
// holder_id, invite_code und status gehoeren NICHT in den INSERT.
assert.deepEqual(
  Object.keys(spalten).filter((k) => ['holder_id', 'invite_code', 'status'].includes(k)),
  [],
)

// --- Einloesen: Unbekanntes ist ein Fehlschlag, kein Erfolg ---
assert.equal(alsEinloeseErgebnis('ok'), 'ok')
assert.equal(alsEinloeseErgebnis('gesperrt'), 'gesperrt')
assert.equal(alsEinloeseErgebnis(undefined), 'fehler')
assert.equal(alsEinloeseErgebnis('kontingent_erschoepft'), 'fehler')
