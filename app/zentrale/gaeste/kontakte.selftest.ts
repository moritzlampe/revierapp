// Gegenprobe fuer die Regeln der Gaesteliste. Dieses Repo hat keinen
// Test-Runner, deshalb ein eigenstaendiges Skript statt eines Frameworks
// (gleiches Muster wie schreiben.selftest.ts und scheine.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/gaeste/kontakte.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  alsDatum,
  alsFilter,
  anzeigeName,
  einladungsHinweis,
  einladungsweg,
  ersterWert,
  initialen,
  kuerzelVon,
  istGestrichen,
  passtZuSuche,
  sichtbare,
  sortSchluessel,
  sortiert,
  suchtext,
  type Kontakt,
} from './kontakte.ts'

/** Ein Kontakt mit allem leer — die Testfaelle setzen nur, was sie pruefen. */
function k(teil: Partial<Kontakt>): Kontakt {
  return {
    id: 'x',
    vorname: null,
    nachname: null,
    begleitung: null,
    email: null,
    telefon: null,
    handy: null,
    adresse: null,
    geburtstag: null,
    notiz: null,
    kuerzel: null,
    ...teil,
  }
}

// --- anzeigeName ---
assert.equal(anzeigeName({ vorname: 'Henner', nachname: 'Ahlwes' }), 'Ahlwes, Henner')
// Der Adelszusatz gehoert zum Nachnamen und wird NICHT zerlegt (Konzept §3.1).
assert.equal(
  anzeigeName({ vorname: 'Werner', nachname: 'Baron v. Buchholtz' }),
  'Baron v. Buchholtz, Werner',
)
// Nur eines gesetzt: kein baumelndes Komma.
assert.equal(anzeigeName({ vorname: 'Henner', nachname: null }), 'Henner')
assert.equal(anzeigeName({ vorname: null, nachname: 'Ahlwes' }), 'Ahlwes')
assert.equal(anzeigeName({ vorname: '  ', nachname: 'Ahlwes' }), 'Ahlwes')
// Der Check-Constraint verhindert das — die Ansicht darf sich trotzdem nicht
// darauf verlassen, dass eine DB-Bedingung nie verletzt wird.
assert.equal(anzeigeName({ vorname: null, nachname: null }), '(ohne Namen)')

// --- sortSchluessel: Adressbuch-Konvention, DIN 5007-2 ---
// Der Befund, der das ausgeloest hat: fuenf „Graf Grote" und fuenf
// „Graf v. Hardenberg" standen gemeinsam unter G.
assert.equal(sortSchluessel('Graf v. Hardenberg'), 'hardenberg')
assert.equal(sortSchluessel('Graf Grote'), 'grote')
assert.equal(sortSchluessel('Baron v. Buchholtz'), 'buchholtz')
assert.equal(sortSchluessel('Fürst zu Bentheim und Steinfurt'), 'bentheim und steinfurt')
assert.equal(sortSchluessel('Frhr. v. Vincke'), 'vincke')
// Ein Partikel in der MITTE trennt zwei Namensteile, es fuehrt sie nicht ein:
assert.equal(sortSchluessel('Meyer zu Erpen'), 'meyer zu erpen')
assert.equal(sortSchluessel('Schenck zu Schweinsberg'), 'schenck zu schweinsberg')
assert.equal(sortSchluessel('Ahlwes'), 'ahlwes')
assert.equal(sortSchluessel(null), '')
// Ein Name, der NUR aus Titeln bestuende, darf nicht leer werden — sonst
// verschwaende er ans Listenende.
assert.equal(sortSchluessel('Graf'), 'graf')

// --- initialen: Moritz' Vorgabe vom 01.08.2026 ---
assert.equal(initialen({ vorname: 'Joachim', nachname: 'v. Zitzewitz' }), 'JvZ')
assert.equal(initialen({ vorname: 'Hans-Gerd', nachname: 'von Alten-Weddelmann' }), 'HGvAW')
// Titel fallen weg, Partikel bleiben klein.
assert.equal(initialen({ vorname: 'Werner', nachname: 'Baron v. Buchholtz' }), 'WvB')
assert.equal(initialen({ vorname: 'Alexander', nachname: 'Graf v. Hardenberg' }), 'AvH')
assert.equal(initialen({ vorname: 'Dr. Jochen', nachname: 'Algermissen' }), 'JA')
assert.equal(initialen({ vorname: 'Henner', nachname: 'Ahlwes' }), 'HA')
assert.equal(initialen({ vorname: null, nachname: 'Ahlwes' }), 'A')
assert.equal(initialen({ vorname: null, nachname: null }), '')

// --- kuerzelVon: Vorgabe schlaegt Ableitung (Migration 086) ---
// NULL heisst "rechne aus", nicht "kein Kuerzel".
assert.equal(kuerzelVon({ vorname: 'Anton', nachname: 'v. Alvensleben', kuerzel: null }), 'AvA')
// Genau der Fall, fuer den die Spalte existiert: Anton UND Albrecht
// v. Alvensleben ergeben beide `AvA` — der Vater nannte sie Toni und Alfons.
assert.equal(kuerzelVon({ vorname: 'Anton', nachname: 'v. Alvensleben', kuerzel: 'Toni' }), 'Toni')
assert.equal(
  kuerzelVon({ vorname: 'Albrecht', nachname: 'v. Alvensleben', kuerzel: 'Alfons' }),
  'Alfons',
)
// Leerraum zaehlt als nicht gesetzt — sonst erfaende ein versehentliches
// Leerzeichen im Formular eine dritte Bedeutung neben "abgeleitet" und "Vorgabe".
assert.equal(kuerzelVon({ vorname: 'Henner', nachname: 'Ahlwes', kuerzel: '   ' }), 'HA')

// --- suchtext: Umlaute fallen weg, ue-Schreibweise ausdruecklich NICHT ---
assert.equal(suchtext('Kürzel'), 'kurzel')
assert.equal(suchtext('Müller'), 'muller')
assert.notEqual(suchtext('Müller'), 'mueller')

// --- passtZuSuche ---
const alston = k({
  vorname: 'Ian',
  nachname: 'Alston',
  begleitung: 'Alison',
  email: 'ian@honingham.co.uk',
  notiz: 'Kürzel Ian',
})
assert.equal(passtZuSuche(alston, ''), true, 'leere Suche zeigt alles')
assert.equal(passtZuSuche(alston, '   '), true, 'nur Leerraum zeigt alles')
assert.equal(passtZuSuche(alston, 'alston'), true)
assert.equal(passtZuSuche(alston, 'ALSTON'), true, 'Grossschreibung egal')
assert.equal(passtZuSuche(alston, 'honingham'), true, 'die Mailadresse zaehlt mit')
// Das physische Adressfeld ebenso — heute bei allen 154 leer, aber der
// vCard-Import fuellt es, und das Suchfeld nennt es nicht ohne Grund nicht.
assert.equal(passtZuSuche(k({ nachname: 'Alston', adresse: 'Norwich' }), 'norwich'), true)
// Mehrere Woerter duerfen in VERSCHIEDENEN Feldern stehen (Nachname + Begleitung).
assert.equal(passtZuSuche(alston, 'alston alison'), true)
assert.equal(passtZuSuche(alston, 'alston bettina'), false, 'UND, nicht ODER')
// Ohne Umlaut getippt findet den Umlaut.
assert.equal(passtZuSuche(alston, 'kurzel'), true)

// Der Weg zu den 32 „streichen": die Notiz ist durchsuchbar. Das ist die
// Gegenleistung dafuer, dass sie KEINEN eigenen Zustand bekommen — die
// Entscheidung gehoert dem Besitzer (Konzept §10.4).
const gestrichen = k({ nachname: 'Adalbert', notiz: 'Kürzel Adalbert; Markierung streichen' })
assert.equal(passtZuSuche(gestrichen, 'streichen'), true)
assert.equal(passtZuSuche(alston, 'streichen'), false)

// --- einladungsweg / einladungsHinweis ---
assert.equal(einladungsweg({ email: 'a@b.de' }), 'adresse')
assert.equal(einladungsweg({ email: null }), 'code')
assert.equal(einladungsweg({ email: '   ' }), 'code', 'Leerraum ist keine Adresse')
assert.equal(einladungsHinweis({ email: 'a@b.de' }), null)
assert.match(einladungsHinweis({ email: null }) ?? '', /nur per weitergegebenem Code/)

// --- alsDatum: reine Zeichenarbeit, keine Zeitzone ---
assert.equal(alsDatum('1958-07-26'), '26.07.1958')
// Der Fall, der mit `new Date()` kaputtginge: UTC-Mitternacht wuerde westlich
// von Greenwich als der Vortag angezeigt.
assert.equal(alsDatum('1989-01-01'), '01.01.1989')
assert.equal(alsDatum(null), '—')
assert.equal(alsDatum(''), '—')
assert.equal(alsDatum('1989-01'), '—', 'abgeschnittenes Datum wird nicht geraten')

// --- ersterWert: `?q=a&q=b` liefert bei Next ein Array ---
// Ohne diese Schranke liefe das Array bis in suchtext() und stuerbe dort an
// .toLowerCase() — ein Serverfehler auf einer Seite, die nur liest.
assert.equal(ersterWert('streichen'), 'streichen')
assert.equal(ersterWert(['a', 'b']), 'a', 'bei Mehrfachangabe gilt der erste')
assert.equal(ersterWert([]), '', 'leeres Array ist kein undefined-Absturz')
assert.equal(ersterWert(undefined), '')
assert.equal(ersterWert(null), '')
// Und der Weg, den der Fehler genommen haette, ist damit zu:
assert.equal(passtZuSuche(alston, ersterWert(['alston', 'egal'])), true)

// --- alsFilter: alles Unbekannte wird `alle`, nie eine leere Liste ---
assert.equal(alsFilter('code'), 'code')
assert.equal(alsFilter('streichen'), 'streichen')
assert.equal(alsFilter('alle'), 'alle')
assert.equal(alsFilter(null), 'alle')
assert.equal(alsFilter('Code'), 'alle', 'kein Rateversuch bei Grossschreibung')
assert.equal(alsFilter('quatsch'), 'alle')

// --- istGestrichen: der Vermerk steht im Freitext, nicht in einem Feld ---
assert.equal(istGestrichen({ notiz: 'Kürzel Adalbert; Markierung streichen' }), true)
assert.equal(istGestrichen({ notiz: 'STREICHEN' }), true, 'Grossschreibung egal')
assert.equal(istGestrichen({ notiz: 'Kürzel Henner' }), false)
assert.equal(istGestrichen({ notiz: null }), false)

// --- sortiert: die Entscheidung vom 01.08.2026, an echten Namen ---
// „Graf v. Hardenberg" gehoert zwischen Grote und Meyer, nicht zu den G's.
const gemischt: Kontakt[] = [
  k({ id: 'meyer', nachname: 'Meyer zu Erpen', vorname: 'Otto' }),
  k({ id: 'hardenberg', nachname: 'Graf v. Hardenberg', vorname: 'Alexander' }),
  k({ id: 'ohne', nachname: null, vorname: 'Namenlos' }),
  k({ id: 'grote', nachname: 'Graf Grote', vorname: 'Anton' }),
  k({ id: 'buchholtz', nachname: 'Baron v. Buchholtz', vorname: 'Werner' }),
]
assert.deepEqual(
  sortiert(gemischt).map((x) => x.id),
  ['buchholtz', 'grote', 'hardenberg', 'meyer', 'ohne'],
)
// Gleicher Familienname: der Vorname entscheidet (fuenf „Graf Grote" real).
assert.deepEqual(
  sortiert([
    k({ id: 'b', nachname: 'Graf Grote', vorname: 'Klemens' }),
    k({ id: 'a', nachname: 'Graf Grote', vorname: 'Anton' }),
  ]).map((x) => x.id),
  ['a', 'b'],
)
// Sortieren aendert die Vorlage nicht.
const vorlage = [k({ id: 'z', nachname: 'Zitzewitz' }), k({ id: 'a', nachname: 'Ahlwes' })]
sortiert(vorlage)
assert.deepEqual(vorlage.map((x) => x.id), ['z', 'a'], 'sortiert() kopiert, statt zu tauschen')

// --- sichtbare: Filter und Suche greifen zusammen, Reihenfolge bleibt ---
const bestand: Kontakt[] = [
  k({ id: '1', nachname: 'Ahlwes', vorname: 'Henner', email: 'h@web.de' }),
  k({ id: '2', nachname: 'Ahrens', vorname: 'Justin', email: null }),
  k({ id: '3', nachname: 'Alston', vorname: 'Ian', email: 'ian@honingham.co.uk' }),
  k({ id: '4', nachname: 'Baron v. Buchholtz', vorname: 'Werner', email: null }),
]
assert.deepEqual(sichtbare(bestand, '', 'alle').map((x) => x.id), ['1', '2', '3', '4'])
assert.deepEqual(sichtbare(bestand, '', 'code').map((x) => x.id), ['2', '4'])
assert.deepEqual(sichtbare(bestand, 'a', 'code').map((x) => x.id), ['2', '4'])
assert.deepEqual(sichtbare(bestand, 'buchholtz', 'code').map((x) => x.id), ['4'])
// Suche und Filter sind UND-verknuepft: Alston hat eine Adresse, faellt also
// trotz Treffer aus dem Code-Filter.
assert.deepEqual(sichtbare(bestand, 'alston', 'code').map((x) => x.id), [])
// Die Reihenfolge kommt aus der Abfrage und wird nicht angefasst.
assert.deepEqual(sichtbare(bestand, '', 'alle'), bestand)
