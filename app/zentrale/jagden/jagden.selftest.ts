// Gegenprobe fuer die Regeln der Jagdliste. Dieses Repo hat keinen Test-Runner,
// deshalb ein eigenstaendiges Skript statt eines Frameworks (gleiches Muster
// wie kontakte.selftest.ts und scheine.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/jagden/jagden.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  alsFilter,
  beendet,
  ersterWert,
  filtere,
  jagdart,
  jagdstatus,
  laeuft,
  sortiere,
  termin,
  terminText,
  vorbereitbar,
  zusagen,
  type Jagd,
} from './jagden.ts'

function jagd(teil: Partial<Jagd>): Jagd {
  return {
    id: 'x',
    name: 'Jagd',
    type: 'drueckjagd',
    status: 'completed',
    scheduled_for: null,
    started_at: null,
    ended_at: null,
    created_at: null,
    ...teil,
  }
}

// --- Beschriftungen ---------------------------------------------------------

assert.equal(jagdart('drueckjagd'), 'Drückjagd')
assert.equal(jagdart('ansitz'), 'Ansitz')
// Alle vier Werte muessen tragen, auch die zwei, die es in den Daten nicht gibt
// (Konzept §4.3: "Filter muessen alle vier tragen").
assert.equal(jagdart('pirsch'), 'Pirsch')
assert.equal(jagdart('erntejagd'), 'Erntejagd')
assert.equal(jagdart(null), 'Unbekannt')
assert.equal(jagdart('quatsch'), 'Unbekannt')

// completed und auto_completed lesen sich gleich — der Unterschied ist eine
// Betriebsinnerei, keine Auskunft.
assert.equal(jagdstatus('completed'), 'Beendet')
assert.equal(jagdstatus('auto_completed'), 'Beendet')
assert.equal(jagdstatus('scheduled'), 'Geplant')
assert.equal(jagdstatus(null), 'Unbekannt')

// --- Zustandsfragen ---------------------------------------------------------

assert.equal(laeuft('active'), true)
assert.equal(laeuft('paused'), true) // pausiert ist nicht beendet — auch dann
assert.equal(laeuft('scheduled'), false) // greift der read-only-Riegel (§3)
assert.equal(beendet('auto_completed'), true)

// Der Riegel, um den es geht: eine laufende Jagd darf das Portal nicht
// umschreiben (Konzept §3), eine beendete auch nicht.
assert.equal(vorbereitbar('scheduled'), true)
assert.equal(vorbereitbar('draft'), true)
assert.equal(vorbereitbar('active'), false)
assert.equal(vorbereitbar('paused'), false)
assert.equal(vorbereitbar('completed'), false)
assert.equal(vorbereitbar('auto_completed'), false)

// --- Termin -----------------------------------------------------------------

// scheduled_for gewinnt, auch wenn started_at spaeter dasteht: die geplante
// Zeit ist die Aussage, der Start ist die Folge.
assert.equal(
  termin(jagd({ scheduled_for: '2027-04-15T08:00:00Z', started_at: '2027-04-15T09:13:00Z' })),
  '2027-04-15T08:00:00Z',
)
// 14 von 18 Jagden haben kein scheduled_for — dann traegt started_at.
assert.equal(termin(jagd({ started_at: '2026-06-10T05:00:00Z' })), '2026-06-10T05:00:00Z')
assert.equal(termin(jagd({ created_at: '2026-01-01T00:00:00Z' })), '2026-01-01T00:00:00Z')
assert.equal(termin(jagd({})), null)

// --- Terminanzeige ----------------------------------------------------------

// Feste Zone: der Server rechnet in UTC, der Browser in Berlin. Ohne timeZone
// lieferten beide verschiedene Zeichen und React meldete einen Mismatch.
// 08:00 UTC ist im April (Sommerzeit) 10:00 in Berlin.
assert.equal(terminText('2027-04-15T08:00:00Z'), '15.04.2027, 10:00')
// Im Januar (Winterzeit) nur eine Stunde Versatz — der Test faengt einen
// hartkodierten Offset.
assert.equal(terminText('2027-01-15T08:00:00Z'), '15.01.2027, 09:00')
// Mitternacht Berliner Zeit: die Uhrzeit faellt weg, statt eine Genauigkeit zu
// behaupten, die in der Zeile nicht steht.
assert.equal(terminText('2026-06-09T22:00:00Z'), '10.06.2026')
assert.equal(terminText(null), '—')
assert.equal(terminText('kein datum'), '—')
assert.equal(terminText('2027-04-15T08:00:00Z', false), '15.04.2027')

// --- Sortierung -------------------------------------------------------------

// Der Fall aus dem echten Bestand: eine geplante Jagd (15.04.2027) unter
// 17 beendeten. Sie muss oben stehen, sonst ist genau die unsichtbar, die
// vorbereitet werden soll.
{
  const geplant = jagd({ id: 'geplant', status: 'scheduled', scheduled_for: '2027-04-15T08:00:00Z' })
  const alt1 = jagd({ id: 'alt1', status: 'completed', started_at: '2026-06-10T05:00:00Z' })
  const alt2 = jagd({ id: 'alt2', status: 'auto_completed', started_at: '2026-07-16T05:00:00Z' })
  const reihe = sortiere([alt1, alt2, geplant]).map((j) => j.id)
  assert.deepEqual(reihe, ['geplant', 'alt2', 'alt1'])
}

// Offene untereinander aufsteigend (das Naechste oben), Beendete absteigend
// (das Letzte oben). Zwei verschiedene Richtungen, mit Absicht.
{
  const frueh = jagd({ id: 'frueh', status: 'scheduled', scheduled_for: '2026-09-01T08:00:00Z' })
  const spaet = jagd({ id: 'spaet', status: 'scheduled', scheduled_for: '2026-11-01T08:00:00Z' })
  assert.deepEqual(sortiere([spaet, frueh]).map((j) => j.id), ['frueh', 'spaet'])
}

// Eine laufende Jagd ist nicht beendet und gehoert nach oben.
{
  const laufend = jagd({ id: 'laufend', status: 'active', started_at: '2026-08-03T05:00:00Z' })
  const alt = jagd({ id: 'alt', status: 'completed', started_at: '2026-07-01T05:00:00Z' })
  assert.equal(sortiere([alt, laufend])[0].id, 'laufend')
}

// sortiere() darf die Eingabe nicht umbauen — sie kommt aus einem Server-Fetch
// und wird an anderer Stelle noch gebraucht.
{
  const a = jagd({ id: 'a', status: 'completed', started_at: '2026-01-01T00:00:00Z' })
  const b = jagd({ id: 'b', status: 'scheduled', scheduled_for: '2027-01-01T00:00:00Z' })
  const eingabe = [a, b]
  sortiere(eingabe)
  assert.deepEqual(eingabe.map((j) => j.id), ['a', 'b'])
}

// --- Zusagen ----------------------------------------------------------------

{
  const z = zusagen([
    { hunt_id: 'j1', status: 'joined' },
    { hunt_id: 'j1', status: 'invited' },
    { hunt_id: 'j1', status: 'invited' },
    { hunt_id: 'j2', status: 'joined' },
  ])
  assert.deepEqual(z.get('j1'), { zugesagt: 1, offen: 2, abgesagt: 0 })
  assert.deepEqual(z.get('j2'), { zugesagt: 1, offen: 0, abgesagt: 0 })
  assert.equal(z.get('gibtsnicht'), undefined)
}

// declined zaehlt erst, wenn Migration 088 appliziert ist — der Zweig steht
// aber schon und muss dann ohne weitere Aenderung greifen.
{
  const z = zusagen([
    { hunt_id: 'j1', status: 'declined' },
    { hunt_id: 'j1', status: 'joined' },
  ])
  assert.deepEqual(z.get('j1'), { zugesagt: 1, offen: 0, abgesagt: 1 })
}

// 'left' ist KEINE Absage: wer erst zusagt und dann geht, hat etwas anderes
// getan als wer nie zusagt. Beides zu vermischen waere eine falsche Auskunft.
{
  const z = zusagen([{ hunt_id: 'j1', status: 'left' }])
  assert.deepEqual(z.get('j1'), { zugesagt: 0, offen: 0, abgesagt: 0 })
}

// --- Filter -----------------------------------------------------------------

assert.equal(alsFilter(undefined), 'alle')
assert.equal(alsFilter('beendet'), 'beendet')
assert.equal(alsFilter('erfunden'), 'alle')

{
  const geplant = jagd({ id: 'g', status: 'scheduled' })
  const laufend = jagd({ id: 'l', status: 'active' })
  const alt = jagd({ id: 'a', status: 'completed' })
  const alle = [geplant, laufend, alt]

  assert.deepEqual(filtere(alle, 'alle').map((j) => j.id), ['g', 'l', 'a'])
  // "offen" heisst nicht-beendet und schliesst die laufende ein — sie ist der
  // Grund, warum jemand die Seite oeffnet.
  assert.deepEqual(filtere(alle, 'offen').map((j) => j.id), ['g', 'l'])
  assert.deepEqual(filtere(alle, 'geplant').map((j) => j.id), ['g'])
  assert.deepEqual(filtere(alle, 'beendet').map((j) => j.id), ['a'])
}

// filtere() gibt immer eine neue Liste zurueck, auch bei 'alle'.
{
  const eingabe = [jagd({ id: 'a' })]
  assert.notEqual(filtere(eingabe, 'alle'), eingabe)
}

// --- Suchparameter ----------------------------------------------------------

assert.equal(ersterWert('offen'), 'offen')
assert.equal(ersterWert(['offen', 'beendet']), 'offen')
assert.equal(ersterWert(undefined), undefined)
assert.equal(ersterWert([]), undefined)
