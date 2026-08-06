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
  aktuellesJagdjahr,
  alsJahr,
  ALLE_JAHRE,
  alsZeitstempel,
  antworten,
  beendet,
  einladungscode,
  ersterWert,
  filtere,
  jagdAenderungen,
  jagdart,
  jagdjahre,
  jagdjahrLabel,
  jagdjahrVon,
  nachJagdjahr,
  jagdstatus,
  laeuft,
  alsTerminwert,
  datumTeil,
  zeitTeil,
  mehrtaegig,
  namensvorschlag,
  spaetestesEndeDatum,
  tagPlus,
  STANDARD_BEGINN,
  STANDARD_ENDE,
  pruefeJagdEntwurf,
  rolle,
  gruppiereTeilnehmer,
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
  zeitraumText,
  zusagen,
  type Jagd,
  type JagdEntwurf,
  type Teilnahme,
  type Teilnehmer,
  gastZustand,
  rolleBeimEinladen,
  rollenVerteilung,
  leerText,
  GAST_ZUSTAENDE,
  filterZaehler,
  imFilter,
  kandidaten,
  kontaktName,
  namensschluessel,
  sichtbareKandidaten,
  EINLADE_FILTER,
  KONTAKT_SCHLUESSEL,
  KONTO_SCHLUESSEL,
  SETZBARE_ROLLEN,
  OHNE_NAMEN,
} from './jagden.ts'
import { suchtext, KATEGORIEN } from '../gaeste/kontakte.ts'

function jagd(teil: Partial<Jagd>): Jagd {
  return {
    id: 'x',
    name: 'Jagd',
    type: 'drueckjagd',
    status: 'completed',
    scheduled_for: null,
    scheduled_until: null,
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

// Die Testzeilen tragen alle Felder, die auch die Query laedt — sonst prueft
// der Test eine andere Form als die Produktion. (`--experimental-strip-types`
// entfernt Typen, es prueft sie nicht; und die selftest-Dateien sind aus
// tsconfig ausgeschlossen. Der Compiler faengt so etwas hier also nicht.)
function zeile(teil: Partial<Teilnahme> & { hunt_id: string }): Teilnahme {
  return { status: 'joined', user_id: null, guest_name: null, joined_at: null, left_at: null, ...teil }
}

{
  const z = zusagen([
    zeile({ hunt_id: 'j1', status: 'joined' }),
    zeile({ hunt_id: 'j1', status: 'invited' }),
    zeile({ hunt_id: 'j1', status: 'invited' }),
    zeile({ hunt_id: 'j2', status: 'joined' }),
  ])
  assert.deepEqual(z.get('j1'), { zugesagt: 1, offen: 2, abgesagt: 0 })
  assert.deepEqual(z.get('j2'), { zugesagt: 1, offen: 0, abgesagt: 0 })
  assert.equal(z.get('gibtsnicht'), undefined)
}

// declined zaehlt erst, wenn Migration 088 appliziert ist — der Zweig steht
// aber schon und muss dann ohne weitere Aenderung greifen.
{
  const z = zusagen([
    zeile({ hunt_id: 'j1', status: 'declined' }),
    zeile({ hunt_id: 'j1', status: 'joined' }),
  ])
  assert.deepEqual(z.get('j1'), { zugesagt: 1, offen: 0, abgesagt: 1 })
}

// 'left' ist KEINE Absage: wer erst zusagt und dann geht, hat etwas anderes
// getan als wer nie zusagt. Beides zu vermischen waere eine falsche Auskunft.
{
  const z = zusagen([zeile({ hunt_id: 'j1', status: 'left' })])
  assert.deepEqual(z.get('j1'), { zugesagt: 0, offen: 0, abgesagt: 0 })
}

// --- Antworten: wer, nicht nur wie viele -------------------------------------

{
  const liste = [
    zeile({ hunt_id: 'j1', status: 'joined', user_id: 'a', joined_at: '2026-07-02T10:00:00Z' }),
    zeile({ hunt_id: 'j1', status: 'joined', user_id: 'b', joined_at: '2026-07-01T10:00:00Z' }),
    zeile({ hunt_id: 'j1', status: 'invited', user_id: 'c' }),
    zeile({ hunt_id: 'j1', status: 'declined', guest_name: 'Zacharias', left_at: '2026-07-03T10:00:00Z' }),
    zeile({ hunt_id: 'j1', status: 'left', user_id: 'd' }),
  ]
  const a = antworten(liste, { a: 'Anton', b: 'Berta', c: 'Cäsar', d: 'Dora' })!.get('j1')!

  // Zugesagte nach Zeitpunkt, die frueheste Antwort oben.
  assert.deepEqual(a.zugesagt.map((x) => x.name), ['Berta', 'Anton'])
  assert.equal(a.zugesagt[0].datum, '2026-07-01T10:00:00Z')
  // Offene haben keinen Zeitpunkt — dort entscheidet der Name.
  assert.deepEqual(a.offen.map((x) => x.name), ['Cäsar'])
  assert.equal(a.offen[0].datum, null)
  // Absagen tragen `left_at`, und ein Gast ohne Konto steht mit seinem Namen da.
  assert.deepEqual(a.abgesagt.map((x) => x.name), ['Zacharias'])
  assert.equal(a.abgesagt[0].datum, '2026-07-03T10:00:00Z')
  // `left` taucht in KEINER der drei Listen auf — wie bei zusagen().
  assert.equal(a.zugesagt.length + a.offen.length + a.abgesagt.length, 4)
}

// **Die Zahl in der Tabelle und die Namen dahinter kommen aus derselben
// Quelle.** Liefen sie auseinander, stuende "3" ueber einer Liste mit zwei
// Namen — deshalb leitet zusagen() seine Zahlen aus antworten() ab.
{
  const liste = [
    zeile({ hunt_id: 'j1', status: 'joined', user_id: 'a' }),
    zeile({ hunt_id: 'j1', status: 'invited', user_id: 'b' }),
    zeile({ hunt_id: 'j1', status: 'declined', user_id: 'c' }),
    zeile({ hunt_id: 'j1', status: 'left', user_id: 'd' }),
  ]
  const z = zusagen(liste).get('j1')!
  const a = antworten(liste, {}).get('j1')!
  assert.equal(z.zugesagt, a.zugesagt.length)
  assert.equal(z.offen, a.offen.length)
  assert.equal(z.abgesagt, a.abgesagt.length)
}

// Ein Konto ohne Profilnamen faellt nicht als leere Zeile heraus.
{
  const a = antworten([zeile({ hunt_id: 'j1', user_id: 'abcdefgh-1234' })], {}).get('j1')!
  assert.equal(a.zugesagt[0].name, 'Konto abcdefgh')
}

// --- Jagdjahr ---------------------------------------------------------------

// Die Grenze ist der 1. April, und sie wird in BERLINER Zeit gezogen. Der
// zweite Fall ist der, auf den es ankommt: 31.03. um 23:30 Berlin ist
// 21:30 UTC — wer in UTC rechnet, wirft ihn ins falsche Jagdjahr.
assert.equal(jagdjahrVon('2026-04-01T00:30:00+02:00'), '2026')
assert.equal(jagdjahrVon('2026-03-31T23:30:00+02:00'), '2025')
assert.equal(jagdjahrVon('2026-12-24T10:00:00Z'), '2026')
assert.equal(jagdjahrVon('2027-01-06T10:00:00Z'), '2026')
assert.equal(jagdjahrVon(null), null)
assert.equal(jagdjahrVon('unsinn'), null)

// Mitternacht am 1. April gehoert ins neue Jagdjahr, nicht ins alte.
assert.equal(jagdjahrVon('2026-03-31T22:00:00Z'), '2026') // = 1.4. 00:00 Berlin

assert.equal(jagdjahrLabel('2026'), '26/27')
assert.equal(jagdjahrLabel('2099'), '99/00') // Jahrhundertwechsel bleibt lesbar
assert.equal(jagdjahrLabel('quatsch'), 'quatsch')

// Die Auswahl deckt einen ZEITRAUM ab (30 Jahre zurueck) und nimmt jedes
// vorkommende Jahr zusaetzlich auf — neueste zuerst, keine Luecken.
{
  const liste = [
    jagd({ id: 'a', scheduled_for: '2026-05-01T08:00:00Z' }), // 2026
    jagd({ id: 'b', scheduled_for: '2027-06-01T08:00:00Z' }), // 2027
    jagd({ id: 'c', scheduled_for: '2026-11-01T08:00:00Z' }), // 2026
    jagd({ id: 'd' }), // ohne Termin -> kein Jahr
  ]
  // `heute` eingespeist, weil `jagdjahre()` den Zeitraum daraus rechnet und die
  // Zusicherung sonst nur an dem Tag gilt, an dem man sie schreibt.
  const H = '2026-08-04T10:00:00Z'
  {
    const jahre = jagdjahre(liste, H)
    // 30 Jahre ab dem aktuellen (2026 … 1997) plus das zukuenftige 2027 aus dem
    // Bestand. Als Laenge geprueft, nicht als Liste: eine 31-Elemente-deepEqual
    // waere unlesbar und pruefte nichts, was die Zusicherungen darunter nicht
    // schaerfer treffen.
    // Laenge und Raender; die Menge selbst ist damit NICHT vollstaendig gepinnt
    // (Codex 04.08.2026, Punkt 10 — der Kommentar behauptete hier zu viel).
    assert.equal(jahre.length, 31, '30 Eintraege + ein zusaetzliches Jahr aus dem Bestand')
    assert.equal(jahre.at(-1), '1997', 'die Untergrenze: 30 Eintraege ab 2026 enden bei 1997')
    // **Absteigend paarweise geprueft, NICHT gegen `[...jahre].sort(cmp)`.** Der
    // alte Test erzeugte seine Erwartung mit demselben Comparator wie die
    // Implementierung und konnte nur fehlschlagen, wenn `Array.sort` kaputt ist.
    for (let i = 1; i < jahre.length; i++) {
      assert.ok(Number(jahre[i - 1]) > Number(jahre[i]), `absteigend bei ${jahre[i - 1]}/${jahre[i]}`)
    }
    // **Der Kern der Aenderung**: ein leeres Jahr ist waehlbar. Vorher fiel es
    // aus der Liste, und die Vorsaison war nicht erreichbar.
    assert.ok(jahre.includes('2025'), 'ein Jahr ohne jede Jagd steht trotzdem drin')
  }
  // Das aktuelle Jahr kommt immer mit, auch wenn keine Jagd darin liegt — die
  // Bedingung dafuer, dass die Vorauswahl eine passende <option> hat.
  assert.equal(jagdjahre(liste, '2028-08-04T10:00:00Z')[0], '2028')
  assert.equal(jagdjahre([], H).length, 30, 'leerer Bestand: der nackte Zeitraum')
  assert.equal(jagdjahre([], H)[0], '2026', 'leerer Bestand: heute zuerst')
  // Ein Import von vor 40 Jahren faellt NICHT aus seiner eigenen Liste — der
  // Zeitraum ist die Untergrenze, nicht die Grenze. Ohne das schickte `alsJahr()`
  // einen Link auf so ein Jahr auf "Alle".
  {
    const alt = [jagd({ id: 'x', scheduled_for: '1986-11-01T08:00:00Z' })]
    const jahre = jagdjahre(alt, H)
    assert.ok(jahre.includes('1986'), 'vorkommendes Jahr vor dem Zeitraum bleibt drin')
    assert.equal(jahre.at(-1), '1986', 'und steht als aeltestes am Ende')
    assert.equal(alsJahr('1986', alt, H), '1986', 'und ist damit auch waehlbar')
  }
  // **Unbrauchbares `heute`: NUR der Bestand, kein einziger Nicht-Jahres-Wert.**
  // Ein frueherer Stand legte hier `ALLE_JAHRE` ab und der Test schrieb das fest —
  // es waere als zweite <option> "alle" im Menue gelandet und haette mit `NaN` die
  // Sortierung unbestimmt gemacht (Codex 04.08.2026, Punkt 2 und 10).
  {
    // Eine zusaetzliche Zeile "filter(Nicht-Jahr) === []" stand hier und war von
    // der naechsten vollstaendig subsumiert — sie konnte nie allein fehlschlagen
    // (Schlusslesung Fable 5, 04.08.2026). Genau der Befund, der eine Zeile
    // vorher schon an einer anderen Zusicherung getroffen hatte.
    assert.deepEqual(jagdjahre(liste, 'quatsch'), ['2027', '2026'], 'nur der Bestand, absteigend')
  }
  assert.deepEqual(nachJagdjahr(liste, '2026').map((j) => j.id), ['a', 'c'])
  assert.deepEqual(nachJagdjahr(liste, '2027').map((j) => j.id), ['b'])
  // "Alle" gibt alles zurueck, auch die ohne Termin.
  assert.equal(nachJagdjahr(liste, ALLE_JAHRE).length, 4)
  // Eine Jagd ohne Termin verschwindet, sobald ein Jahr gewaehlt ist — sie
  // gehoert in keines, und sie in alle zu zeigen waere eine falsche Auskunft.
  assert.equal(nachJagdjahr(liste, '2026').some((j) => j.id === 'd'), false)
}

// nachJagdjahr() gibt immer eine neue Liste zurueck, auch bei "alle".
{
  const eingabe = [jagd({ id: 'a' })]
  assert.notEqual(nachJagdjahr(eingabe, ALLE_JAHRE), eingabe)
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

// --- Gruppierung der Teilnehmer ---------------------------------------------

// Der Fall, um dessentwillen es die Gruppierung gibt: ein ABGESAGTER Jagdleiter
// stand in der flachen Sortierung ueber allen Zugesagten und las sich wie
// "verfuegbar" (Codex, 03.08.2026). Hier schlaegt der Zustand die Rolle.
{
  const liste = [
    teiln({ id: 'schuetze', guest_name: 'Wilhelm', status: 'joined' }),
    teiln({ id: 'leiter', user_id: 'bbbbbbbb-2222', role: 'jagdleiter', status: 'declined' }),
  ]
  assert.deepEqual(sortiereTeilnehmer(liste, namen).map((t) => t.id), ['leiter', 'schuetze'])
  const g = gruppiereTeilnehmer(liste, namen)
  assert.deepEqual(g.map((x) => x.status), ['joined', 'declined'])
  assert.deepEqual(g[0].eintraege.map((t) => t.id), ['schuetze'])
  assert.deepEqual(g[1].eintraege.map((t) => t.id), ['leiter'])
}

// Reihenfolge der Gruppen: zugesagt, eingeladen, abgesagt, ausgetreten
// (Moritz, 03.08.2026). Der Leiter steht INNERHALB seiner Gruppe oben.
{
  const liste = [
    teiln({ id: 'weg', guest_name: 'Ludwig', status: 'left' }),
    teiln({ id: 'abgesagt', guest_name: 'Anton', status: 'declined' }),
    teiln({ id: 'offen', guest_name: 'Zacharias', status: 'invited' }),
    teiln({ id: 'zugesagt', guest_name: 'Wilhelm', status: 'joined' }),
    teiln({ id: 'leiter', user_id: 'bbbbbbbb-2222', role: 'jagdleiter', status: 'joined' }),
  ]
  const g = gruppiereTeilnehmer(liste, namen)
  assert.deepEqual(g.map((x) => x.status), ['joined', 'invited', 'declined', 'left'])
  assert.deepEqual(g.map((x) => x.titel), ['Zugesagt', 'Eingeladen', 'Abgesagt', 'Ausgetreten'])
  assert.deepEqual(g.map((x) => x.eintraege.length), [2, 1, 1, 1])
  // "Heinrich" kaeme alphabetisch vor "Wilhelm" — aber die Rolle entscheidet,
  // und zwar nur noch innerhalb der Gruppe.
  assert.deepEqual(g[0].eintraege.map((t) => t.id), ['leiter', 'zugesagt'])
}

// Nur ein Zustand ergibt genau EINE Gruppe — die Oberflaeche zeigt dann keine
// Zwischenzeile. Das ist der Riegel gegen Verwaltungsarchitektur fuer zwei
// Leute (groesste Jagd im Bestand am 03.08.2026: 4 Teilnehmer).
{
  const liste = [
    teiln({ id: 'a', guest_name: 'Anton', status: 'joined' }),
    teiln({ id: 'b', guest_name: 'Berta', status: 'joined' }),
  ]
  assert.equal(gruppiereTeilnehmer(liste, namen).length, 1)
}

// Leere Liste: keine Gruppen, kein Absturz.
assert.deepEqual(gruppiereTeilnehmer([], namen), [])

// Ein unbekannter Zustand faellt hinten heraus statt eine Person zu verschlucken.
{
  const liste = [
    teiln({ id: 'komisch', guest_name: 'Xaver', status: 'wasauchimmer' }),
    teiln({ id: 'ohne', guest_name: 'Yvonne', status: null }),
    teiln({ id: 'zugesagt', guest_name: 'Anton', status: 'joined' }),
  ]
  const g = gruppiereTeilnehmer(liste, namen)
  assert.equal(g[0].status, 'joined')
  assert.deepEqual(g.slice(1).map((x) => x.titel), ['Unbekannt', 'Unbekannt'])
  // **Auf IDs pruefen, nicht auf die Gesamtzahl** (Fremdprüfung 03.08.2026,
  // F13): "Summe 3" bliebe auch dann gruen, wenn Xaver verdoppelt und Yvonne
  // verschluckt wuerde. Jede Person genau einmal, und in ihrer eigenen Gruppe.
  assert.deepEqual(
    g.flatMap((x) => x.eintraege.map((t) => t.id)).sort(),
    ['komisch', 'ohne', 'zugesagt'],
  )
  assert.deepEqual(g.map((x) => x.eintraege.map((t) => t.id)), [
    ['zugesagt'],
    ['komisch'],
    ['ohne'],
  ])
}

// gruppiereTeilnehmer() fasst die Eingabe nicht an.
{
  const eingabe = [teiln({ id: 'b', status: 'declined' }), teiln({ id: 'a', status: 'joined' })]
  const vorher = eingabe.map((t) => t.id)
  gruppiereTeilnehmer(eingabe, namen)
  assert.deepEqual(eingabe.map((t) => t.id), vorher)
}

// --- Entwurf pruefen --------------------------------------------------------

function entwurf(teil: Partial<JagdEntwurf> = {}): JagdEntwurf {
  return {
    name: 'Drückjagd Nord',
    termin: '2026-11-14T08:00',
    bis: '',
    type: 'drueckjagd',
    ...teil,
  }
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

// --- Das Ende ---------------------------------------------------------------

// **Leer ist gueltig, und das ist der Normalfall.** Migration 107 setzt dann
// das Ende des Berliner Jagdtags. Ein Pflichtfeld waere hier falsch: 95 % der
// Jagden sind eintaegig.
assert.equal(pruefeJagdEntwurf(entwurf({ bis: '' })), null)
assert.equal(pruefeJagdEntwurf(entwurf({ bis: '2026-11-16T08:00' })), null)
assert.match(pruefeJagdEntwurf(entwurf({ bis: 'uebermorgen' })) ?? '', /Datum/)

// **Ein Termin mit angehaengtem `Z` muss abprallen** — und die erste Fassung
// liess ihn durch. `new Date('2026-11-14T08:00Z')` ist gueltig, `alsZeitstempel`
// haengt aber ein ZWEITES `Z` an und liefert `null`; `jagdAnlegen` schrieb
// daraufhin still `scheduled_for: null`. Eine Jagd ohne Termin, obwohl das
// Formular „geprueft" gemeldet hat (Fremdpruefung 06.08.2026). Ueber den Picker
// unerreichbar — `pruefeJagdEntwurf` ist aber eine exportierte Zusage.
assert.match(pruefeJagdEntwurf(entwurf({ termin: '2026-11-14T08:00Z' })) ?? '', /Datum/)

// **Verdreht am SELBEN Kalendertag**, nur ueber die Uhr. Die Zeile belegt, dass
// die Reihenfolge weiter ZEITPUNKTE prueft und nicht Tage — mit einem reinen
// Tagesvergleich ginge 07:00 -> 06:00 durch (Fremdpruefung 06.08.2026).
assert.match(
  pruefeJagdEntwurf(entwurf({ termin: '2026-11-14T07:00', bis: '2026-11-14T06:00' })) ?? '',
  /vor dem Termin/,
)

// **Die Fruehlingsluecke laesst eine sichtbar verdrehte Eingabe durch, und das
// ist BEKANNT statt behoben** (Fremdpruefung 06.08.2026). Am 29.03.2026 gibt es
// 02:30 nicht; `alsZeitstempel` normalisiert nach vorn auf 03:30. „03:00 bis
// 02:30" sieht verdreht aus und ist es nach der Normalisierung nicht mehr.
// Die Zusicherung haelt das Verhalten fest, damit es nicht unbemerkt kippt —
// den Ausweg (mehrdeutige Zeiten bestaetigen lassen) nennt der `ponytail:`-
// Absatz bei `alsZeitstempel` und lehnt ihn fuer dieses Produkt ab.
assert.equal(pruefeJagdEntwurf(entwurf({ termin: '2026-03-29T03:00', bis: '2026-03-29T02:30' })), null)

// Verdreht: das Ende vor dem Termin. Die DB nimmt das an (095 hat den CHECK
// ausdruecklich abgelehnt), die Jagd fiele aber aus der Cron-Ausnahme von 102
// und wuerde nachts eingesammelt — also faengt es das Formular.
assert.match(pruefeJagdEntwurf(entwurf({ bis: '2026-11-13T08:00' })) ?? '', /vor dem Termin/)

// **Die Grenze auf den TAG, in beide Richtungen.** Ein Test daneben belegt
// nichts: am 03.08. lag eine Grenzwert-Zusicherung bei `23:30Z` neben der
// Grenze bei `22:00Z`, am 04.08. eine bei `1990` neben `1997`. Beide Male hat
// erst die Fremdpruefung es gefunden.
//
// **Gezaehlt werden KALENDERTAGE, nicht 24-Stunden-Bloecke** — die Korrektur
// vom 06.08.2026. Termin 14.11. 07:00, Ende 28.11. 20:00 sind 14 Tage und
// 13 Stunden; als Zeitspanne waeren sie zu lang gewesen, als Kalendertage sind
// sie genau die Grenze. Moritz: „14 tage + die 13 stunden sind korrekt
// geplant." Migration 108 hebt den Cron-Deckel dafuer auf 16 Tage.
assert.equal(
  pruefeJagdEntwurf(entwurf({ termin: '2026-11-14T07:00', bis: '2026-11-28T20:00' })),
  null, // Tag 14, 13 Stunden ueber der reinen Spanne — muss durchgehen
)
assert.match(
  pruefeJagdEntwurf(entwurf({ termin: '2026-11-14T07:00', bis: '2026-11-29T07:00' })) ?? '',
  /14 Tage/, // Tag 15, obwohl die SPANNE kleiner ist als bei der Zeile darueber
)

// **Der schlechteste Fall OHNE Zeitumstellung dazwischen**: Start 00:00, Ende
// 23:59 am 14. Tag = 14 Tage 23:59 Stunden.
//
// **Hier stand „gegen den 108 mit 15 Tagen gedeckelt ist", und das war genau
// die Rechnung, die die Fremdpruefung als `[high]` kassiert hat** — sie stand
// nach der Korrektur noch unveraendert neben den Zeilen, die sie widerlegen
// (Schlusslesung 06.08.2026). Liegt die HERBSTumstellung dazwischen, hat ein
// Tag 25 Stunden und derselbe Fall belegt 15 Tage 00:59; deshalb deckelt 108
// bei 16. Die Zeile darunter fuehrt genau diesen Fall mit.
assert.equal(
  pruefeJagdEntwurf(entwurf({ termin: '2026-11-14T00:00', bis: '2026-11-28T23:59' })),
  null,
)

// **Der schlechteste BERLINER Fall muss unter dem Cron-Deckel aus 108 bleiben.**
// Diese Zusicherung fehlte hier, obwohl das Portal der Schreiber ist, an dem
// der Fall ueberhaupt gemessen wurde — sie lag nur im PWA-Modul
// (Schlusslesung 06.08.2026). Faellt sie, plant das Portal eine Jagd, die der
// Cron nicht mehr verschont und die nach 12 h Funkstille eingesammelt wird.
//
// Gerechnet mit festen Offsets, damit sie in jeder Rechnerzone dasselbe prueft:
// 18.10. 00:00 ist CEST (+02), 01.11. 23:59 ist CET (+01) — dazwischen liegt
// die Rueckstellung, ein Tag hat 25 Stunden.
{
  const CRON_DECKEL_TAGE = 16
  const start = '2026-10-18T00:00'
  const endtag = spaetestesEndeDatum(start)
  assert.equal(endtag, '2026-11-01')
  // Das spaeteste Ende an diesem Tag geht durch die Pruefung...
  assert.equal(pruefeJagdEntwurf(entwurf({ termin: start, bis: `${endtag}T23:59` })), null)
  // ...und belegt dann diese Spanne:
  const spanne =
    new Date('2026-11-01T22:59:00Z').getTime() - new Date('2026-10-17T22:00:00Z').getTime()
  assert.ok(spanne > 15 * 86_400_000, 'Herbstfall muss 15 Tage reissen — sonst ist die Probe stumpf')
  assert.ok(spanne < CRON_DECKEL_TAGE * 86_400_000, 'Herbstfall reisst auch den 16-Tage-Deckel')
}

// Ueber die Zeitumstellung bleibt die Grenze ein Kalendertag — der 25.10. hat
// 25 Stunden, das verschiebt hier nichts mehr (bei der Spannenrechnung schon).
assert.equal(pruefeJagdEntwurf(entwurf({ termin: '2026-10-18T08:00', bis: '2026-11-01T20:00' })), null)
assert.match(
  pruefeJagdEntwurf(entwurf({ termin: '2026-10-18T08:00', bis: '2026-11-02T08:00' })) ?? '',
  /14 Tage/,
)

// --- Datum und Uhrzeit als zwei Felder --------------------------------------

assert.equal(datumTeil('2026-11-14T08:00'), '2026-11-14')
assert.equal(zeitTeil('2026-11-14T08:00'), '08:00')
assert.equal(datumTeil(''), '')
assert.equal(zeitTeil('2026-11-14'), '') // nur Datum, keine Uhrzeit

// Die Voreinstellungen (Moritz, 06.08.2026: 7 Uhr los, 20 Uhr Schluss).
assert.equal(alsTerminwert('2026-11-14', '', STANDARD_BEGINN), '2026-11-14T07:00')
assert.equal(alsTerminwert('2026-11-16', '', STANDARD_ENDE), '2026-11-16T20:00')
// Eine gewaehlte Uhrzeit sticht die Voreinstellung.
assert.equal(alsTerminwert('2026-11-14', '05:30', STANDARD_BEGINN), '2026-11-14T05:30')
// **Ohne Datum ist der GANZE Wert leer** — eine Uhrzeit ohne Tag ist kein
// Termin, und `pruefeJagdEntwurf` soll sie als fehlend sehen, nicht als kaputt.
assert.equal(alsTerminwert('', '07:00', STANDARD_BEGINN), '')
assert.match(
  pruefeJagdEntwurf(entwurf({ termin: alsTerminwert('', '07:00', STANDARD_BEGINN) })) ?? '',
  /Termin/,
)

// --- Der Deckel als Picker-Grenze -------------------------------------------

// `max` muss GENAU dort liegen, wo `pruefeJagdEntwurf` noch durchlaesst — ein
// Picker, der frueher klemmt als der Riegel, macht gueltige Eingaben
// unerreichbar; einer, der spaeter klemmt, laesst eine Blase erscheinen, wo
// eine Meldung stehen sollte.
//
// **Der Deckel zaehlt KALENDERTAGE, und die Endzeit geht nicht mehr ein.**
// Die erste Fassung rechnete die Zeitspanne und klemmte deshalb beim 27.11.,
// obwohl der 28. gemeint war (Moritz, 06.08.2026).
assert.equal(spaetestesEndeDatum('2026-11-14T07:00'), '2026-11-28')

// **Der letzte waehlbare Tag muss mit der VOREINSTELLUNG durchgehen** — sonst
// bietet der Kalender einen Tag an, den die Meldung danach ablehnt. Das ist
// die Zeile, die Picker und Riegel aneinander bindet.
assert.equal(
  pruefeJagdEntwurf(
    entwurf({
      termin: '2026-11-14T07:00',
      bis: alsTerminwert(spaetestesEndeDatum('2026-11-14T07:00'), '', STANDARD_ENDE),
    }),
  ),
  null,
)
// Und auch mit der spaetestmoeglichen Uhrzeit an diesem Tag.
assert.equal(
  pruefeJagdEntwurf(
    entwurf({ termin: '2026-11-14T07:00', bis: alsTerminwert('2026-11-28', '23:59', STANDARD_ENDE) }),
  ),
  null,
)
// Ein Tag mehr muss die Meldung ausloesen — sonst deckelt der Picker zu spaet.
assert.match(
  pruefeJagdEntwurf(entwurf({ termin: '2026-11-14T07:00', bis: '2026-11-29T07:00' })) ?? '',
  /14 Tage/,
)

// Ueber die Zeitumstellung bleibt es ein Kalendertag: vom 18.10. aus der 01.11.
assert.equal(spaetestesEndeDatum('2026-10-18T08:00'), '2026-11-01')
assert.equal(
  pruefeJagdEntwurf(entwurf({ termin: '2026-10-18T08:00', bis: '2026-11-01T20:00' })),
  null,
)

// `tagPlus` selbst, ueber Monats- und Jahresgrenze und ueber beide
// Umstellungen — mittags gerechnet, damit kein Tag verschluckt wird.
assert.equal(tagPlus('2026-11-14', 14), '2026-11-28')
assert.equal(tagPlus('2026-12-28', 14), '2027-01-11')
assert.equal(tagPlus('2026-03-22', 14), '2026-04-05') // Vorstellung dazwischen
assert.equal(tagPlus('2026-10-18', 14), '2026-11-01') // Rueckstellung dazwischen
assert.equal(tagPlus('', 14), '')
assert.equal(tagPlus('kein datum', 14), '')
// **Ein Datum, das es nicht gibt, wird abgelehnt statt normalisiert.**
// `new Date('2026-02-30T12:00:00Z')` wirft nicht, es rutscht auf den 2. Maerz —
// der Deckel laege dann still einen Tag daneben (Fremdpruefung 06.08.2026).
assert.equal(tagPlus('2026-02-30', 14), '')
assert.equal(tagPlus('2026-13-01', 14), '')
assert.equal(spaetestesEndeDatum('2026-02-30T07:00'), '')

// Ohne brauchbaren Start kein Deckel — das Feld bleibt offen, statt auf einem
// Fantasiewert zu klemmen.
assert.equal(spaetestesEndeDatum(''), '')
assert.equal(spaetestesEndeDatum('morgen frueh'), '')

// --- Mehrtaegig: der Vertrag aus 095 ----------------------------------------

// **Nicht `bis > von`.** Das war der erste Entwurf von 095 und ist von der
// Fremdpruefung zerlegt worden: eine Jagd von 08:00 bis 16:00 erfuellt ihn
// auch. Der Vertrag sind verschiedene BERLINER Kalenderdaten.
assert.equal(mehrtaegig('2026-11-14T07:00:00Z', '2026-11-14T15:00:00Z'), false)
assert.equal(mehrtaegig('2026-11-14T07:00:00Z', '2026-11-15T15:00:00Z'), true)

// **Berlin und nicht UTC — und die Zusicherung liegt AUF der Grenze, nicht
// daneben.** Die erste Fassung prueffte `22:30Z` und `23:30Z`; die Berliner
// Tagesgrenze liegt im November aber exakt bei `23:00:00Z` (CET, +01:00). Eine
// halbe Stunde Luft auf beiden Seiten — jede Verschiebung darin waere
// durchgerutscht. **Das ist zum DRITTEN Mal dieselbe Falle** (03.08.: `23:30Z`
// neben `22:00Z`; 04.08.: `1990` neben `1997`), und zum dritten Mal hat sie
// der Pruefer gefunden, nicht der Test. Nachgemessen am 06.08.2026:
// `22:59:59.999Z` -> `2026-11-14T23:59`, `23:00:00.000Z` -> `2026-11-15T00:00`.
assert.equal(mehrtaegig('2026-11-14T07:00:00Z', '2026-11-14T22:59:59.999Z'), false)
assert.equal(mehrtaegig('2026-11-14T07:00:00Z', '2026-11-14T23:00:00.000Z'), true)

// Fehlende Werte sind „nicht mehrtaegig", kein Fehler.
assert.equal(mehrtaegig(null, '2026-11-15T15:00:00Z'), false)
assert.equal(mehrtaegig('2026-11-14T07:00:00Z', null), false)
assert.equal(mehrtaegig('kein datum', 'auch nicht'), false)

// **Der Fall, den die erste Fassung nicht sah: NUR EINER kaputt.** Hier stand
// nur „beide kaputt", und das war die Luecke — `'2026-11-15' > ''` ergab
// `true`, eine Zeile mit unlesbarem Start galt als mehrtaegig, und der
// Kommentar der Funktion behauptete das Gegenteil. Ein Test, der die bequeme
// Haelfte prueft, beschreibt statt zu fordern (Fremdpruefung 06.08.2026).
assert.equal(mehrtaegig('kein datum', '2026-11-15T15:00:00Z'), false)
assert.equal(mehrtaegig('2026-11-14T07:00:00Z', 'kein datum'), false)

// --- Zeitraum als Text ------------------------------------------------------

// Eintaegig: nur der Termin, kein Bindestrich. **Sollwert als Literal**, nicht
// ueber `terminText` gebaut — sonst prueft die Erwartung mit derselben
// Funktion, die `zeitraumText` selbst aufruft (Schlusslesung 06.08.2026).
assert.equal(
  zeitraumText(jagd({ scheduled_for: '2026-11-14T07:00:00Z', scheduled_until: '2026-11-14T22:59:59Z' })),
  '14.11.2026, 08:00',
)

// **Die Zeile, die die Aenderung an `zeitraumText` ueberhaupt erst prueft.**
// Ohne sie bliebe ein Revert auf `mehrtaegig(termin(jagd), …)` gruen, weil in
// allen anderen Faellen `scheduled_for` gesetzt ist und `termin()` denselben
// Wert liefert (Schlusslesung 06.08.2026, Punkt 6ii).
//
// Eine Zeile OHNE geplanten Termin, aber mit Endtermin: `termin()` faellt auf
// `started_at` zurueck. Zusammen mit dem Ende ergaebe das einen Zeitraum, den
// nie jemand geplant hat — 095 definiert mehrtaegig ausschliesslich aus
// `scheduled_for` und `scheduled_until`.
assert.equal(
  zeitraumText(
    jagd({
      scheduled_for: null,
      started_at: '2026-11-14T07:00:00Z',
      scheduled_until: '2026-11-16T22:59:59Z',
    }),
  ),
  '14.11.2026, 08:00',
)

// Mehrtaegig: Zeitraum, und das Ende OHNE Uhrzeit. `scheduled_until` ist der
// letzte TAG, nicht die Feierabendzeit — „08:00 – 23:59" behauptete eine
// Tagesplanung, die es nicht gibt (die waere `end_time` aus Migration 003).
assert.equal(
  zeitraumText(jagd({ scheduled_for: '2026-11-14T07:00:00Z', scheduled_until: '2026-11-16T22:59:59Z' })),
  '14.11.2026, 08:00 – 16.11.2026',
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

// --- Aenderungen am Ende ----------------------------------------------------

{
  const alsEntwurf = (bis: string) =>
    entwurf({ termin: alsEingabewert('2026-11-14T07:00:00+00:00'), bis })

  // Ein neues Ende kommt einzeln. **Der Sollwert steht als Literal da, nicht
  // als `alsZeitstempel(...)`-Aufruf** — sonst baute die Erwartung ihren Wert
  // mit derselben Funktion, die sie prueft, und koennte nur fehlschlagen, wenn
  // `jagdAenderungen` das Feld gar nicht schreibt (Fremdpruefung 06.08.2026;
  // dieselbe Krankheit wie beim Sortiertest am 04.08.). November ist CET,
  // 23:59 Ortszeit sind also 22:59Z.
  assert.deepEqual(jagdAenderungen(alsEntwurf('2026-11-16T23:59'), bestand()), {
    scheduled_until: '2026-11-16T22:59:00.000Z',
  })

  // Unveraendert heisst nichts schreiben — auch hier ueber den Zeitpunkt
  // verglichen, nicht ueber die Zeichenkette (`+00:00` gegen `.000Z`).
  assert.equal(
    jagdAenderungen(
      alsEntwurf(alsEingabewert('2026-11-16T22:59:00+00:00')),
      bestand({ scheduled_until: '2026-11-16T22:59:00.000Z' }),
    ),
    null,
  )

  // **Geleert schreibt `null`, nicht das Tagesende.** Der Trigger aus 107 setzt
  // es wieder — die Rechnung hier zu wiederholen waere die dritte Kopie,
  // gegen die die Migration gebaut wurde.
  assert.deepEqual(
    jagdAenderungen(alsEntwurf(''), bestand({ scheduled_until: '2026-11-16T22:59:00.000Z' })),
    { scheduled_until: null },
  )

  // **Der Fall, der den stillen Datenverlust festhaelt** (Schlusslesung
  // 06.08.2026). Ein vom Trigger gesetztes Ende traegt MIKROsekunden, ein
  // nativ geplanter Start SEKUNDEN — `alsEingabewert` kuerzt beide auf
  // Minuten. Mit dem alten Zeitpunktvergleich meldete „oeffnen, nichts
  // aendern, speichern" deshalb eine Aenderung und schrieb den Wert gekuerzt
  // zurueck: −59,999 s am Ende, −11,698 s am Start. Beide Zeilen muessen
  // `null` liefern, also NICHTS schreiben.
  assert.equal(
    jagdAenderungen(
      entwurf({
        termin: alsEingabewert('2026-11-14T07:00:11.698+00:00'),
        bis: alsEingabewert('2026-11-14T22:59:59.999999+00:00'),
      }),
      bestand({
        scheduled_for: '2026-11-14T07:00:11.698+00:00',
        scheduled_until: '2026-11-14T22:59:59.999999+00:00',
      }),
    ),
    null,
  )
}

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

// --- Jahr aus der Adresse ----------------------------------------------------

// Ohne diese Schranke wird ein unbekanntes Jahr zu einer Luege: es filtert
// alles heraus, das Auswahlfeld zeigt mangels passender <option> aber "Alle" —
// leere Liste, Zaehler auf null, kein erkennbarer Filter (Fremdpruefung
// 03.08.2026). Betrifft nicht nur getippte Adressen: ein gemerkter Link auf
// ?jahr=2025 verhaelt sich genauso, sobald dort die letzte Jagd verschwunden ist.
{
  const bestand = [
    jagd({ id: 'a', scheduled_for: '2026-05-01T08:00:00Z' }), // Jagdjahr 2026
    jagd({ id: 'b', scheduled_for: '2027-06-01T08:00:00Z' }), // Jagdjahr 2027
  ]
  // **`heute` wird ueberall eingespeist**, seit `jagdjahre()` das aktuelle Jahr
  // mitfuehrt: ohne die Angabe waeren diese Zusicherungen zeitabhaengig und
  // wuerden irgendwann aus einem Grund gruen bleiben, der nichts mit der Regel
  // zu tun hat. Hier ist "heute" der 04.08.2026, also Jagdjahr 2026.
  const H = '2026-08-04T10:00:00Z'
  assert.equal(alsJahr('2026', bestand, H), '2026')
  assert.equal(alsJahr('2027', bestand, H), '2027')
  assert.equal(alsJahr(ALLE_JAHRE, bestand, H), ALLE_JAHRE)
  // **Ein leeres Jahr INNERHALB des Zeitraums ist jetzt gueltig, nicht mehr
  // "Alle"** — das ist die Aenderung vom 04.08.2026 abends, an ihrer schaerfsten
  // Stelle. Bis dahin fiel 2024 hier zurueck, weil es im Bestand fehlte.
  assert.equal(alsJahr('2024', bestand, H), '2024')
  // **Die Schranke greift weiter, nur an anderer Stelle — und die Zusicherung
  // liegt AUF der Grenze, nicht daneben.** Ein erster Anlauf pruefte 1990 gegen
  // eine Untergrenze bei 1997 und haette jede Verschiebung um sechs Jahre
  // durchgelassen (Codex 04.08.2026, Punkt 10; dieselbe Falle wie beim
  // Aprilgrenzen-Test am 03.08.).
  assert.equal(alsJahr('1997', bestand, H), '1997', 'Positivkontrolle: genau die Untergrenze')
  assert.equal(alsJahr('1996', bestand, H), ALLE_JAHRE, 'ein Jahr darunter faellt zurueck')
  // …und nach vorn — der Zeitraum reicht zurueck, nicht voraus.
  assert.equal(alsJahr('2028', bestand, H), ALLE_JAHRE, 'ein Jahr ueber dem Bestand')
  assert.equal(alsJahr('quatsch', bestand, H), ALLE_JAHRE)
  // **Leerer Bestand: der ganze Zeitraum bleibt waehlbar** (jedes Jahr steht im
  // Menue und liefert eine leere Liste), alles davor und danach faellt zurueck.
  assert.equal(alsJahr('2026', [], H), '2026')
  assert.equal(alsJahr('2010', [], H), '2010', 'leeres Jahr im Zeitraum, leerer Bestand')
  assert.equal(alsJahr('2027', [], H), ALLE_JAHRE, 'die Zukunft bleibt draussen')

  // --- Voreinstellung: das AKTUELLE Jagdjahr (Moritz, 04.08.2026) ---
  // `heute` wird eingespeist, weil eine Zusicherung gegen `new Date()` nur an
  // dem Tag gilt, an dem man sie schreibt.
  assert.equal(alsJahr(undefined, bestand, H), '2026')
  assert.equal(alsJahr('', bestand, H), '2026')
  assert.equal(alsJahr(undefined, bestand, '2027-06-01T10:00:00Z'), '2027')
  // **"immer" heisst woertlich immer** (Moritz auf Rueckfrage, 04.08.2026): auch
  // wenn in der Saison nichts liegt. Ein erster Entwurf fiel hier auf "Alle"
  // zurueck, um eine leere Liste zu vermeiden — verworfen.
  assert.equal(alsJahr(undefined, bestand, '2025-06-01T10:00:00Z'), '2025')
  assert.equal(alsJahr(undefined, [], H), '2026')
  // Und die Vorauswahl steht immer im Menue — sonst zeigte das Feld einen
  // anderen Wert als den, nach dem gefiltert wird.
  for (const h of ['2025-06-01T10:00:00Z', '2026-08-04T10:00:00Z', '2030-01-01T10:00:00Z']) {
    const vorwahl = alsJahr(undefined, bestand, h)
    assert.ok(
      jagdjahre(bestand, h).includes(vorwahl),
      `${h}: Vorwahl ${vorwahl} fehlt im Menue`,
    )
  }
  // Ein ausdrueckliches "Alle" schlaegt die Voreinstellung — sonst waere der
  // Klick darauf wirkungslos.
  assert.equal(alsJahr(ALLE_JAHRE, bestand, H), ALLE_JAHRE)
  // Ein Jahr AUSSERHALB des Zeitraums geht NICHT auf das aktuelle: der Nutzer
  // wollte ausdruecklich ein anderes. Wieder direkt an der Grenze gemessen.
  assert.equal(alsJahr('1996', bestand, H), ALLE_JAHRE)
}

// --- aktuellesJagdjahr: die Aprilgrenze, in Berliner Zeit -------------------
// Dieselbe Regel wie jede Jagd (JAGDJAHR_BEGINN_MONAT = 4), nicht eine zweite.
assert.equal(aktuellesJagdjahr('2026-08-04T10:00:00Z'), '2026')
assert.equal(aktuellesJagdjahr('2026-04-01T10:00:00Z'), '2026', 'der 1. April gehoert ins neue')
assert.equal(aktuellesJagdjahr('2026-03-31T10:00:00Z'), '2025', 'der 31. Maerz noch ins alte')
assert.equal(aktuellesJagdjahr('2027-01-15T10:00:00Z'), '2026', 'Januar zaehlt zum Vorjahr')
// **Die Zeitzone entscheidet an der Grenze, und zwar auf die Minute.**
// 2026 gilt am 31. Maerz schon Sommerzeit (UTC+2), die Jagdjahr-Grenze liegt
// also bei 2026-03-31T22:00:00Z — nicht bei Mitternacht UTC. Eine Zusicherung
// bei 23:30Z liegt dahinter und beweist die Grenze nicht (Fremdpruefung
// 04.08.2026, Befunde 2 und 6: "der Test liegt nicht direkt an der Grenze").
assert.equal(aktuellesJagdjahr('2026-03-31T21:59:00Z'), '2025', 'eine Minute davor')
assert.equal(aktuellesJagdjahr('2026-03-31T22:00:00Z'), '2026', 'genau auf der Grenze')
assert.equal(aktuellesJagdjahr('2026-03-31T23:30:00Z'), '2026', 'dahinter')
// Gegenkontrolle in der WINTERZEIT: dort ist Berlin UTC+1, eine Grenze am
// 1. April gibt es dann nicht — aber der Jahreswechsel im Januar muss halten.
assert.equal(aktuellesJagdjahr('2027-01-01T00:30:00Z'), '2026', 'Neujahr zaehlt zum Vorjahr')
assert.equal(aktuellesJagdjahr('2026-12-31T23:30:00Z'), '2026')
// Unbrauchbare Eingabe: kein Absturz, kein erfundenes Jahr.
assert.equal(aktuellesJagdjahr('quatsch'), ALLE_JAHRE)
assert.equal(aktuellesJagdjahr(''), ALLE_JAHRE)

// --- Einladen: Konten UND Gaeste ohne Konto ---------------------------------

const P = (id: string, name: string) => ({ id, display_name: name })
const K = (id: string, vorname: string, nachname: string, kategorien: string[] = []) => ({
  id,
  vorname,
  nachname,
  kategorien,
})
const T = (teil: Partial<{ user_id: string | null; guest_name: string | null; status: string | null }>) => ({
  user_id: null,
  guest_name: null,
  status: 'invited',
  ...teil,
})

// kontaktName: die TEILNEHMER-Schreibweise, nicht die Adressbuch-Sortierung.
// Der Wert landet als guest_name in der DB und steht danach auf jeder Liste.
assert.equal(kontaktName({ vorname: 'Ferdinand', nachname: 'v. Alvensleben' }), 'Ferdinand v. Alvensleben')
assert.equal(kontaktName({ vorname: null, nachname: 'Ahlwes' }), 'Ahlwes')
assert.equal(kontaktName({ vorname: 'Ian', nachname: null }), 'Ian')
// Der Check-Constraint verhindert das — die Ansicht darf sich nicht drauf verlassen.
assert.equal(kontaktName({ vorname: null, nachname: null }), '(ohne Namen)')
assert.equal(kontaktName({ vorname: '  ', nachname: ' Ahlwes ' }), 'Ahlwes')

assert.equal(namensschluessel('  Henner   Ahlwes '), 'henner ahlwes')
assert.equal(namensschluessel('HENNER AHLWES'), namensschluessel('Henner Ahlwes'))

// --- kandidaten ---
const profile = [P('u1', 'Moritz'), P('u2', 'Heinrich'), P('u3', 'Jobst')]
const buch = [
  K('k1', 'Henner', 'Ahlwes', ['schuetze']),
  K('k2', 'Ferdinand', 'v. Alvensleben', ['schuetze', 'jaegerei']),
  K('k3', 'Anna', 'Beck', ['treiber']),
  K('k4', 'Ohne', 'Kategorie'),
]
const kontoNamen = { u1: 'Moritz', u2: 'Heinrich', u3: 'Jobst' }

// Der Ersteller (u1) faellt raus — er steht als Jagdleiter schon drin.
const frisch = kandidaten(profile, buch, [T({ user_id: 'u1', status: 'joined' })], 'u1', kontoNamen)
assert.deepEqual(
  frisch.map((k) => k.name),
  ['Heinrich', 'Jobst', 'Henner Ahlwes', 'Ferdinand v. Alvensleben', 'Anna Beck', 'Ohne Kategorie'],
  'Konten zuerst, dann das Adressbuch',
)
assert.equal(frisch[0].schluessel, KONTO_SCHLUESSEL + 'u2')
assert.equal(frisch[2].schluessel, KONTAKT_SCHLUESSEL + 'k1')

// Wer schon eine Zeile hat, steht nicht mehr zur Wahl.
const mitHeinrich = kandidaten(
  profile,
  buch,
  [T({ user_id: 'u1', status: 'joined' }), T({ user_id: 'u2', status: 'invited' })],
  'u1',
  kontoNamen,
)
assert.equal(mitHeinrich.some((k) => k.userId === 'u2'), false, 'schon eingeladen')

// **Der Dublettenschutz fuer Gaeste haengt am Namen** (kein kontakt_id, s. dort).
// Ein bereits eingetragener Gast darf nicht ein zweites Mal angeboten werden.
const mitGast = kandidaten(
  profile,
  buch,
  [T({ user_id: 'u1', status: 'joined' }), T({ guest_name: 'Henner Ahlwes', status: 'invited' })],
  'u1',
  kontoNamen,
)
assert.equal(mitGast.some((k) => k.name === 'Henner Ahlwes'), false, 'Gast schon dabei')
assert.equal(mitGast.some((k) => k.name === 'Anna Beck'), true, 'die anderen bleiben')
// Und er greift auch, wenn die Schreibweise abweicht — sonst genuegte ein
// Leerzeichen fuer eine zweite Zeile derselben Person.
const schiefGeschrieben = kandidaten(
  profile,
  buch,
  [T({ user_id: 'u1', status: 'joined' }), T({ guest_name: '  henner   ahlwes  ' })],
  'u1',
  kontoNamen,
)
assert.equal(schiefGeschrieben.some((k) => k.name === 'Henner Ahlwes'), false)

// Abgesagte Konten kommen als „erneut" zurueck (UPDATE statt INSERT, Migration 088).
const mitAbsage = kandidaten(
  profile,
  buch,
  [T({ user_id: 'u1', status: 'joined' }), T({ user_id: 'u2', status: 'declined' })],
  'u1',
  kontoNamen,
)
const wieder = mitAbsage.find((k) => k.userId === 'u2')
assert.equal(wieder?.erneut, true, 'abgesagt heisst wieder einladbar')
// **Genau EINMAL, nicht zweimal.** Er hat eine Zeile, faellt also aus dem
// ersten Zweig — und kommt ueber den Absage-Zweig zurueck. Stuende er in
// beiden, waeren es zwei Kaestchen fuer eine Person.
assert.equal(mitAbsage.filter((k) => k.userId === 'u2').length, 1)
// `left` ist NICHT wieder einladbar (nur `declined` ist es, s. wiederEinladbar).
const ausgetreten = kandidaten(
  profile,
  buch,
  [T({ user_id: 'u1', status: 'joined' }), T({ user_id: 'u2', status: 'left' })],
  'u1',
  kontoNamen,
)
assert.equal(ausgetreten.some((k) => k.userId === 'u2'), false)

// --- Filter ---
const leer = new Set<string>()

const sicht = (f: string, g: ReadonlySet<string> = leer) =>
  sichtbareKandidaten(frisch, f as never, '', g, suchtext).map((k) => k.name)

// **Moritz' Anforderung, woertlich: „wenn ich schuetzen einlade will ich die
// treiber da nicht sehen."**
assert.deepEqual(sicht('schuetze'), ['Henner Ahlwes', 'Ferdinand v. Alvensleben'])
assert.deepEqual(sicht('treiber'), ['Anna Beck'])
// Mehrfach kategorisiert heisst: in JEDEM passenden Filter, aber nie doppelt
// in derselben Ansicht.
assert.deepEqual(sicht('jaegerei'), ['Ferdinand v. Alvensleben'])
assert.deepEqual(sicht('schweisshundfuehrer'), [])
// Konten haben keine Kategorien — sie gehoeren in ihren eigenen Filter und
// NICHT unter „Ohne Kategorie": „hat die App" und „ist nicht eingeordnet" sind
// zwei verschiedene Zustaende.
assert.deepEqual(sicht('konten'), ['Heinrich', 'Jobst'])
assert.deepEqual(sicht('ohne'), ['Ohne Kategorie'])
assert.equal(sicht('alle').length, 6)

// --- Die Auswahl ueberlebt den Filterwechsel — und der Filter „Ausgewaehlt"
// ist der Riegel dagegen, dass man dabei jemanden uebersieht. ---
const gewaehlt = new Set([KONTAKT_SCHLUESSEL + 'k1', KONTAKT_SCHLUESSEL + 'k3'])
assert.deepEqual(sicht('gewaehlt', gewaehlt), ['Henner Ahlwes', 'Anna Beck'])
// Der Schuetzen-Filter zeigt Anna nicht — obwohl sie ausgewaehlt IST. Genau
// dieser Fall ist der Grund fuer den Zaehler am Knopf.
assert.deepEqual(sicht('schuetze', gewaehlt), ['Henner Ahlwes', 'Ferdinand v. Alvensleben'])

// --- Suche: wirkt INNERHALB des Filters, hebt ihn nicht auf ---
const suche = (f: string, q: string) =>
  sichtbareKandidaten(frisch, f as never, q, leer, suchtext).map((k) => k.name)
assert.deepEqual(suche('alle', 'ahlwes'), ['Henner Ahlwes'])
assert.deepEqual(suche('treiber', 'ahlwes'), [], 'die Suche darf den Filter nicht aufheben')
assert.deepEqual(suche('alle', 'ALHWES'), [], 'kein Fuzzy — getippt ist getippt')
assert.deepEqual(suche('alle', 'AHLWES'), ['Henner Ahlwes'], 'Grossschreibung egal')
assert.deepEqual(suche('alle', '  '), sicht('alle'), 'nur Leerraum sucht nicht')

// --- filterZaehler: die Zahlen am Schalter ---
const zahlen = filterZaehler(frisch, gewaehlt)
assert.equal(zahlen.alle, 6)
assert.equal(zahlen.schuetze, 2)
assert.equal(zahlen.treiber, 1)
assert.equal(zahlen.schweisshundfuehrer, 0, 'null heisst: niemand eingeordnet, nicht: niemand da')
assert.equal(zahlen.konten, 2)
assert.equal(zahlen.ohne, 1)
assert.equal(zahlen.gewaehlt, 2)
// Jeder Filter hat eine Zahl — sonst stuende an einem Schalter nichts und der
// Leser hielte ihn fuer kaputt.
for (const f of EINLADE_FILTER) {
  assert.equal(typeof zahlen[f.wert], 'number', `${f.wert} ohne Zahl`)
}
// imFilter und filterZaehler muessen dasselbe sagen — sonst zaehlt der Schalter
// etwas anderes, als die Liste darunter zeigt.
for (const f of EINLADE_FILTER) {
  assert.equal(
    zahlen[f.wert],
    frisch.filter((k) => imFilter(k, f.wert, gewaehlt)).length,
    `Zaehler und Liste weichen bei ${f.wert} ab`,
  )
}

// **Jede Kategorie aus 094 braucht einen Filter.** `EINLADE_FILTER` fuehrt die
// vier Werte ein zweites Mal (mit Plural-Beschriftung, absichtlich — „Schuetzen"
// liest sich als Gruppe, „Schuetze" als Eigenschaft). Bekommt das Enum einen
// fuenften Wert, faellt er sonst lautlos aus dem Einladen heraus: die Kontakte
// traegen ihn, und kein Schalter zeigt sie.
// (Ponytail-Lesung 03.08.2026 — zwei Listen, kein Riegel dazwischen.)
for (const kat of KATEGORIEN) {
  assert.equal(
    EINLADE_FILTER.some((f) => f.wert === kat.wert),
    true,
    `Kategorie ${kat.wert} hat keinen Einlade-Filter`,
  )
}

// --- Fixes auf die Fremdpruefung vom 03.08.2026 -----------------------------

// **B10: ein Kontakt ohne Namen wird nicht angeboten.** Der Name landet als
// `guest_name` dauerhaft in der DB und ist danach in keiner Oberflaeche mehr
// aenderbar — „(ohne Namen)" waere Datenmuell, den man nur durch Entfernen und
// Neu-Einladen loswird. Der Check-Constraint macht den Fall heute unerreichbar
// (0 von 154); die Ansicht darf sich darauf nicht verlassen.
assert.equal(kontaktName({ vorname: null, nachname: null }), OHNE_NAMEN)
const mitNamenlosem = kandidaten(
  [],
  [K('leer', '', ''), K('gut', 'Henner', 'Ahlwes')],
  [],
  'u1',
  {},
)
assert.deepEqual(mitNamenlosem.map((k) => k.name), ['Henner Ahlwes'])
// Nur ein Nachname genuegt — das ist KEIN namenloser Kontakt.
assert.deepEqual(
  kandidaten([], [K('nur', '', 'Ahlwes')], [], 'u1', {}).map((k) => k.name),
  ['Ahlwes'],
)

// **B1, Grenze 1: zwei Kontakte mit identischem Namen.** Beide stehen zur Wahl
// (verschiedene Schluessel) — der Dublettenschutz greift erst, wenn einer
// EINGELADEN ist, und nimmt dann auch den anderen weg. Im Bestand gibt es
// 0 solche Paare (gemessen 03.08.2026); der Test haelt das Verhalten fest,
// damit ein kuenftiger Umbau auf `kontakt_id` sieht, was er repariert.
const zwillinge = [K('a', 'Hans', 'Meyer'), K('b', 'Hans', 'Meyer')]
assert.equal(kandidaten([], zwillinge, [], 'u1', {}).length, 2, 'beide zur Wahl')
assert.equal(
  kandidaten([], zwillinge, [T({ guest_name: 'Hans Meyer' })], 'u1', {}).length,
  0,
  'einer eingeladen nimmt beide weg — bekannte Grenze, laut statt still',
)

// **B2, Grenze 2: geaenderte Schreibweise.** Satzzeichen normalisiert
// `namensschluessel()` NICHT — „Hans-Peter" und „Hans Peter" sind zwei.
assert.notEqual(namensschluessel('Hans-Peter Meyer'), namensschluessel('Hans Peter Meyer'))
assert.equal(
  kandidaten([], [K('c', 'Hans-Peter', 'Meyer')], [T({ guest_name: 'Hans Peter Meyer' })], 'u1', {}).length,
  1,
  'andere Schreibweise wird erneut angeboten — bekannte Grenze',
)

// --- Fixes auf die Schlusslesung vom 03.08.2026 -----------------------------

// **Der Leer-Text darf nicht luegen.** „In dieser Kategorie ist niemand
// eingeordnet" stand auch unter „Mit Konto" (dort gibt es keine Kategorie) und
// unter „Ohne Kategorie" — wo leer das GEGENTEIL bedeutet, naemlich dass alle
// eingeordnet sind.
assert.match(leerText('konten', ''), /Konto/)
assert.doesNotMatch(leerText('konten', ''), /Kategorie/, 'Konten haben keine Kategorie')
assert.match(leerText('treiber', ''), /Treiber/, 'der Filter wird beim Namen genannt')
assert.match(leerText('ohne', ''), /ohne Kategorie/)
// **Kein Text behauptet eine URSACHE** (Delta-Durchgang 03.08.2026, D4). Die
// Liste zeigt nur Nicht-Eingeladene: „keine Schuetzen zur Wahl" kann heissen,
// dass niemand so eingeordnet ist ODER dass alle schon eingeladen sind. Von
// hier aus ist das nicht zu unterscheiden, also wird es auch nicht behauptet.
for (const f of ['treiber', 'ohne', 'schuetze'] as const) {
  assert.match(leerText(f, ''), /oder alle sind schon eingeladen/, `${f} behauptet eine Ursache`)
}
assert.match(leerText('gewaehlt', ''), /ausgewählt/)
assert.match(leerText('alle', ''), /Niemand steht mehr zur Wahl/)
// Die Suche schlaegt jeden Filter — sonst stuende „niemand eingeordnet" da,
// obwohl nur der Suchtext nicht passt.
for (const f of EINLADE_FILTER) {
  assert.match(leerText(f.wert, 'xyz'), /diesem Namen/, `Suche schlaegt ${f.wert} nicht`)
}
// Jeder Filter hat einen Text — ein leerer waere eine leere Flaeche.
for (const f of EINLADE_FILTER) {
  assert.equal(leerText(f.wert, '').length > 0, true, `${f.wert} ohne Text`)
}

// **gastZustand: der Zeitstempel gehoert zum Zustand.** Eine Zeile auf
// `invited` mit einem Absagedatum daneben behauptet zwei Dinge gleichzeitig —
// dieselbe Falle wie im Wiedereinladen-Zweig.
const zu = gastZustand('joined')
assert.equal(zu.status, 'joined')
assert.equal(typeof zu.joined_at, 'string')
assert.equal(zu.left_at, null, 'zugesagt heisst kein Absagedatum')

const ab = gastZustand('declined')
assert.equal(ab.status, 'declined')
assert.equal(typeof ab.left_at, 'string')
assert.equal(ab.joined_at, null, 'abgesagt heisst kein Zusagedatum')

// Zurueck auf „eingeladen" raeumt BEIDE Stempel ab — sonst bliebe der alte
// stehen und die Zeile saehe aus wie eine Antwort, die es nicht mehr gibt.
const zurueck = gastZustand('invited')
assert.equal(zurueck.status, 'invited')
assert.equal(zurueck.joined_at, null)
assert.equal(zurueck.left_at, null)

// Ein unbekannter Wert faellt auf `invited` zurueck statt in die DB zu laufen
// (dort waere es `22P02` als roher Postgres-Text im Gesicht des Nutzers).
assert.equal(gastZustand('quatsch').status, 'invited')
assert.equal(gastZustand('left').status, 'invited', 'left ist kein setzbarer Zustand')
// Jeder angebotene Zustand kommt auch heil zurueck — sonst zeigte das
// Auswahlfeld einen Wert, den der Patch dann austauscht.
for (const z of GAST_ZUSTAENDE) {
  assert.equal(gastZustand(z).status, z, `${z} kommt nicht heil durch`)
}

// --- Rolle beim Einladen (Moritz' Freigabe 03.08.2026 auf Codex B12) --------

const kand = (kategorien: string[] = [], userId: string | null = null): Kandidat => ({
  schluessel: 'kontakt:x',
  name: 'Test',
  userId,
  kategorien,
  erneut: false,
})

// **Der Filter schlaegt die Kategorie.** Wer ausdruecklich unter „Treiber"
// auswaehlt, meint einen Treiber — auch wenn dieselbe Person zusaetzlich
// Schuetze ist. Das ist der Sinn des Durchgangs „erst alle Schuetzen, dann alle
// Treiber": die Auswahl sagt etwas, und das darf die Stammdaten uebersteuern.
assert.equal(rolleBeimEinladen(kand(['schuetze']), 'treiber'), 'treiber')
assert.equal(rolleBeimEinladen(kand(['schuetze', 'treiber']), 'treiber'), 'treiber')
assert.equal(rolleBeimEinladen(kand([]), 'treiber'), 'treiber')

// Ohne Rollen-Filter entscheidet die Kategorie — und `schuetze` schlaegt
// `treiber`: wer beides ist, ist an der Jagd ein Schuetze. Die teurere
// Berechtigung ist der Rueckfall, nicht die billigere.
assert.equal(rolleBeimEinladen(kand(['schuetze', 'treiber']), 'alle'), 'schuetze')
assert.equal(rolleBeimEinladen(kand(['treiber']), 'alle'), 'treiber')
assert.equal(rolleBeimEinladen(kand(['schuetze']), 'alle'), 'schuetze')
assert.equal(rolleBeimEinladen(kand([]), 'alle'), 'schuetze', 'ohne Kategorie: Schuetze')

// `jaegerei` und `schweisshundfuehrer` haben KEINE Rolle (094 begruendet das
// ausfuehrlich: als Rolle zoege der Schweisshundfuehrer die Streckenmaskierung
// nach sich, die nicht gebaut ist).
assert.equal(rolleBeimEinladen(kand(['jaegerei']), 'jaegerei'), 'schuetze')
assert.equal(rolleBeimEinladen(kand(['schweisshundfuehrer']), 'schweisshundfuehrer'), 'schuetze')
// Ein Schweisshundfuehrer, der auch Treiber ist, wird unter seinem eigenen
// Filter zum Treiber — die Kategorie traegt, wenn der Filter nichts sagt.
assert.equal(rolleBeimEinladen(kand(['schweisshundfuehrer', 'treiber']), 'schweisshundfuehrer'), 'treiber')

// Konten haben keine Kategorien — fuer sie entscheidet allein der Filter.
assert.equal(rolleBeimEinladen(kand([], 'u1'), 'treiber'), 'treiber')
assert.equal(rolleBeimEinladen(kand([], 'u1'), 'konten'), 'schuetze')

// **`jagdleiter` kommt hier nie heraus** — die Leitung wird nicht beim Einladen
// vergeben, und das Portal kann sie ueberhaupt nicht setzen.
for (const f of EINLADE_FILTER) {
  for (const kats of [[], ['schuetze'], ['treiber'], ['schuetze', 'treiber'], ['jaegerei']]) {
    const r = rolleBeimEinladen(kand(kats), f.wert)
    assert.equal(
      (SETZBARE_ROLLEN as readonly string[]).includes(r),
      true,
      `${f.wert}/${kats.join('+')} ergab ${r}`,
    )
  }
}

// --- rollenVerteilung: die Ableitung wird gezeigt, nicht still angewandt ----
assert.equal(rollenVerteilung(['schuetze', 'treiber']), 'Schütze 1 · Treiber 1')
assert.equal(rollenVerteilung(['schuetze', 'schuetze', 'treiber']), 'Schütze 2 · Treiber 1')
// Eine einzige Rolle braucht keine Aufschluesselung — „12 einladen (12 Schuetze)"
// waere Laerm. Erst die Mischung ist die Auskunft.
assert.equal(rollenVerteilung(['schuetze', 'schuetze']), '')
assert.equal(rollenVerteilung(['treiber']), '')
assert.equal(rollenVerteilung([]), '')

// --- Fixes auf den Delta-Durchgang vom 03.08.2026 ---------------------------

// **R3: die Sammelauswahl darf keine festgehaltene Rolle ueberschreiben.**
// Der Ablauf, um den es geht: „Schuetzen" filtern, alle auswaehlen, dann zu
// „Treiber" wechseln und dort alle auswaehlen. Wer BEIDE Kategorien traegt,
// steht dann schon als Schuetze in der Auswahl — und muss es bleiben, sonst ist
// „beim Anhaken festgehalten" eine Luege.
//
// Der Test bildet die Schleife aus `alleSichtbaren()` nach; die Funktion selbst
// haengt an React-State und ist von hier nicht aufrufbar.
{
  const beides = kand(['schuetze', 'treiber'])
  const wahl = new Map<string, string>()
  // Durchgang 1: Filter „Schuetzen"
  if (!wahl.has(beides.schluessel)) wahl.set(beides.schluessel, rolleBeimEinladen(beides, 'schuetze'))
  assert.equal(wahl.get(beides.schluessel), 'schuetze')
  // Durchgang 2: Filter „Treiber" — dieselbe Person ist wieder sichtbar
  if (!wahl.has(beides.schluessel)) wahl.set(beides.schluessel, rolleBeimEinladen(beides, 'treiber'))
  assert.equal(wahl.get(beides.schluessel), 'schuetze', 'die erste Wahl gilt')
  // Die Gegenprobe: OHNE den Riegel waere daraus ein Treiber geworden — genau
  // der Befund. (Kein `if`, so wie es vorher stand.)
  const ohneRiegel = new Map<string, string>([[beides.schluessel, 'schuetze']])
  ohneRiegel.set(beides.schluessel, rolleBeimEinladen(beides, 'treiber'))
  assert.equal(ohneRiegel.get(beides.schluessel), 'treiber', 'so sah der Fehler aus')
}

// **R7: die Verteilung zaehlt nur, was wirklich eine Rolle bekommt.**
// Ein wieder eingeladener Abgesagter laeuft ueber ein UPDATE, das `role` NICHT
// anfasst. Zaehlte er mit, verspraeche der Text neben dem Knopf eine
// Einordnung, die nie geschrieben wird.
{
  const neu = kand(['treiber'])
  const abgesagt: Kandidat = { ...kand(['schuetze'], 'u9'), schluessel: 'konto:u9', erneut: true }
  const alle = [neu, abgesagt]
  const wahl = new Map<string, SetzbareRolle>([
    [neu.schluessel, 'treiber'],
    [abgesagt.schluessel, 'schuetze'],
  ])
  // So rechnet die Komponente (s. `verteilung` in detail.tsx).
  const nurNeue = [...wahl.entries()]
    .filter(([sch]) => !alle.find((k) => k.schluessel === sch)?.erneut)
    .map(([, r]) => r)
  assert.deepEqual(nurNeue, ['treiber'], 'der Wieder-Eingeladene faellt raus')
  assert.equal(rollenVerteilung(nurNeue), '', 'eine einzige Rolle braucht keine Aufschluesselung')
  // Ohne den Filter waere es „Schuetze 1 · Treiber 1" gewesen — eine Zahl, die
  // eine Einordnung des Abgesagten behauptet, die das UPDATE nie schreibt.
  assert.equal(rollenVerteilung([...wahl.values()]), 'Schütze 1 · Treiber 1', 'so sah der Fehler aus')
}
