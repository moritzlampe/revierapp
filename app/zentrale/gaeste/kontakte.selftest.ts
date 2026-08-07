// Gegenprobe fuer die Regeln der Gaesteliste. Dieses Repo hat keinen
// Test-Runner, deshalb ein eigenstaendiges Skript statt eines Frameworks
// (gleiches Muster wie schreiben.selftest.ts und scheine.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/gaeste/kontakte.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  aenderungen,
  alsDatum,
  alsFilter,
  alsSpalten,
  anzeigeName,
  einladungsHinweis,
  einladungsweg,
  entwurfVon,
  ersterWert,
  initialen,
  kuerzelVon,
  nachnameSortiert,
  istInaktiv,
  alsBerlinDatum,
  passtZuSuche,
  pruefeEntwurf,
  sichtbare,
  sortSchluessel,
  sortiert,
  suchtext,
  mehrfachText,
  normiert,
  kategorieLabel,
  zuordnungLabel,
  zuordnungsPatch,
  FELDER,
  KATEGORIEN,
  LEERER_ENTWURF,
  MEHRFACH,
  TAGS,
  type Kontakt,
  chronikNachKontakt,
  alsSaison,
  type Chronikzeile,
} from './kontakte.ts'

const normiert2K = (w: readonly string[] | null | undefined) => normiert(w, KATEGORIEN)
const normiert2T = (w: readonly string[] | null | undefined) => normiert(w, TAGS)

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
    kategorien: [],
    standard_tags: [],
    inaktiv_seit: null,
    ...teil,
  }
}

// --- anzeigeName: Adressbuch-Schreibweise, Zusatz hinter dem Kern ---
assert.equal(anzeigeName({ vorname: 'Henner', nachname: 'Ahlwes' }), 'Ahlwes, Henner')
// Moritz' Vorgabe vom 01.08.2026: die Zeile soll zeigen, unter welchem
// Buchstaben sie steht. „v. Alvensleben, Ferdinand" stand unter A und sagte
// nicht, warum.
assert.equal(
  anzeigeName({ vorname: 'Ferdinand', nachname: 'v. Alvensleben' }),
  'Alvensleben v., Ferdinand',
)
assert.equal(
  anzeigeName({ vorname: 'Werner', nachname: 'Baron v. Buchholtz' }),
  'Buchholtz Baron v., Werner',
)
// Der Zusatz wird NICHT ausgeschrieben — was in der Zeile steht, bleibt stehen.
assert.equal(
  anzeigeName({ vorname: 'Ferdinand', nachname: 'von Alvensleben' }),
  'Alvensleben von, Ferdinand',
)
// Anzeige und Sortierung lesen aus derselben Zerlegung: der Kern der Anzeige
// ist der Sortierschluessel. Laufen sie auseinander, steht die Liste in einer
// Ordnung, die ihre eigene Schreibweise nicht erklaert.
for (const n of ['v. Alvensleben', 'Graf v. Hardenberg', 'Meyer zu Erpen', 'Ahlwes', 'Graf']) {
  assert.equal(
    nachnameSortiert(n).toLowerCase().startsWith(sortSchluessel(n)),
    true,
    `Anzeige und Sortierung passen bei „${n}" nicht zusammen`,
  )
}
// Partikel in der MITTE bleibt, wo er ist — er trennt Namensteile.
assert.equal(nachnameSortiert('Meyer zu Erpen'), 'Meyer zu Erpen')
assert.equal(nachnameSortiert('Graf v. Hardenberg'), 'Hardenberg Graf v.')
// Die fuenf Zeilen, bei denen die Quelle das Leerzeichen verschluckt hat. Ohne
// die Ergaenzung in worte() ist „Frhr.v." EIN Wort, das in keiner der beiden
// Mengen steht — die fuenf standen unter F und V statt unter E, C, B und A.
// Gemessen an den echten 154 Namen am 01.08.2026.
assert.equal(nachnameSortiert('Frhr.v.Elverfeldt'), 'Elverfeldt Frhr. v.')
assert.equal(sortSchluessel('Frhr.v.Elverfeldt'), 'elverfeldt')
assert.equal(nachnameSortiert('Frhr.v. Cramm'), 'Cramm Frhr. v.')
assert.equal(sortSchluessel('Frhr.v. Cramm'), 'cramm')
assert.equal(nachnameSortiert('Frhr.v. d. Bussche'), 'Bussche Frhr. v. d.')
assert.equal(sortSchluessel('Frhr.v. d. Bussche'), 'bussche')
assert.equal(nachnameSortiert('v.Alten-Weddelmann'), 'Alten-Weddelmann v.')
assert.equal(sortSchluessel('v.Alten-Weddelmann'), 'alten-weddelmann')
// Dasselbe Leerzeichen fehlte dem Kuerzel: „v.Alten-Weddelmann" ergab `HGVW`,
// weil `v.Alten` weder Titel noch Partikel war.
assert.equal(initialen({ vorname: 'Hans-Gerd', nachname: 'v.Alten-Weddelmann' }), 'HGvAW')
assert.equal(initialen({ vorname: 'Lewin', nachname: 'Frhr.v.Elverfeldt' }), 'LvE')
assert.equal(initialen({ vorname: 'Rembert', nachname: 'Frhr.v. d. Bussche' }), 'RvdB')
// Ein bereits gesetztes Leerzeichen wird nicht verdoppelt.
assert.equal(nachnameSortiert('Frhr. v. Vincke'), 'Vincke Frhr. v.')
assert.equal(nachnameSortiert('Graf'), 'Graf', 'ein Name aus lauter Titeln behaelt seinen Kern')
assert.equal(nachnameSortiert(null), '')
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
// Eine Rangfolge, kein Satz Sonderfaelle: E-Mail schlaegt Handy schlaegt Post.
const wege = { email: null, handy: null, telefon: null, adresse: null }
assert.equal(einladungsweg({ ...wege, email: 'a@b.de' }), 'email')
assert.equal(
  einladungsweg({ ...wege, email: 'a@b.de', handy: '0170 1', adresse: 'Weg 1' }),
  'email',
  'die guenstigste Moeglichkeit gewinnt',
)
assert.equal(einladungsweg({ ...wege, handy: '0170 1', adresse: 'Weg 1' }), 'handy')
assert.equal(einladungsweg({ ...wege, adresse: 'Weg 1' }), 'post')
assert.equal(einladungsweg(wege), 'persoenlich')
// Leerraum ist in keinem Feld ein Weg — gleiche Bedingung wie kontakt_braucht_namen.
assert.equal(einladungsweg({ ...wege, email: '   ', handy: '\t', adresse: ' ' }), 'persoenlich')
// Festnetz steht mit Absicht NICHT in der Rangfolge: der Einladungscode ist
// Gross-/Kleinschreibung-empfindlich, Diktieren ist kein Weg, auf den man
// jemanden hinweisen sollte.
assert.equal(
  einladungsweg({ ...wege, telefon: '05121 1234' }),
  'persoenlich',
  'Festnetz zaehlt nicht als Einladungsweg',
)
assert.equal(einladungsHinweis({ ...wege, email: 'a@b.de' }), null)
assert.match(einladungsHinweis({ ...wege, handy: '0170 1' }) ?? '', /ans Handy/)
assert.match(einladungsHinweis({ ...wege, adresse: 'Weg 1' }) ?? '', /mit der Post/)
assert.match(einladungsHinweis(wege) ?? '', /persönlich/)

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

// --- alsFilter: alles Unbekannte wird `aktiv`, nie eine leere Liste ---
// Die Voreinstellung ist seit 04.08.2026 `aktiv`, nicht `alle`: der Zweck des
// Stilllegens ist, jemanden aus dem Weg zu haben.
assert.equal(alsFilter('inaktiv'), 'inaktiv')
assert.equal(alsFilter('ohne_mail'), 'ohne_mail')
assert.equal(alsFilter('alle'), 'alle')
assert.equal(alsFilter('aktiv'), 'aktiv')
assert.equal(alsFilter(null), 'aktiv')
assert.equal(alsFilter('Inaktiv'), 'aktiv', 'kein Rateversuch bei Grossschreibung')
assert.equal(alsFilter('quatsch'), 'aktiv')
// **Die alte Adresse bleibt brauchbar.** `?filter=streichen` ist teilbar und
// steht womoeglich in einem Lesezeichen; sie zeigt jetzt dieselbe Menge wie
// vorher, nur ueber den Zustand statt ueber den Freitext.
assert.equal(alsFilter('streichen'), 'inaktiv', 'alte Adresse zeigt dieselbe Menge')
// `code` war der alte Schluessel dieser Arbeitsliste und wird abgebildet. Die
// Menge ist nicht identisch (die alte enthielt auch Stillgelegte) — aber der
// Rueckfall auf `aktiv` zeigte zusaetzlich alle MIT Adresse und verfehlte den
// Zweck ganz, statt ihn nur zu verengen (Fremdpruefung 04.08.2026, B1).
assert.equal(alsFilter('code'), 'ohne_mail')

// --- istInaktiv: der Zustand steht in einer Spalte, nicht im Freitext ---
assert.equal(istInaktiv({ inaktiv_seit: '2026-08-04T07:49:32.721Z' }), true)
assert.equal(istInaktiv({ inaktiv_seit: null }), false)

// --- alsBerlinDatum: der Grund, warum es alsDatum() nicht sein darf ---
// 22:30 UTC ist in Berlin der Folgetag. `alsDatum()` schneidet den ISO-String
// und zeigte den Vortag — bei `geburtstag` (ein `date`) richtig, bei einem
// `timestamptz` falsch (Fremdpruefung 04.08.2026, Punkt 3).
assert.equal(alsBerlinDatum('2026-08-04T22:30:00Z'), '05.08.2026')
assert.equal(alsDatum('2026-08-04T22:30:00Z'), '04.08.2026', 'die Falle, dokumentiert')
// Sommer- und Winterzeit kommen von Intl, nicht von Hand.
assert.equal(alsBerlinDatum('2026-01-15T23:30:00Z'), '16.01.2026')
assert.equal(alsBerlinDatum('2026-08-04T09:49:32.721Z'), '04.08.2026')
assert.equal(alsBerlinDatum(null), '—')
assert.equal(alsBerlinDatum('quatsch'), '—', 'kein Invalid Date in der Oberflaeche')
// **Die Funktion PRUEFT nicht, sie formatiert** (Fremdpruefung 04.08.2026, B4).
// `Date` normalisiert stillschweigend: der 30. Februar wird der 2. Maerz, und
// `'0'` wird der 01.01.2000. Das steht hier als Zusicherung, damit niemand die
// Funktion fuer eine Wache haelt — die Eingabe ist eine `timestamptz`-Spalte
// aus der eigenen Datenbank, also immer gueltiges ISO. Waere das je nicht so,
// gehoerte ein Riegel davor und nicht hierher.
assert.equal(alsBerlinDatum('2026-02-30T12:00:00Z'), '02.03.2026', 'normalisiert, prueft nicht')
assert.equal(alsBerlinDatum('0'), '01.01.2000', 'normalisiert, prueft nicht')

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
assert.deepEqual(sichtbare(bestand, '', 'ohne_mail').map((x) => x.id), ['2', '4'])
assert.deepEqual(sichtbare(bestand, 'a', 'ohne_mail').map((x) => x.id), ['2', '4'])
assert.deepEqual(sichtbare(bestand, 'buchholtz', 'ohne_mail').map((x) => x.id), ['4'])
// Suche und Filter sind UND-verknuepft: Alston hat eine Adresse, faellt also
// trotz Treffer aus der Arbeitsliste.
assert.deepEqual(sichtbare(bestand, 'alston', 'ohne_mail').map((x) => x.id), [])
// Die Reihenfolge kommt aus der Abfrage und wird nicht angefasst.
assert.deepEqual(sichtbare(bestand, '', 'alle'), bestand)

// --- sichtbare: der Zustand als Achse (Migration 100) ---
const gemischterZustand: Kontakt[] = [
  k({ id: 'a1', nachname: 'Ahlwes', vorname: 'Henner', email: 'h@web.de' }),
  k({ id: 'i1', nachname: 'Braband', vorname: 'Moritz', email: 'm@web.de',
      inaktiv_seit: '2026-08-04T07:49:32.721Z' }),
  k({ id: 'a2', nachname: 'Crisp', vorname: 'Edward', email: null }),
  k({ id: 'i2', nachname: 'Daewes', vorname: 'Henning', email: null,
      inaktiv_seit: '2026-08-04T07:49:32.721Z' }),
]
// Voreinstellung: die Stillgelegten sind weg.
assert.deepEqual(sichtbare(gemischterZustand, '', 'aktiv').map((x) => x.id), ['a1', 'a2'])
assert.deepEqual(sichtbare(gemischterZustand, '', 'inaktiv').map((x) => x.id), ['i1', 'i2'])
assert.deepEqual(
  sichtbare(gemischterZustand, '', 'alle').map((x) => x.id),
  ['a1', 'i1', 'a2', 'i2'],
  'unter „Alle" stehen beide, in der Reihenfolge der Abfrage',
)
// **Die Arbeitsliste zeigt nur Aktive.** Nachtragen tut man fuer Leute, die man
// noch einlaedt — Daewes hat keine Adresse UND ist stillgelegt, er faellt raus.
assert.deepEqual(sichtbare(gemischterZustand, '', 'ohne_mail').map((x) => x.id), ['a2'])
// **Keine Zusicherung mehr, dass die Zahl am Schalter passt** — sie zaehlt seit
// der Ponytail-Lesung vom 04.08.2026 ueber `sichtbare()` selbst. Ein Test, der
// zwei Formulierungen desselben Praedikats vergleicht, haelt sie nur
// synchron; eine Quelle braucht keinen Vergleich.
// Zustand UND Suche sind UND-verknuepft.
assert.deepEqual(sichtbare(gemischterZustand, 'braband', 'aktiv').map((x) => x.id), [])
assert.deepEqual(sichtbare(gemischterZustand, 'braband', 'inaktiv').map((x) => x.id), ['i1'])
// Jeder Kontakt steht in genau EINEM der beiden Zustaende — es gibt kein Drittes.
for (const x of gemischterZustand) {
  const inAktiv = sichtbare([x], '', 'aktiv').length
  const inInaktiv = sichtbare([x], '', 'inaktiv').length
  assert.equal(inAktiv + inInaktiv, 1, `${x.id} steht in keinem oder in beiden Zustaenden`)
}

// ===========================================================================
// Bearbeiten, Anlegen, Loeschen (Block 2)
// ===========================================================================

// --- FELDER ist die EINE Liste: was der Entwurf hat, steht drin und umgekehrt ---
// Laufen die auseinander, zeigt der Inspektor ein Feld, das das Formular nicht
// schreibt (oder schlimmer: umgekehrt).
// Seit 094 sind es ZWEI Listen — FELDER traegt die Textfelder, MEHRFACH die
// Arrays. Zusammen muessen sie den Entwurf luekenlos und ueberschneidungsfrei
// decken: ein Feld in keiner der beiden Listen liesse sich nicht bearbeiten,
// ein Feld in beiden stuende zweimal im Formular.
assert.deepEqual(
  [...FELDER.map((f) => f.key), ...MEHRFACH.map((m) => m.key)].sort(),
  (Object.keys(LEERER_ENTWURF) as (keyof typeof LEERER_ENTWURF)[]).sort(),
  'FELDER + MEHRFACH und Entwurf muessen dieselben Felder fuehren',
)
assert.equal(
  FELDER.some((f) => MEHRFACH.some((m) => m.key === (f.key as string))),
  false,
  'kein Feld darf in beiden Listen stehen',
)
assert.deepEqual(
  FELDER.filter((f) => f.imKopf).map((f) => f.key),
  ['vorname', 'nachname'],
  'nur die Namensfelder stehen in der Ueberschrift',
)
// besitzer_id und profil_id haelt der Trigger aus 085 fest — ein Formularfeld
// dafuer waere eines, das beim Speichern 42501 wirft.
for (const verboten of ['besitzer_id', 'profil_id', 'id']) {
  assert.equal(
    Object.hasOwn(LEERER_ENTWURF, verboten),
    false,
    `${verboten} gehoert nicht ins Formular`,
  )
}

// --- entwurfVon: NULL wird zum leeren Feld, das Kuerzel bleibt ROH ---
const roh = k({
  id: '7',
  vorname: 'Anton',
  nachname: 'v. Alvensleben',
  kuerzel: 'Toni',
  email: null,
})
assert.equal(entwurfVon(roh).vorname, 'Anton')
assert.equal(entwurfVon(roh).email, '', 'NULL wird zum leeren Feld, nicht zu "null"')
assert.equal(entwurfVon(roh).kuerzel, 'Toni')
// Der entscheidende Fall: ohne Uebersteuerung bleibt das FELD leer, obwohl die
// Liste ein Kuerzel zeigt. Stuende hier die Ableitung, machte das erste
// Speichern aus "rechne aus" eine feste Vorgabe — die abweicht, sobald jemand
// den Namen korrigiert.
const abgeleitet = k({ id: '8', vorname: 'Anton', nachname: 'v. Alvensleben' })
assert.equal(kuerzelVon(abgeleitet), 'AvA')
assert.equal(entwurfVon(abgeleitet).kuerzel, '', 'die Ableitung darf nicht ins Feld sickern')

// --- alsSpalten: getrimmt, und leer wird NULL ---
const gefuellt = alsSpalten({ ...LEERER_ENTWURF, vorname: '  Anton  ', notiz: 'x' })
assert.equal(gefuellt.vorname, 'Anton')
assert.equal(gefuellt.notiz, 'x')
// date: ein leerer String waere 22007 invalid input syntax for type date.
assert.equal(gefuellt.geburtstag, null)
// 086: NULL heisst "rechne aus". Ein gespeichertes '' waere eine dritte
// Bedeutung, die jeder naechste Leser wieder deuten muesste.
assert.equal(alsSpalten({ ...LEERER_ENTWURF, kuerzel: '   ' }).kuerzel, null)
// Fuer kontakt_braucht_namen sind NULL, '' und '   ' dasselbe — die Spalte auch.
assert.equal(alsSpalten({ ...LEERER_ENTWURF, nachname: '   ' }).nachname, null)

// --- pruefeEntwurf: faengt genau die zwei DB-Fehler ab, sonst nichts ---
assert.match(pruefeEntwurf(LEERER_ENTWURF) ?? '', /Namen/, 'kontakt_braucht_namen (23514)')
assert.equal(pruefeEntwurf({ ...LEERER_ENTWURF, nachname: 'Grote' }), null)
assert.equal(pruefeEntwurf({ ...LEERER_ENTWURF, vorname: 'Anton' }), null, 'Vorname genuegt')
assert.match(pruefeEntwurf({ ...LEERER_ENTWURF, nachname: 'A', geburtstag: '1958' }) ?? '', /Datum/)
assert.equal(pruefeEntwurf({ ...LEERER_ENTWURF, nachname: 'A', geburtstag: '1958-07-26' }), null)
// Halbbekannte Personen sind ausdruecklich erlaubt (Konzept §4): kein Zwang zu
// Mail, Nummer oder Geburtstag.
assert.equal(pruefeEntwurf({ ...LEERER_ENTWURF, nachname: 'Unbekannt' }), null)

// --- aenderungen: nur die geaenderten Spalten, sonst null ---
const bestehend = k({
  id: '9',
  vorname: 'Achaz',
  nachname: 'Graf v. Hardenberg',
  email: 'a@h.de',
  notiz: 'streichen',
})
assert.equal(aenderungen(entwurfVon(bestehend), bestehend), null, 'nichts geaendert = kein Write')
// Nur das eine Feld faehrt mit. DAS ist der Schutz gegen gegenseitiges
// Ueberschreiben: wer das Kuerzel setzt, darf nicht die Nummer zurueckschreiben,
// die der Mitfuehrende inzwischen eingetragen hat.
assert.deepEqual(aenderungen({ ...entwurfVon(bestehend), kuerzel: 'AvH1' }, bestehend), {
  kuerzel: 'AvH1',
})
// Leeren heisst NULL schreiben — und das ist eine Aenderung.
assert.deepEqual(aenderungen({ ...entwurfVon(bestehend), notiz: '' }, bestehend), { notiz: null })
// Reiner Leerraum ist keine Aenderung gegenueber NULL.
assert.equal(aenderungen({ ...entwurfVon(bestehend), handy: '   ' }, bestehend), null)
// Getrimmt verglichen: nur Leerzeichen anzuhaengen aendert nichts.
assert.equal(aenderungen({ ...entwurfVon(bestehend), email: ' a@h.de ' }, bestehend), null)
// Der Geburtstag kommt von PostgREST im selben Format, in dem <input type="date">
// ihn liefert — sonst meldete jedes Oeffnen des Formulars eine Aenderung.
const mitTag = k({ id: '10', nachname: 'Grote', geburtstag: '1958-07-26' })
assert.equal(aenderungen(entwurfVon(mitTag), mitTag), null)
assert.deepEqual(aenderungen({ ...entwurfVon(mitTag), geburtstag: '' }, mitTag), {
  geburtstag: null,
})

// --- aenderungen: der gespeicherte Wert wird genauso normalisiert (Codex) ---
// Ein Kontakt mit Leerraum in der Spalte darf beim blossen Oeffnen-und-Speichern
// KEINEN Patch erzeugen — sonst schreibt die Maske Spalten mit, die niemand
// angefasst hat, und ueberschreibt damit die Aenderung des Mitfuehrenden.
const unsauber = k({ id: '11', nachname: 'Grote', notiz: '  intern  ', begleitung: '' })
assert.equal(
  aenderungen(entwurfVon(unsauber), unsauber),
  null,
  'Leerraum in der Spalte ist keine Aenderung',
)
// Eine ECHTE Aenderung an so einer Zeile faehrt weiterhin — und nur sie.
assert.deepEqual(aenderungen({ ...entwurfVon(unsauber), notiz: 'extern' }, unsauber), {
  notiz: 'extern',
})

// --- 094: Kategorien und Funktionen -----------------------------------------

// Die Enum-Werte, gegen die Migration 094 geschrieben ist. Laufen Konstante und
// Spalte auseinander, wirft der INSERT `22P02 invalid input value for enum` —
// erst beim Speichern, beim Nutzer, mit rohem Postgres-Text.
assert.deepEqual(
  KATEGORIEN.map((x) => x.wert),
  ['schuetze', 'jaegerei', 'treiber', 'schweisshundfuehrer'],
  'kontakt_kategorie aus 094',
)
assert.deepEqual(TAGS.map((x) => x.wert), ['gruppenleiter', 'hundefuehrer'], 'participant_tag')

// normKategorien: Anzeigeordnung, egal wie geklickt wurde.
assert.deepEqual(normiert2K(['treiber', 'schuetze']), ['schuetze', 'treiber'])
// Dubletten fallen weg — sonst stuende „Schütze, Schütze" im Inspektor.
assert.deepEqual(normiert2K(['schuetze', 'schuetze']), ['schuetze'])
// Ein Wert, den das Enum nicht kennt, wuerde beim Schreiben mit 22P02 abgewiesen.
assert.deepEqual(normiert2K(['schuetze', 'buchhalter']), ['schuetze'])
// NULL/undefined: die Spalte ist NOT NULL, aber eine aeltere `.select()`-Liste
// liefert sie schlicht nicht mit. Leer, nicht Absturz.
assert.deepEqual(normiert2K(null), [])
assert.deepEqual(normiert2K(undefined), [])
assert.deepEqual(normiert2T(['hundefuehrer', 'gruppenleiter']), ['gruppenleiter', 'hundefuehrer'])

// mehrfachText: Beschriftungen in Anzeigeordnung, leer heisst null (der
// Inspektor zeigt dann „+ hinzufügen" statt einer leeren Zeile).
assert.equal(mehrfachText(['treiber', 'schuetze'], KATEGORIEN), 'Schütze, Treiber')
assert.equal(mehrfachText([], KATEGORIEN), null)
assert.equal(mehrfachText(['buchhalter'], KATEGORIEN), null, 'Unbekanntes zaehlt nicht als Wert')

// entwurfVon: die Spalte kommt normiert im Formular an.
const mitKat = k({ id: '20', nachname: 'Grote', kategorien: ['treiber', 'schuetze'] })
assert.deepEqual(entwurfVon(mitKat).kategorien, ['schuetze', 'treiber'])
assert.deepEqual(entwurfVon(mitKat).standard_tags, [])

// alsSpalten: leer ist ein leeres ARRAY, nicht NULL — die Spalte ist NOT NULL
// mit Vorgabe `{}`, ein null wuerde mit 23502 abgewiesen.
assert.deepEqual(alsSpalten(LEERER_ENTWURF).kategorien, [])
assert.deepEqual(alsSpalten(LEERER_ENTWURF).standard_tags, [])

// --- aenderungen: der Kern, an dem ein Array anders ist als ein String -------

// **Der Fall, gegen den der getrennte Zweig in aenderungen() gebaut ist.**
// Zwei Arrays sind nie `===`; ohne Inhaltsvergleich erzeugte jedes blosse
// Oeffnen-und-Speichern einen Patch auf beide Spalten — und ueberschriebe damit
// die Kategorie, die der Mitfuehrende gerade gesetzt hat.
assert.equal(aenderungen(entwurfVon(mitKat), mitKat), null, 'unveraendert heisst kein Patch')

// Die Reihenfolge in der Spalte ist ohne Belang: beide Seiten laufen durch
// dieselbe Normalisierung. Sonst meldete ein Kontakt, dessen Spalte in anderer
// Ordnung steht, bei jedem Oeffnen eine Aenderung.
const andersHerum = k({ id: '21', nachname: 'Grote', kategorien: ['schuetze', 'treiber'] })
assert.equal(
  aenderungen({ ...entwurfVon(andersHerum), kategorien: ['treiber', 'schuetze'] }, andersHerum),
  null,
  'Reihenfolge allein ist keine Aenderung',
)

// Eine echte Aenderung faehrt — und NUR sie. Der Patch darf `standard_tags`
// nicht mitschreiben, sonst ist der Schutz aus aenderungen() fuer die
// Mehrfachfelder wirkungslos.
assert.deepEqual(
  aenderungen({ ...entwurfVon(mitKat), kategorien: ['schuetze'] }, mitKat),
  { kategorien: ['schuetze'] },
)
// Alle Haken entfernen heisst ein leeres Array schreiben — und das IST eine
// Aenderung, so wie ein geleertes Textfeld NULL schreibt.
assert.deepEqual(aenderungen({ ...entwurfVon(mitKat), kategorien: [] }, mitKat), {
  kategorien: [],
})
// Textfeld und Mehrfachfeld gemeinsam: beide im selben Patch, keins verdraengt
// das andere. Der Mehrfach-Zweig laeuft vor der Textschleife und schreibt in
// dasselbe Objekt.
assert.deepEqual(
  aenderungen({ ...entwurfVon(mitKat), notiz: 'ruft vorher an', kategorien: [] }, mitKat),
  { kategorien: [], notiz: 'ruft vorher an' },
)
// Und die Gegenprobe zur Textschleife: sie darf die Arrays nicht ein zweites
// Mal anfassen (`Array.isArray`-continue). Ein `kategorien: "schuetze,treiber"`
// im Patch waere eine Zeichenkette in einer Enum-Spalte.
assert.equal(
  typeof (aenderungen({ ...entwurfVon(mitKat), kategorien: ['schuetze'] }, mitKat) ?? {})
    .kategorien,
  'object',
  'die Textschleife darf die Arrays nicht anfassen',
)

// --- Fixes auf die Fremdpruefung vom 03.08.2026 -----------------------------

// **A9: „nicht geladen" ist nicht „leer".** Beide Spalten sind NOT NULL mit
// Vorgabe `{}` — aus der DB kommt nie `undefined`, wohl aber aus einem
// `.select()`, das sie nicht mitnimmt. Ohne den Riegel zeigte der Inspektor
// eine leere Aufzaehlung, und der erste Klick schriebe genau diese Leere
// zurueck: stiller Verlust der echten Werte, mit Erfolgsmeldung.
const ungeladen = { ...k({ id: '30', nachname: 'Grote' }) } as Kontakt
// @ts-expect-error — genau der Zustand, den ein unvollstaendiges .select() erzeugt
delete ungeladen.kategorien
assert.equal(
  aenderungen({ ...entwurfVon(ungeladen), kategorien: ['schuetze'] }, ungeladen),
  null,
  'eine ungeladene Spalte darf NICHT gepatcht werden',
)
// Die Gegenprobe: geladen und leer IST patchbar — sonst waere der Riegel eine
// Sperre statt einer Unterscheidung.
const geladenLeer = k({ id: '31', nachname: 'Grote', kategorien: [] })
assert.deepEqual(
  aenderungen({ ...entwurfVon(geladenLeer), kategorien: ['schuetze'] }, geladenLeer),
  { kategorien: ['schuetze'] },
)

// **A11b: die Suche findet Kategorien und Funktionen** ueber ihre Beschriftung.
// Ohne das tippt man „Treiber" und findet niemanden, obwohl Kontakte so
// markiert sind — und wer 154 Zeilen einordnet, hat keine Kontrolle darueber.
const treiber = k({ id: '32', vorname: 'Anna', nachname: 'Beck', kategorien: ['treiber'] })
assert.equal(passtZuSuche(treiber, 'Treiber'), true)
assert.equal(passtZuSuche(treiber, 'treiber'), true, 'Grossschreibung egal')
assert.equal(passtZuSuche(treiber, 'Schütze'), false, 'nicht gesetzte Kategorie trifft nicht')
// Umlaute fallen auf beiden Seiten weg — „schutze" findet „Schütze".
const schuetze = k({ id: '33', nachname: 'Ahlwes', kategorien: ['schuetze'] })
assert.equal(passtZuSuche(schuetze, 'schutze'), true)
assert.equal(passtZuSuche(schuetze, 'Schütze'), true)
// Funktionen genauso.
const gl = k({ id: '34', nachname: 'Grote', standard_tags: ['gruppenleiter'] })
assert.equal(passtZuSuche(gl, 'Gruppenleiter'), true)
// UND-Verknuepfung ueber Feldgrenzen: Name + Kategorie zusammen.
assert.equal(passtZuSuche(treiber, 'beck treiber'), true)
assert.equal(passtZuSuche(treiber, 'beck schutze'), false)

// --- Massenzuordnung (Moritz' Wunsch vom 03.08.2026) ------------------------

const ohne = k({ id: '40', nachname: 'Grote' })
const schon = k({ id: '41', nachname: 'Grote', kategorien: ['schuetze'] })
const beides = k({ id: '42', nachname: 'Grote', kategorien: ['schuetze', 'treiber'] })

// Hinzufuegen ist ADDITIV — die Kategorien sind ausdruecklich mehrfach.
assert.deepEqual(zuordnungsPatch(ohne, 'schuetze', 'hinzufuegen'), ['schuetze'])
assert.deepEqual(zuordnungsPatch(schon, 'treiber', 'hinzufuegen'), ['schuetze', 'treiber'])
// Und zwar in Anzeigeordnung, egal in welcher Reihenfolge zugewiesen wurde.
assert.deepEqual(
  zuordnungsPatch(k({ id: '43', nachname: 'G', kategorien: ['treiber'] }), 'schuetze', 'hinzufuegen'),
  ['schuetze', 'treiber'],
)

// **`null` heisst „nicht schreiben".** Bei 154 Zeilen ist das der Unterschied
// zwischen 154 Requests und drei — und ein Patch, der denselben Wert
// zurueckschreibt, ueberschreibt nebenbei, was ein Mitfuehrender gerade gesetzt
// hat.
assert.equal(zuordnungsPatch(schon, 'schuetze', 'hinzufuegen'), null, 'schon drin')
assert.equal(zuordnungsPatch(ohne, 'schuetze', 'entfernen'), null, 'gar nicht drin')

// Entfernen nimmt NUR die eine Marke.
assert.deepEqual(zuordnungsPatch(beides, 'treiber', 'entfernen'), ['schuetze'])
assert.deepEqual(zuordnungsPatch(beides, 'schuetze', 'entfernen'), ['treiber'])
// Die letzte zu entfernen ergibt ein leeres Array, nicht null — die Spalte ist
// NOT NULL, und „keine Kategorie" ist ein gueltiger Zustand.
assert.deepEqual(zuordnungsPatch(schon, 'schuetze', 'entfernen'), [])

// Ein ungeladenes oder unbekanntes Feld stuerzt nicht ab.
assert.deepEqual(zuordnungsPatch({ kategorien: undefined as never }, 'treiber', 'hinzufuegen'), ['treiber'])
assert.deepEqual(
  zuordnungsPatch({ kategorien: ['buchhalter'] as never }, 'treiber', 'hinzufuegen'),
  ['treiber'],
  'Unbekanntes faellt weg statt in die Enum-Spalte zu laufen',
)

// Hin und zurueck stellt den Ausgangszustand her — sonst waere ein Fehlgriff
// bei 40 Zeilen nicht zu heilen.
for (const kat of KATEGORIEN) {
  const drauf = zuordnungsPatch(beides, kat.wert, 'hinzufuegen') ?? beides.kategorien
  const runter = zuordnungsPatch({ kategorien: drauf }, kat.wert, 'entfernen') ?? drauf
  const erwartet = beides.kategorien.filter((x) => x !== kat.wert)
  assert.deepEqual(runter, erwartet, `${kat.wert} hin und zurueck`)
}

// --- Die Beschriftung des Zuordnen-Knopfes (Entwurf B, 04.08.2026) ----------
// Sie traegt die ganze Bedeutung der Handlung: WELCHE Kategorie, an WIE VIELE,
// in welche RICHTUNG. „Kategorie hinzufuegen" liess alle drei offen — das war
// Moritz' Befund. Deshalb steht sie unter Test und nicht als Ternaer im JSX.

// Ohne Auswahl nennt der Knopf die fehlende Vorbedingung, nicht die Handlung.
// Ein gesperrter Knopf, der „zu 0 Gaesten hinzufuegen" verspricht, sagt nicht,
// was fehlt.
assert.equal(zuordnungLabel('schuetze', 0, 'hinzufuegen'), 'Erst Gäste markieren')
assert.equal(zuordnungLabel('treiber', 0, 'entfernen'), 'Erst Gäste markieren')

// Singular. „zu 1 Gaesten" liest sich als Fehler und laesst an der Zahl
// zweifeln, die daneben die Wirkung eines Sammelklicks ausweist.
assert.equal(zuordnungLabel('schuetze', 1, 'hinzufuegen'), '„Schütze" zu 1 Gast hinzufügen')
assert.equal(zuordnungLabel('schuetze', 1, 'entfernen'), '„Schütze" von 1 Gast entfernen')

assert.equal(zuordnungLabel('treiber', 12, 'hinzufuegen'), '„Treiber" zu 12 Gästen hinzufügen')
assert.equal(zuordnungLabel('treiber', 12, 'entfernen'), '„Treiber" von 12 Gästen entfernen')

// Die Richtung MUSS im Text stehen und die beiden duerfen sich nie gleichen —
// sonst ist der Rueckweg nicht vom Hinweg zu unterscheiden.
for (const kat of KATEGORIEN) {
  for (const n of [1, 2, 40, 154]) {
    const hin = zuordnungLabel(kat.wert, n, 'hinzufuegen')
    const zurueck = zuordnungLabel(kat.wert, n, 'entfernen')
    assert.notEqual(hin, zurueck, `${kat.wert}/${n}: Richtung nicht unterscheidbar`)
    for (const text of [hin, zurueck]) {
      assert.ok(text.includes(kat.label), `${text}: Kategorie fehlt`)
      assert.ok(text.includes(String(n)), `${text}: Anzahl fehlt`)
    }
    assert.ok(hin.includes('hinzufügen'), hin)
    assert.ok(zurueck.includes('entfernen'), zurueck)
  }
}

// Jede Kategorie hat eine Beschriftung — ein durchgereichter Enum-Wert im Knopf
// („schweisshundfuehrer zu 12 Gaesten hinzufuegen") waere sichtbar falsch.
for (const kat of KATEGORIEN) {
  assert.equal(kategorieLabel(kat.wert), kat.label)
  assert.notEqual(kategorieLabel(kat.wert), kat.wert, `${kat.wert}: Enum-Wert statt Label`)
}

// --- Der Riegel gegen lautloses Ueberschreiben (Schlusslesung 04.08.2026, 7) --
// `inaktiv_seit` darf NIE im Formular-Patch stehen. Das Formular schreibt
// mehrere Felder auf einmal, und zwei Personen fuehren dieselbe Liste (085):
// naehme der Patch die Spalte mit, ueberschriebe ein
// Oeffnen-Bearbeiten-Speichern des einen lautlos die Stilllegung des anderen.
// Compare-and-Swap gibt es nicht — getrennte Schreibwege sind der Ersatz.
//
// Der Test steht hier, weil der Fehler beim ERWEITERN entsteht, nicht heute:
// wer `inaktiv_seit` als Feld in FELDER oder MEHRFACH eintraegt, faellt hier
// auf, statt es in der Produktion zu tun.
const stillgelegt = k({
  id: 's1',
  vorname: 'Werner',
  nachname: 'Baron v. Buchholtz',
  inaktiv_seit: '2026-08-04T07:49:32.721Z',
})
assert.equal(
  Object.keys(alsSpalten(entwurfVon(stillgelegt))).includes('inaktiv_seit'),
  false,
  'inaktiv_seit gehoert NICHT in alsSpalten() — s. Kommentar',
)
assert.equal(
  Object.prototype.hasOwnProperty.call(entwurfVon(stillgelegt), 'inaktiv_seit'),
  false,
  'inaktiv_seit gehoert NICHT in den Entwurf',
)
// **Eine Zeile statt zwoelf Durchlaeufen** (Ponytail-Lesung 04.08.2026):
// `aenderungen()` baut seinen Patch aus `Object.keys(alsSpalten(e))`, ein
// Schluessel ausserhalb von `Entwurf` ist strukturell unmoeglich. Die zwoelf
// Durchlaeufe prueften also zwoelfmal dieselbe Tatsache. Die beiden
// Zusicherungen oben fallen in genau dem Szenario, das der Kommentar nennt:
// jemand traegt `inaktiv_seit` in `Entwurf`/`FELDER`/`MEHRFACH` ein.
//
// Eine Positivkontrolle bleibt, damit der Test nicht durch eine leere Menge
// gruen wird — genau der Fehler, den sein erster Anlauf hatte.
const einPatch = aenderungen({ ...entwurfVon(stillgelegt), kuerzel: 'WvB2' }, stillgelegt)
assert.deepEqual(einPatch, { kuerzel: 'WvB2' }, 'Positivkontrolle: der Patch traegt genau das Feld')

// ===========================================================================
// Chronik Söder (A-C3)
// ===========================================================================
// Die Zahlen sind die echten aus der Produktion (Stand 07.08.2026, nach
// Migration 110 und den Import-Stufen 1-4), damit der Test nicht gegen
// erfundene Daten gruen wird.
const CHRISTIAN = 'c-christian'
const JHL = 'c-jhl'

const rangliste: Chronikzeile[] = [
  { kontakt_id: CHRISTIAN, art_text: 'Sauen', jagdjahr: null, anzahl: 210 },
  { kontakt_id: CHRISTIAN, art_text: 'D&R&F', jagdjahr: null, anzahl: 134 },
  { kontakt_id: JHL, art_text: 'Sauen', jagdjahr: null, anzahl: 168 },
  { kontakt_id: JHL, art_text: 'D&R&F', jagdjahr: null, anzahl: 144 },
  // Kollektivzeile des Papiers: gehoert in die Soeder-Summe, aber zu keinem
  // Menschen. Muss herausfallen.
  { kontakt_id: null, art_text: 'Sauen', jagdjahr: null, anzahl: 54 },
]
const familie: Chronikzeile[] = [
  { kontakt_id: JHL, art_text: 'Sauen', jagdjahr: 2024, anzahl: 3 },
  { kontakt_id: JHL, art_text: 'Sauen', jagdjahr: 2025, anzahl: 8 },
  { kontakt_id: JHL, art_text: 'Rehwild', jagdjahr: 2025, anzahl: 2 },
]

const chronik = chronikNachKontakt(rangliste, familie)

assert.deepEqual(
  chronik[CHRISTIAN].soeder,
  [{ art: 'Sauen', anzahl: 210 }, { art: 'D&R&F', anzahl: 134 }],
  'Christian: beide Arten, nach Menge sortiert',
)
assert.equal(chronik[CHRISTIAN].soederGesamt, 344, 'Christian: 210 + 134')
assert.deepEqual(chronik[CHRISTIAN].jahre, [], 'Christian hat KEINE Jahresachse — rangliste_soeder sind Lebenssummen')
assert.equal(chronik[CHRISTIAN].jahreGesamt, 0, 'und damit auch keine Jahressumme')

// **Die Probe, auf die es ankommt: die beiden Projektionen bleiben getrennt.**
// Wuerde irgendwo addiert, stuende hier 312 + 13 = 325 statt zweier Zahlen.
assert.equal(chronik[JHL].soederGesamt, 312, 'JHL in Soeder: 168 + 144')
assert.equal(chronik[JHL].jahreGesamt, 13, 'JHL ueber alle Reviere (Ausschnitt): 3 + 8 + 2')
// **Die vorige Fassung war eine Tautologie** (Schlusslesung 07.08.2026):
// `a !== a + b` kann nur fallen, wenn b gleich 0 ist — sie prueft nichts, was
// die beiden Zusicherungen darueber nicht schon haerter pruefen. Eine
// Zusicherung, die nie rot werden kann, ist ein Kommentar mit Zeremonie.
// Was stattdessen wirklich faellt: jemand ergaenzt ein Feld, das beide
// Projektionen zusammenzieht. Genau das ist der Fehler, gegen den §3 steht.
assert.deepEqual(
  Object.keys(chronik[JHL]).sort(),
  ['jahre', 'jahreGesamt', 'soeder', 'soederGesamt'],
  'ChronikEintrag traegt KEIN Feld, das ueber die Projektionen hinweg summiert',
)

assert.deepEqual(
  chronik[JHL].jahre.map((j) => j.jahr),
  [2025, 2024],
  'Jahre: neueste Saison zuerst',
)
assert.deepEqual(
  chronik[JHL].jahre[0].arten,
  [{ art: 'Sauen', anzahl: 8 }, { art: 'Rehwild', anzahl: 2 }],
  '2025/26: beide Arten, nach Menge',
)
assert.equal(chronik[JHL].jahre[0].summe, 10, '2025/26 gesamt')

// Die Kollektivzeile hat keinen eigenen Eintrag erzeugt.
assert.deepEqual(Object.keys(chronik).sort(), [CHRISTIAN, JHL].sort(),
  'Zeilen ohne kontakt_id erzeugen keinen Eintrag')
// Positivkontrolle, damit der Test nicht durch eine leere Abbildung gruen wird.
assert.equal(Object.keys(chronik).length, 2, 'zwei Kontakte, nicht null')

// Ein Kontakt ohne jede Chronikzeile hat keinen Eintrag — der Block wird dann
// gar nicht gezeigt (204 von 256 Kontakten).
assert.equal(chronik['c-gibtesnicht'], undefined, 'ohne Chronik kein Eintrag')

assert.equal(alsSaison(1993), '1993/94', 'Saison: Anfangsjahr benennt sie')
assert.equal(alsSaison(1999), '1999/00', 'Saison ueber den Jahrhundertwechsel')
assert.equal(alsSaison(2009), '2009/10', 'Saison mit fuehrender Null')
assert.equal(alsSaison(2025), '2025/26', 'letzte Saison der Chronik')

// **Sauen stehen oben, AUCH wenn sie die kleinere Zahl sind.** Die Proben
// weiter oben belegen die Regel NICHT — dort sind Sauen zufaellig ohnehin
// groesser, der Test waere mit und ohne Rangfolge gruen. Genau diese Sorte
// Zusicherung bestaetigt die Daten und nicht die Logik.
const wenigSauen = chronikNachKontakt(
  [
    { kontakt_id: 'c-x', art_text: 'D&R&F', jagdjahr: null, anzahl: 99 },
    { kontakt_id: 'c-x', art_text: 'Sauen', jagdjahr: null, anzahl: 1 },
  ],
  [
    { kontakt_id: 'c-x', art_text: 'Rehwild', jagdjahr: 2020, anzahl: 40 },
    { kontakt_id: 'c-x', art_text: 'Sauen', jagdjahr: 2020, anzahl: 2 },
  ],
)
assert.deepEqual(
  wenigSauen['c-x'].soeder.map((a) => a.art),
  ['Sauen', 'D&R&F'],
  'Sauen stehen oben, obwohl 1 < 99',
)
assert.deepEqual(
  wenigSauen['c-x'].jahre[0].arten.map((a) => a.art),
  ['Sauen', 'Rehwild'],
  'auch im Jahresblock: Sauen oben, obwohl 2 < 40',
)
// Positivkontrolle: unterhalb der Sonderstellung gilt weiter die Menge.
const dreiArten = chronikNachKontakt([], [
  { kontakt_id: 'c-y', art_text: 'Fuechse', jagdjahr: 2020, anzahl: 3 },
  { kontakt_id: 'c-y', art_text: 'Damwild', jagdjahr: 2020, anzahl: 7 },
  { kontakt_id: 'c-y', art_text: 'Sauen', jagdjahr: 2020, anzahl: 1 },
])
assert.deepEqual(
  dreiArten['c-y'].jahre[0].arten.map((a) => a.art),
  ['Sauen', 'Damwild', 'Fuechse'],
  'Sauen zuerst, der Rest nach Menge',
)
