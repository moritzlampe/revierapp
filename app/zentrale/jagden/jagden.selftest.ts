// Gegenprobe fuer die Regeln der Jagdliste. Dieses Repo hat keinen Test-Runner,
// deshalb ein eigenstaendiges Skript statt eines Frameworks (gleiches Muster
// wie kontakte.selftest.ts und scheine.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/jagden/jagden.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  alsEingabewert,
  alsFilter,
  alsZeitstempel,
  beendet,
  einladungscode,
  ersterWert,
  filtere,
  jagdAenderungen,
  jagdart,
  jagdstatus,
  laeuft,
  namensvorschlag,
  pruefeJagdEntwurf,
  rolle,
  sortiere,
  sortiereTeilnehmer,
  tag,
  teilnahme,
  teilnehmerName,
  termin,
  terminText,
  vorbereitbar,
  VORBEREITBARE_STATUS,
  wiederEinladbar,
  zusagen,
  type Jagd,
  type JagdEntwurf,
  type Teilnehmer,
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

// **Unbekannt heisst "nicht anfassen".** Vorher stand hier die doppelte
// Verneinung `!laeuft && !beendet`, die zu `null` und zu jedem kuenftigen
// Enum-Wert "ja, aendere ruhig" sagte — waehrend der Statusfilter im UPDATE
// aus einer Aufzaehlung besteht und dasselbe verneinte. Die beiden liefen
// auseinander (Schlusslesung 03.08.2026).
assert.equal(vorbereitbar(null), false)
assert.equal(vorbereitbar('irgendwas_neues'), false)

// Der Filter im UPDATE und die Funktion muessen aus derselben Quelle kommen —
// sonst zeigt die Seite Knoepfe, die die Query nicht bedient.
for (const s of VORBEREITBARE_STATUS) assert.equal(vorbereitbar(s), true)
assert.equal(VORBEREITBARE_STATUS.length, 2)

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

// --- Rollen, Tags, Teilnahme ------------------------------------------------

assert.equal(rolle('jagdleiter'), 'Jagdleiter')
assert.equal(rolle('schuetze'), 'Schütze')
assert.equal(rolle('treiber'), 'Treiber')
assert.equal(rolle(null), 'Unbekannt')

assert.equal(tag('hundefuehrer'), 'Hundeführer')
// Ein unbekannter Tag gibt sich selbst zurueck statt "Unbekannt": die Spalte
// ist ein Enum-Array, ein neuer Wert waere eine Migration und soll dann lesbar
// durchkommen, nicht als Fehler aussehen.
assert.equal(tag('waldpilz'), 'waldpilz')

assert.equal(teilnahme('declined'), 'Abgesagt')
assert.equal(teilnahme('joined'), 'Zugesagt')
assert.equal(teilnahme('left'), 'Ausgetreten')
assert.equal(teilnahme(null), 'Unbekannt')

// Nur eine Absage ist eine erneute Einladung wert. `left` gehoert in die App.
assert.equal(wiederEinladbar('declined'), true)
assert.equal(wiederEinladbar('left'), false)
assert.equal(wiederEinladbar('invited'), false)
assert.equal(wiederEinladbar('joined'), false)

// --- Teilnehmernamen --------------------------------------------------------

function teiln(teil: Partial<Teilnehmer>): Teilnehmer {
  return { id: 't', user_id: null, guest_name: null, role: 'schuetze', tags: [], status: 'joined', ...teil }
}

const namen = { 'aaaaaaaa-1111': 'Moritz', 'bbbbbbbb-2222': 'Heinrich' }

assert.equal(teilnehmerName(teiln({ user_id: 'aaaaaaaa-1111' }), namen), 'Moritz')
assert.equal(teilnehmerName(teiln({ guest_name: 'Gast Ohne Konto' }), namen), 'Gast Ohne Konto')
// Ein Profil, das RLS nicht durchlaesst, darf keine leere Zeile ergeben.
assert.equal(teilnehmerName(teiln({ user_id: 'cccccccc-3333' }), namen), 'Konto cccccccc')
assert.equal(teilnehmerName(teiln({}), namen), 'Unbekannt')

// --- Sortierung der Teilnehmer ----------------------------------------------

{
  const liste = [
    teiln({ id: 'abgesagt', user_id: 'aaaaaaaa-1111', status: 'declined' }),
    teiln({ id: 'offen', guest_name: 'Zacharias', status: 'invited' }),
    teiln({ id: 'zugesagt', guest_name: 'Wilhelm', status: 'joined' }),
    teiln({ id: 'leiter', user_id: 'bbbbbbbb-2222', role: 'jagdleiter', status: 'joined' }),
  ]
  // Leiter oben, dann zugesagt, eingeladen, abgesagt.
  assert.deepEqual(
    sortiereTeilnehmer(liste, namen).map((t) => t.id),
    ['leiter', 'zugesagt', 'offen', 'abgesagt'],
  )
  // Der Leiter steht oben, obwohl "Heinrich" alphabetisch hinter "Wilhelm"
  // NICHT kaeme — die Rolle schlaegt den Namen.
  assert.equal(sortiereTeilnehmer(liste, namen)[0].id, 'leiter')
}

// Gleicher Rang, gleiche Rolle: dann entscheidet der Name, deutsch sortiert.
{
  const liste = [
    teiln({ id: 'oe', guest_name: 'Österle', status: 'joined' }),
    teiln({ id: 'n', guest_name: 'Naumann', status: 'joined' }),
    teiln({ id: 'z', guest_name: 'Zacharias', status: 'joined' }),
  ]
  assert.deepEqual(sortiereTeilnehmer(liste, namen).map((t) => t.id), ['n', 'oe', 'z'])
}

// sortiereTeilnehmer() fasst die Eingabe nicht an.
{
  const eingabe = [teiln({ id: 'b', status: 'declined' }), teiln({ id: 'a', status: 'joined' })]
  const vorher = eingabe.map((t) => t.id)
  sortiereTeilnehmer(eingabe, namen)
  assert.deepEqual(eingabe.map((t) => t.id), vorher)
}

// --- Entwurf pruefen --------------------------------------------------------

function entwurf(teil: Partial<JagdEntwurf> = {}): JagdEntwurf {
  return { name: 'Drückjagd Nord', termin: '2026-11-14T08:00', type: 'drueckjagd', ...teil }
}

assert.equal(pruefeJagdEntwurf(entwurf()), null)
assert.match(pruefeJagdEntwurf(entwurf({ name: '' })) ?? '', /Namen/)
// Nur Leerzeichen ist kein Name.
assert.match(pruefeJagdEntwurf(entwurf({ name: '   ' })) ?? '', /Namen/)
// Der Termin ist Pflicht — das Portal plant, es startet nicht (Konzept §3).
assert.match(pruefeJagdEntwurf(entwurf({ termin: '' })) ?? '', /Termin/)
assert.match(pruefeJagdEntwurf(entwurf({ termin: 'morgen frueh' })) ?? '', /Datum/)
assert.match(
  pruefeJagdEntwurf(entwurf({ type: 'flugjagd' as never })) ?? '',
  /Jagdart/,
)

// --- Termin hin und zurueck -------------------------------------------------

// Der Rundweg muss den Wert erhalten: was im Feld stand, steht nach dem
// Speichern und Neuladen wieder dort. Sonst wandert der Termin bei jedem
// Bearbeiten um den Zonenversatz.
{
  const eingabe = '2026-11-14T08:00'
  const iso = alsZeitstempel(eingabe)
  assert.ok(iso)
  assert.equal(alsEingabewert(iso), eingabe)
}

// Auch ueber die Sommerzeitgrenze: Juli ist CEST (+02:00), November CET (+01:00).
{
  const sommer = '2026-07-15T18:30'
  assert.equal(alsEingabewert(alsZeitstempel(sommer)), sommer)
}

// **Die Zeitumstellungstage selbst, und das ist der Test, der vorher fehlte.**
// Die erste Fassung mass den Berlin-Versatz am Ausgangspunkt statt am Ergebnis
// und lag an genau diesen Tagen eine Stunde daneben — gefunden von der
// Fremdpruefung am 03.08.2026, nicht von diesem Selbsttest. Juli und November
// liegen beide weit von jeder Grenze; sie haben den Fehler nicht sehen koennen.
//
// 2026: Vorstellen am 29.03. (02:00 -> 03:00), Rueckstellen am 25.10.
// (03:00 -> 02:00).
{
  // Vorstellen, die Stunde davor und danach.
  assert.equal(alsEingabewert(alsZeitstempel('2026-03-29T01:30')), '2026-03-29T01:30')
  assert.equal(alsEingabewert(alsZeitstempel('2026-03-29T03:30')), '2026-03-29T03:30')
  // Rueckstellen, davor und danach.
  assert.equal(alsEingabewert(alsZeitstempel('2026-10-25T01:30')), '2026-10-25T01:30')
  assert.equal(alsEingabewert(alsZeitstempel('2026-10-25T03:30')), '2026-10-25T03:30')
  // Der Tag drumherum bleibt ebenfalls stabil.
  assert.equal(alsEingabewert(alsZeitstempel('2026-03-28T23:30')), '2026-03-28T23:30')
  assert.equal(alsEingabewert(alsZeitstempel('2026-10-26T00:30')), '2026-10-26T00:30')
}

// Die zwei Sonderstunden. Sie sind nicht "richtig" aufloesbar — hier steht,
// was tatsaechlich herauskommt, damit eine spaetere Aenderung auffaellt.
{
  // 02:30 am 29.03. existiert nicht (die Stunde wird uebersprungen). Der Wert
  // wird nach vorn normalisiert.
  const uebersprungen = alsEingabewert(alsZeitstempel('2026-03-29T02:30'))
  assert.equal(uebersprungen, '2026-03-29T03:30')
  // 02:30 am 25.10. gibt es zweimal. Geliefert wird eine der beiden Lesarten —
  // welche, ist offen, aber der Rundweg muss auf sich selbst zurueckfallen.
  const doppelt = alsZeitstempel('2026-10-25T02:30')
  assert.equal(alsEingabewert(doppelt), '2026-10-25T02:30')
}

assert.equal(alsZeitstempel(''), null)
assert.equal(alsZeitstempel('kein datum'), null)
assert.equal(alsEingabewert(null), '')
assert.equal(alsEingabewert('kein datum'), '')

// --- Aenderungen ------------------------------------------------------------

const bestand = (teil: Partial<Jagd> = {}): Jagd =>
  jagd({ name: 'Drückjagd Nord', type: 'drueckjagd', scheduled_for: '2026-11-14T07:00:00+00:00', ...teil })

// Nichts geaendert heisst nichts schreiben.
assert.equal(jagdAenderungen(entwurf({ termin: alsEingabewert('2026-11-14T07:00:00+00:00') }), bestand()), null)

// **Der Kern dieses Tests**: die DB liefert `+00:00`, toISOString() liefert
// `.000Z`. Zeichenweise verglichen waeren die beiden verschieden, und jedes
// Speichern schriebe den Termin neu — ein Write ohne Aenderung, der wie eine
// Aenderung aussieht.
{
  const gleich = jagdAenderungen(
    entwurf({ termin: alsEingabewert('2026-11-14T07:00:00+00:00') }),
    bestand({ scheduled_for: '2026-11-14T07:00:00.000Z' }),
  )
  assert.equal(gleich, null)
}

// Einzelne Felder kommen einzeln.
assert.deepEqual(
  jagdAenderungen(entwurf({ name: 'Drückjagd Süd', termin: alsEingabewert('2026-11-14T07:00:00+00:00') }), bestand()),
  { name: 'Drückjagd Süd' },
)

// **Die Jagdart zieht `signal_mode` mit.** Ohne das bliebe ein Wechsel auf
// Drueckjagd still und der Wechsel zurueck laut — die Feld-App laese eine
// Kombination, die bei einer Neuanlage nie entstuende (Fremdpruefung 03.08.2026).
assert.deepEqual(
  jagdAenderungen(entwurf({ type: 'ansitz', termin: alsEingabewert('2026-11-14T07:00:00+00:00') }), bestand()),
  { type: 'ansitz', signal_mode: 'silent' },
)
assert.deepEqual(
  jagdAenderungen(
    entwurf({ type: 'drueckjagd', termin: alsEingabewert('2026-11-14T07:00:00+00:00') }),
    bestand({ type: 'ansitz' }),
  ),
  { type: 'drueckjagd', signal_mode: 'loud' },
)
// Bleibt die Art gleich, wird `signal_mode` nicht angefasst — sonst schriebe
// jedes Speichern eine Spalte, die niemand geaendert hat.
assert.equal(
  jagdAenderungen(entwurf({ termin: alsEingabewert('2026-11-14T07:00:00+00:00') }), bestand()),
  null,
)

// Ein Termin, der vorher fehlte, wird gesetzt — 14 von 18 Jagden im Bestand
// tragen keinen (03.08.2026).
{
  const patch = jagdAenderungen(entwurf({ termin: '2026-11-14T08:00' }), bestand({ scheduled_for: null }))
  assert.ok(patch)
  assert.ok(patch.scheduled_for)
}

// Der getrimmte Name zaehlt, nicht der getippte.
assert.equal(
  jagdAenderungen(
    entwurf({ name: '  Drückjagd Nord  ', termin: alsEingabewert('2026-11-14T07:00:00+00:00') }),
    bestand(),
  ),
  null,
)

// --- Einladungscode ---------------------------------------------------------

// `hunts.invite_code` ist NOT NULL ohne Default — ohne diesen Wert scheitert
// jedes Anlegen aus dem Portal.
{
  const code = einladungscode()
  assert.equal(code.length, 13)
  assert.match(code, /^[0-9a-z]+$/)
  assert.notEqual(einladungscode(), einladungscode())
}

// --- Namensvorschlag --------------------------------------------------------

assert.equal(namensvorschlag('2026-11-14T08:00'), 'Jagd am 14.11.2026')
assert.equal(namensvorschlag(''), 'Jagd')
assert.equal(namensvorschlag('unsinn'), 'Jagd')
// Fuehrende Nullen fallen weg, wie in der App ("Jagd am 5.1.2027").
assert.equal(namensvorschlag('2027-01-05T06:00'), 'Jagd am 5.1.2027')

// **Der Tag kommt aus der Zeichenkette, nicht aus einem Date-Objekt.** Ueber
// `new Date()` haette 23:30 unter UTC den Folgetag ergeben, waehrend der
// gespeicherte Berliner Termin auf dem Vortag liegt — Jagd, Chat-Gruppe und
// Einladungslink truegen dann ein Datum, das der Termin nicht hat
// (Fremdpruefung 03.08.2026). Dieser Test faellt in jeder Zone gleich aus.
assert.equal(namensvorschlag('2026-08-15T23:30'), 'Jagd am 15.8.2026')
assert.equal(namensvorschlag('2026-08-15T00:30'), 'Jagd am 15.8.2026')
