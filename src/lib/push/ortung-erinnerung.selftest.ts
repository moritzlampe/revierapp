/**
 * Selbsttest für die Auswertung der Erinnerungen zur Ortung (CN-416, seit
 * CN-427 beide Arten: „Ortung noch aus" und „Jagdzeit vorbei").
 *
 * **Was dieser Test festhält:** welche beanspruchten Fenster zurückgegeben
 * werden. Jede Regel aus dem Kopf von `ortung-erinnerung.ts` ist ein eigener
 * Fall; zieht jemand zwei davon zusammen, fällt mindestens einer um.
 *
 * **Was er NICHT kann:** er prüft die Regel, nicht die Route — ob sie die
 * Chunks mit dem richtigen Offset füllt, die Frist einhält und das
 * Zurücksetzen wirklich ausführt, sieht er nicht.
 *
 * Läuft ohne Netz und ohne Bundler:
 *   node --experimental-strip-types src/lib/push/ortung-erinnerung.selftest.ts
 */

import assert from 'node:assert/strict'
import { alsAnspruch, ARTEN, baueNachrichten, casWerte, werteAus, type Anspruch, type Anmeldung } from './ortung-erinnerung.ts'

const istToken = (t: unknown) => typeof t === 'string' && t.startsWith('ExponentPushToken[')
const tok = (n: string) => `ExponentPushToken[${n}]`

const A: Anspruch = { art: 'noch_aus', user_id: 'u-a', hunt_id: 'h-1', jagdname: 'Antonstal', zeitpunkt: '2026-10-27T06:00:00+00:00' }
const B: Anspruch = { art: 'noch_aus', user_id: 'u-b', hunt_id: 'h-1', jagdname: 'Antonstal', zeitpunkt: '2026-10-27T06:00:00+00:00' }
const JETZT = Date.parse('2026-10-27T06:05:00Z')
const anmeldungen: Anmeldung[] = [
  { id: 's-a1', user_id: 'u-a', subscription: { expoPushToken: tok('a1') } },
  { id: 's-a2', user_id: 'u-a', subscription: { expoPushToken: tok('a2') } },
  { id: 's-b1', user_id: 'u-b', subscription: { expoPushToken: tok('b1') } },
  { id: 's-x', user_id: 'u-a', subscription: { expoPushToken: 'kaputt' } },
  { id: 's-y', user_id: 'u-b', subscription: null },
  { id: 's-z', user_id: 'u-fremd', subscription: { expoPushToken: tok('z') } },
]

// --- Nachrichten: je gültigem Token eine, fremde und kaputte fallen weg ---
const ziele = baueNachrichten([A, B], anmeldungen, istToken, JETZT)
assert.deepEqual(ziele.map((z) => z.anmeldungId), ['s-a1', 's-a2', 's-b1'], 'nur gültige Token der Beanspruchten')
assert.deepEqual(ziele.map((z) => z.anspruch), [0, 0, 1])
assert.equal(ziele[0].nachricht.title, 'Ortung noch aus')
assert.equal(ziele[0].nachricht.body, 'Deine Ortung für ‚Antonstal‘ ist noch aus. Wieder einschalten?')
assert.deepEqual(ziele[0].nachricht.data, { type: 'ortung', huntId: 'h-1' })
assert.equal(ziele[0].nachricht.sound, 'default')
// `ttl` in Sekunden bis Fensterbeginn + 30 min (CN-426): 06:05 → 06:30 = 1500 s
assert.equal(ziele[0].nachricht.ttl, 1500)
assert.equal('expiration' in ziele[0].nachricht, false, 'ttl statt expiration (CN-426)')

// --- Abend (CN-427, Bauplan E5): Typ bleibt `ortung`, Art und Tagesende daneben ---
{
  const E: Anspruch = { art: 'noch_an', user_id: 'u-a', hunt_id: 'h-2', jagdname: 'Antonstal', zeitpunkt: '2026-11-10T16:00:00+00:00' }
  const z = baueNachrichten([E], anmeldungen, istToken, Date.parse('2026-11-10T16:30:00Z'))
  assert.equal(z.length, 2)
  assert.equal(z[0].nachricht.title, 'Jagdzeit vorbei')
  assert.equal(z[0].nachricht.body, 'Deine Ortung für ‚Antonstal‘ ist noch an. Für heute abmelden?')
  assert.deepEqual(z[0].nachricht.data, { type: 'ortung', huntId: 'h-2', art: 'noch_an', tagesende: '2026-11-10T16:00:00.000Z' })
  // E + 3 h 30 min ab 16:30 → 3 h
  assert.equal(z[0].nachricht.ttl, 3 * 3600)
  // eine späte Wiederholung: nie unter 1 s
  assert.equal(baueNachrichten([E], anmeldungen, istToken, Date.parse('2026-11-10T21:00:00Z'))[0].nachricht.ttl, 1)
  // morgens bleibt der Payload wie vor CN-427 — ohne `art`
  assert.equal('art' in ziele[0].nachricht.data, false)
}

// --- RPC-Zeilen je Art: der Zeitpunkt kommt aus dem Feld der Art ---
assert.deepEqual(
  alsAnspruch('noch_aus', { user_id: 'u', hunt_id: 'h', jagdname: 'J', fensterbeginn: '2026-10-27T06:00:00+00:00' }),
  { art: 'noch_aus', user_id: 'u', hunt_id: 'h', jagdname: 'J', zeitpunkt: '2026-10-27T06:00:00+00:00' },
)
assert.deepEqual(
  alsAnspruch('noch_an', { user_id: 'u', hunt_id: 'h', jagdname: 'J', tagesende: '2026-11-10T16:00:00+00:00' }),
  { art: 'noch_an', user_id: 'u', hunt_id: 'h', jagdname: 'J', zeitpunkt: '2026-11-10T16:00:00+00:00' },
)
// Fehlt das Feld der Art (Feldname gedriftet), wirft es mit dem Namen — statt
// morgens `ttl: null` zu senden (Schlusslesung Route F1)
assert.throws(
  () => alsAnspruch('noch_aus', { user_id: 'u', hunt_id: 'h', jagdname: 'J', tagesende: '2026-10-27T06:00:00+00:00' }),
  /ortung_erinnerungen_beanspruchen: Feld fensterbeginn fehlt/,
)
assert.throws(
  () => alsAnspruch('noch_an', { user_id: 'u', hunt_id: 'h', jagdname: 'J', fensterbeginn: '2026-11-10T16:00:00+00:00' }),
  /ortung_tagesende_beanspruchen: Feld tagesende fehlt/,
)
assert.throws(() => alsAnspruch('noch_an', { user_id: 'u', hunt_id: 'h', jagdname: 'J', tagesende: 'kein Datum' }), /tagesende nicht lesbar/)
assert.throws(
  () => alsAnspruch('noch_aus', { hunt_id: 'h', jagdname: 'J', fensterbeginn: '2026-10-27T06:00:00+00:00' }),
  /Feld user_id fehlt/,
)
// Die Spalte des Compare-and-Swap hängt an der Art (Migration 144 bzw. 145)
assert.equal(ARTEN.noch_aus.spalte, 'ortung_erinnert_fuer')
assert.equal(ARTEN.noch_an.spalte, 'ortung_tagesende_erinnert_fuer')
assert.equal(ARTEN.noch_an.rpc, 'ortung_tagesende_beanspruchen')

const ok = { status: 'ok' } as const
const fehler = (error: string) => ({ status: 'error', message: error, details: { error } }) as const

// --- alles zugestellt: nichts zurück ---
{
  const a = werteAus(ziele, [{ offset: 0, tickets: [ok, ok, ok] }], 2)
  assert.deepEqual(a.erfolg, [true, true])
  assert.deepEqual(a.zuruecksetzen, [])
  assert.equal(a.gesendet, 3)
}

// --- ein Gerät von zweien stellt zu, das andere scheitert im Transport: erinnert ---
{
  const a = werteAus(ziele, [{ offset: 0, tickets: [ok] }, { offset: 1, tickets: null }], 2)
  assert.deepEqual(a.erfolg, [true, false], 'A erinnert über a1')
  assert.deepEqual(a.zuruecksetzen, [1], 'nur B zurück — A nicht, obwohl a2 scheiterte')
}

// --- zwei Chunks: erster ok, zweiter wirft -> nur der zweite Anspruch zurück (8a) ---
{
  const a = werteAus(ziele, [{ offset: 0, tickets: [ok, ok] }, { offset: 2, tickets: null }], 2)
  assert.deepEqual(a.zuruecksetzen, [1])
}

// --- ein Chunk wurde nie gesendet (Frist) -> fehlt in der Liste -> Transportfehler ---
{
  const a = werteAus(ziele, [{ offset: 0, tickets: [ok, ok] }], 2)
  assert.deepEqual(a.zuruecksetzen, [1], 'ein fehlender Chunk zählt als gescheitert')
}

// --- DeviceNotRegistered: aufräumen, NICHT zurück ---
{
  const a = werteAus(ziele, [{ offset: 0, tickets: [ok, ok, fehler('DeviceNotRegistered')] }], 2)
  assert.deepEqual(a.abgemeldet, ['s-b1'])
  assert.deepEqual(a.zuruecksetzen, [], 'abgemeldetes Gerät wird durch Wiederholen nicht erreichbar')
  assert.deepEqual(a.erfolg, [true, false])
}

// --- anderer Ticket-Fehler: zählen, Marke bleibt ---
{
  const a = werteAus(ziele, [{ offset: 0, tickets: [ok, ok, fehler('MessageRateExceeded')] }], 2)
  assert.deepEqual(a.ticketFehler, ['MessageRateExceeded: MessageRateExceeded'])
  assert.deepEqual(a.zuruecksetzen, [])
}

// --- Ticket-Fehler UND Transportfehler am selben Anspruch: zurück ---
{
  const z = baueNachrichten([B], [...anmeldungen, { id: 's-b2', user_id: 'u-b', subscription: { expoPushToken: tok('b2') } }], istToken, JETZT)
  assert.equal(z.length, 2)
  const a = werteAus(z, [{ offset: 0, tickets: [fehler('MessageTooBig')] }, { offset: 1, tickets: null }], 1)
  assert.deepEqual(a.zuruecksetzen, [0])
}

// --- Anspruch ohne gültiges Gerät: bleibt beansprucht ---
{
  const C: Anspruch = { ...A, user_id: 'u-ohne' }
  const z = baueNachrichten([C], anmeldungen, istToken, JETZT)
  assert.equal(z.length, 0)
  const a = werteAus(z, [], 1)
  assert.deepEqual(a.zuruecksetzen, [], 'niemand, dem ein zweiter Versuch etwas zustellen könnte')
  assert.deepEqual(a.erfolg, [false])
}

// --- erster Chunk scheitert, zweiter stellt zu: der Offset ordnet richtig zu ---
{
  const a = werteAus(ziele, [{ offset: 0, tickets: null }, { offset: 2, tickets: [ok] }], 2)
  assert.deepEqual(a.erfolg, [false, true], 'das Ticket gehört zu b1 (Ziel 2), nicht zu a1')
  assert.deepEqual(a.zuruecksetzen, [0])
}

// --- Compare-and-Swap-Werte: Zeitpunkt und Zeitpunkt − 1 ms, ISO in UTC ---
assert.deepEqual(casWerte('2026-10-27T06:00:00+00:00'), {
  alt: '2026-10-27T06:00:00.000Z',
  neu: '2026-10-27T05:59:59.999Z',
})
assert.deepEqual(casWerte('2026-10-27T07:00:00+01:00').alt, '2026-10-27T06:00:00.000Z', 'Zeitzone wird normalisiert')
assert.throws(() => casWerte('kein Datum'), /nicht lesbar/)

console.log('ortung-erinnerung: alle Fälle grün')
