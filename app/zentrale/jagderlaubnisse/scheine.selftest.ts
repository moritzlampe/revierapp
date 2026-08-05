// Gegenprobe fuer die Begehungsschein-Regeln. Dieses Repo hat keinen
// Test-Runner, deshalb ein eigenstaendiges Skript statt eines Frameworks
// (gleiches Muster wie app/zentrale/schreiben.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/jagderlaubnisse/scheine.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  alsBerlinDatum,
  alsDatum,
  alsEinloeseErgebnis,
  alsEuro,
  alsHektar,
  alsSpalten,
  alsStatus,
  betragAlsZahl,
  betragFehler,
  darfGedrucktWerden,
  effektiverStatus,
  entgeltAufDemBlatt,
  entgeltSpalten,
  jagdjahrEnde,
  landesrecht,
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

// --- Was gedruckt wird, und was nicht ---
// `nochnicht` ist der HAEUFIGSTE Fall, nicht der Fehlerfall: ein heute fuer die
// kommende Saison ausgestellter Schein. Ein `=== 'aktiv'` haette ihn gesperrt.
assert.equal(darfGedrucktWerden('aktiv'), true)
assert.equal(darfGedrucktWerden('nochnicht'), true, 'im Voraus drucken ist der Normalfall')
// Zuruecknahme und Ablauf duerfen kein Erlaubnisblatt erzeugen — Papier laesst
// sich nicht zurueckrufen.
assert.equal(darfGedrucktWerden('pausiert'), false)
assert.equal(darfGedrucktWerden('entzogen'), false)
assert.equal(darfGedrucktWerden('abgelaufen'), false)
assert.equal(darfGedrucktWerden('unbekannt'), false, 'im Zweifel kein Dokument')

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
  entgeltlich: false,
  betrag: '',
  faellig: '',
}
assert.equal(pruefeEntwurf(gut), null)
assert.match(pruefeEntwurf({ ...gut, name: '   ' })!, /Name/)
assert.match(pruefeEntwurf({ ...gut, email: '' })!, /Anmelde-Adresse/)
assert.match(pruefeEntwurf({ ...gut, email: 'heinrich' })!, /E-Mail-Adresse/)
assert.match(pruefeEntwurf({ ...gut, bis: '2026-07-01' })!, /vor dem Beginn/)
assert.equal(pruefeEntwurf({ ...gut, bis: gut.von }), null, 'ein Tagesschein ist gueltig')
assert.match(pruefeEntwurf({ ...gut, art: 'staende' })!, /Kein Stand/)
assert.equal(pruefeEntwurf({ ...gut, art: 'staende', standIds: ['s1'] }), null)
// Die Entgeltlichkeit ist Pflicht — sie ist die einzige Angabe des Scheins mit
// Rechtsfolge und darf nicht durch eine Vorauswahl gesetzt werden.
assert.match(pruefeEntwurf({ ...gut, entgeltlich: null })!, /[Ee]ntgeltlich/)
assert.equal(pruefeEntwurf({ ...gut, entgeltlich: true }), null)
// `gut.entgeltlich` ist `false`: die Zusicherung ganz oben belegt damit zugleich,
// dass „unentgeltlich" eine ANGABE ist und nicht mit `null` zusammenfaellt —
// genau die Falle, die ein `if (!e.entgeltlich)` gebaut haette.

// --- Betrag: deutsche Schreibweise, und der teure Fall ist das Komma ---
assert.equal(betragAlsZahl('500'), 500)
assert.equal(betragAlsZahl('500,50'), 500.5, 'Komma ist das Dezimalzeichen')
assert.equal(betragAlsZahl('1.500,50'), 1500.5, 'Punkt ist der Tausendertrenner')
assert.equal(betragAlsZahl('  750  '), 750)
// (Der Fehler, gegen den die Funktion gebaut ist: `parseFloat('500,50')` laese
// stillschweigend 500 — die Zusicherung auf 500.5 zwei Zeilen hoeher schliesst
// das bereits aus.)
// Leer ist kein Fehler: ein Betrag darf fehlen, auch bei entgeltlich.
assert.equal(betragAlsZahl(''), null)
// Unlesbares faellt durch, statt sich zurechtbiegen zu lassen.
// `500.5` ist der teuerste davon: ohne die Regex wuerde der Punkt als
// Tausendertrenner entfernt und daraus **5005** — ein Zehnfaches, lautlos.
// `-20` faellt hier durch, weil die Migration bewusst keinen CHECK traegt.
for (const muell of ['abc', '1,2,3', '500.5', '500,555', '-20', '1e3', '5,,0']) {
  assert.equal(betragAlsZahl(muell), null, `${muell} darf keine Zahl ergeben`)
}
// Dieselbe Grenze wie `numeric(10,2)`: acht Vorkommastellen gehen, neun nicht.
// Ohne sie rundete `Number` eine lange Ziffernfolge still, und die Abweisung
// kaeme erst als `numeric field overflow` aus der Datenbank.
assert.equal(betragAlsZahl('99999999,99'), 99999999.99, 'das Maximum der Spalte')
assert.equal(betragAlsZahl('999999999'), null, 'neun Stellen sprengen die Spalte')
assert.equal(betragAlsZahl('12345678901234567890'), null)
assert.equal(betragAlsZahl('999.999.999'), null, 'auch mit Tausenderpunkten')
assert.equal(betragAlsZahl('999.999'), 999999, 'sechs Stellen mit Punkt gehen')
assert.equal(betragAlsZahl('12.345.678'), 12345678, 'acht Stellen mit Punkten gehen')
// Die Grenze zaehlt ZIFFERN, nicht Zeichen: mit und ohne Tausenderpunkte
// dieselbe Antwort.
assert.equal(betragAlsZahl('12345678'), 12345678)
assert.equal(betragAlsZahl('123456789'), null)

// --- Euro-Anzeige ---
assert.match(alsEuro(500.5)!, /500,50/)
// PostgREST liefert `numeric` als ZAHL (gemessen 05.08.2026:
// `json_typeof(to_json(1200.50::numeric))` = number). Die String-Form steht
// defensiv daneben, weil der Client untypisiert ist — beide muessen durch.
assert.match(alsEuro('1500.50')!, /1\.500,50/)
// Fehlt der Betrag, laesst das Blatt die Zeile weg statt "0,00 €" zu behaupten.
assert.equal(alsEuro(null), null)
// Der Client ist untypisiert: eine vergessene Spalte liefert `undefined`.
assert.equal(alsEuro(undefined), null)
assert.equal(alsEuro('keine Zahl'), null)

// --- Der Fehlertext steht an EINEM Ort, beide Schreibwege nutzen ihn ---
assert.equal(betragFehler(''), null, 'kein Betrag ist kein Fehler')
assert.equal(betragFehler('1.500,50'), null)
assert.match(betragFehler('viel')!, /nicht lesbar/)

// --- Die gemeinsame Entgelt-Regel ---
assert.deepEqual(entgeltSpalten(true, '1.200', ' jährlich '), {
  entgelt_betrag: 1200,
  entgelt_faellig: 'jährlich',
})
// Der Kern: umschalten auf unentgeltlich nimmt das Entgelt MIT, egal was in
// den Feldern steht.
assert.deepEqual(entgeltSpalten(false, '1.200', 'jährlich'), {
  entgelt_betrag: null,
  entgelt_faellig: null,
})
assert.deepEqual(entgeltSpalten(null, '1.200', 'jährlich'), {
  entgelt_betrag: null,
  entgelt_faellig: null,
})

// --- Pruefung: ein getippter Betrag muss lesbar sein ---
assert.equal(pruefeEntwurf({ ...gut, entgeltlich: true, betrag: '500,50' }), null)
assert.equal(pruefeEntwurf({ ...gut, entgeltlich: true, betrag: '' }), null, 'Betrag darf fehlen')
assert.match(pruefeEntwurf({ ...gut, entgeltlich: true, betrag: 'viel' })!, /nicht lesbar/)
// Beim UNENTGELTLICHEN Schein wird das Feld gar nicht erst geprueft — es ist
// dort nicht sichtbar, und ein Rest im State darf nichts blockieren.
assert.equal(pruefeEntwurf({ ...gut, entgeltlich: false, betrag: 'viel' }), null)

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

assert.equal(spalten.entgeltlich, false, 'unentgeltlich wird als false geschrieben, nicht als null')
assert.equal(alsSpalten({ ...gut, entgeltlich: true }, 'r', 'i').entgeltlich, true)

// Entgelt haengt an `entgeltlich`, NICHT am Feldinhalt: wer einen Betrag tippt
// und danach auf "unentgeltlich" umschaltet, darf ihn nicht mitschreiben.
const mitGeld = alsSpalten(
  { ...gut, entgeltlich: true, betrag: '1.200', faellig: '  jährlich zum 1. April  ' }, 'r', 'i')
assert.equal(mitGeld.entgelt_betrag, 1200)
assert.equal(mitGeld.entgelt_faellig, 'jährlich zum 1. April')
const ohneGeld = alsSpalten(
  { ...gut, entgeltlich: false, betrag: '1.200', faellig: 'jährlich' }, 'r', 'i')
assert.equal(ohneGeld.entgelt_betrag, null, 'unentgeltlich traegt keinen Betrag')
assert.equal(ohneGeld.entgelt_faellig, null)
// Leere Faelligkeit wird null, nicht ''.
assert.equal(alsSpalten({ ...gut, entgeltlich: true, faellig: '   ' }, 'r', 'i').entgelt_faellig, null)

// --- Das Blatt: drei Zustaende, nicht zwei ---
assert.equal(entgeltAufDemBlatt(true), 'Entgeltlich')
assert.equal(entgeltAufDemBlatt(false), 'Unentgeltlich')
// Der Altbestand vor Migration 103: beide Woerter bleiben stehen, ein Mensch
// streicht. Ein Blatt darf ueber diese vier Zeilen nichts behaupten.
assert.equal(entgeltAufDemBlatt(null), 'Entgeltlich – Unentgeltlich')

// --- Landesrecht: eine Tabelle, ein unbekanntes Land bekommt nichts ---
const nds = landesrecht('Niedersachsen', true)
assert.equal(nds.hinweise.length, 2)
assert.equal(nds.hinweise[0].bezug, '§ 19 NJagdG')
// Der letzte Satz von § 19 ist der, den man beim Kuerzen zuerst verliert — und
// er ist der freundlichste: Begleitung genuegt, wenn sie erreichbar ist.
assert.match(nds.hinweise[0].text, /ohne Schwierigkeiten zu erreichen ist\.$/)
assert.match(nds.hinweise[1].text, /Trophäen/)
// **`text` ist Wortlaut, `zusatz` ist unsere Anmerkung** — der Rueckverweis auf
// die Auflagen darf NICHT im Zitat stehen, sonst liest ein Beamter ihn als Teil
// des Paragraphen. Das Blatt setzt ihn kursiv daneben.
assert.doesNotMatch(nds.hinweise[1].text, /Auflagen/, 'Zitat bleibt Zitat')
assert.match(nds.hinweise[1].zusatz!, /Auflagen/)
assert.equal(nds.hinweise[0].zusatz, undefined, '§ 19 braucht keine Anmerkung')
assert.match(nds.behoerde!, /§ 20 Nr\. 5/)
// Der Satz steht seit dem Delta-Durchgang auch auf dem `null`-Blatt. Streicht
// der Mensch dort „Entgeltlich", darf er keine Pflicht behaupten, die es fuer
// unentgeltliche Erlaubnisse nicht gibt — also traegt er die Bedingung selbst.
assert.match(nds.behoerde!, /entgeltlich erteilt wurde/)

// Nur ein ausdrueckliches `false` unterdrueckt den Behoerden-Hinweis. Beim
// Altbestand (`null`) laesst das Blatt beide Woerter stehen — streicht der
// Mensch „Unentgeltlich", haelt der Empfaenger ein entgeltliches Papier, und
// dann muss der Hinweis darauf stehen.
assert.equal(landesrecht('Niedersachsen', false).behoerde, null)
assert.match(landesrecht('Niedersachsen', null).behoerde!, /§ 20 Nr\. 5/)
assert.equal(landesrecht('Niedersachsen', false).hinweise.length, 2, 'Paragraphen bleiben')

// Lieber kein Paragraph als ein fremder — NJagdG-Text auf einem bayerischen
// Blatt waere schlicht falsch.
assert.deepEqual(landesrecht('Bayern', true), { hinweise: [], behoerde: null })
assert.deepEqual(landesrecht(null, true), { hinweise: [], behoerde: null })
// `bundesland` ist eine frei beschreibbare Textspalte. Ohne `Object.hasOwn`
// traefen diese drei die Prototyp-Kette, und `hinweise` waere `undefined` —
// das Blatt stuerbe an `.map()`, nicht an einer Fehlermeldung.
for (const boese of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
  assert.deepEqual(
    landesrecht(boese, true),
    { hinweise: [], behoerde: null },
    `Prototyp-Schluessel ${boese} darf keinen Landesdatensatz ergeben`,
  )
}

// --- Datum: der Kalendertag der DB, NICHT der lokale ---
// Reine Zeichenarbeit, damit es die Zeitzonenfalle gar nicht erst gibt.
assert.equal(alsDatum('2026-08-01'), '01.08.2026')
assert.equal(alsDatum('2027-03-31'), '31.03.2027')
assert.equal(alsDatum(null), '—')
assert.equal(alsDatum('2026-08'), '—', 'unvollstaendig ist kein Datum')

// --- Zeitpunkt: Berlin, nicht UTC ---
// Der teure Fall, und er ist in diesem Repo schon einmal passiert
// (Fremdpruefung 04.08.2026 an `kontakte.inaktiv_seit`): 00:30 Berliner
// Sommerzeit ist 22:30 UTC des VORTAGS. Ein ISO-Schnitt zeigte den 04.
assert.equal(alsBerlinDatum('2026-08-04T22:30:00Z'), '05.08.2026')
// Winterzeit, damit der Test nicht nur eine Jahreszeit kennt: UTC+1.
assert.equal(alsBerlinDatum('2026-01-04T23:30:00Z'), '05.01.2026')
assert.equal(alsBerlinDatum(null), '—')
assert.equal(alsBerlinDatum('kein Zeitpunkt'), '—')

// --- Hektar: zwei Nachkommastellen, deutsch, oder gar nichts ---
assert.equal(alsHektar(1404.33428946761), '1.404,33 ha')
assert.equal(alsHektar(1967.62985019684), '1.967,63 ha', 'wird gerundet, nicht abgeschnitten')
// Eine fehlende Flaeche wird weggelassen, nicht als "0 ha" behauptet.
assert.equal(alsHektar(null), null)
assert.equal(alsHektar(Number.NaN), null)
assert.equal(alsHektar(0), '0,00 ha', 'echte Null ist eine Angabe, kein fehlender Wert')

// --- Einloesen: Unbekanntes ist ein Fehlschlag, kein Erfolg ---
assert.equal(alsEinloeseErgebnis('ok'), 'ok')
assert.equal(alsEinloeseErgebnis('gesperrt'), 'gesperrt')
assert.equal(alsEinloeseErgebnis(undefined), 'fehler')
assert.equal(alsEinloeseErgebnis('kontingent_erschoepft'), 'fehler')
