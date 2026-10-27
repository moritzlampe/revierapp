// Gegenprobe für `regeln.ts`. Die Fälle sind die aus der App —
// quickhunt-native `src/lib/hunt/__tests__/freigabe.test.ts` und
// `sicht.test.ts`, Stand 26.10.2026 —, damit die Kopie hier dasselbe
// verspricht wie das Original. Wer dort einen Fall ändert, ändert ihn hier mit.
//
//   node --experimental-strip-types app/zentrale/jagden/[id]/regeln.selftest.ts
//
// Läuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
import assert from 'node:assert/strict'
import {
  abgelehntMitCode,
  alsFeldtext,
  jagdregelnGeaendert,
  pruefeVorlagen,
  regelnZumSpeichern,
  speicherAusgang,
  vorlageEinfuegen,
  type RegelVorlage,
  freigabeBloecke,
  freigabeText,
  hatGewicht,
  pruefeFreigabe,
  pruefeFreigabeRegeln,
  pruefeJagdregeln,
  regelBloecke,
  regelPunkte,
  sichtAusZeile,
  sichtEnthaelt,
  sichtLesetext,
  sichtSpalte,
  sichtText,
  sortiereNachWildart,
  umkreisOptionen,
  type FreigabeRegel,
  type FreigabeZeile,
  type KatalogArt,
} from './regeln.ts'

const server = (extra: Partial<FreigabeZeile> = {}): FreigabeZeile => ({
  wildart_id: 'ul',
  name: 'Überläufer',
  geschlecht: null,
  gewicht_min: null,
  gewicht_max: null,
  ...extra,
})

// --- pruefeFreigabe: null = nicht eingetragen, Unlesbares = UNBEKANNT -------
assert.equal(pruefeFreigabe(null), null)
{
  const liste = [server({ geschlecht: 'maennlich', gewicht_max: 50 })]
  assert.deepEqual(pruefeFreigabe(liste), liste)
}
assert.equal(pruefeFreigabe(undefined), undefined)
assert.equal(pruefeFreigabe({}), undefined)
assert.equal(pruefeFreigabe([{ wildart_id: 'x' }]), undefined)
assert.equal(pruefeFreigabe([server({ geschlecht: 'unbekannt' as never })]), undefined)
assert.equal(pruefeFreigabe([server({ gewicht_min: Number.NaN })]), undefined)
assert.equal(pruefeFreigabe([null]), undefined)

assert.equal(pruefeJagdregeln('Kein Schuss über die Kuppe'), 'Kein Schuss über die Kuppe')
assert.equal(pruefeJagdregeln(null), null)
assert.equal(pruefeJagdregeln(42), undefined)

// --- freigabeText / hatGewicht ----------------------------------------------
assert.equal(freigabeText(server({ name: 'Schwarzwild' })), 'Schwarzwild')
assert.equal(freigabeText(server({ geschlecht: 'maennlich', gewicht_max: 50 })), 'Überläufer · männlich · bis 50 kg')
assert.equal(freigabeText(server({ geschlecht: 'weiblich', gewicht_min: 30 })), 'Überläufer · weiblich · ab 30 kg')
assert.equal(freigabeText(server({ gewicht_min: 30, gewicht_max: 50 })), 'Überläufer · 30–50 kg')
assert.equal(hatGewicht([server()]), false)
assert.equal(hatGewicht([server(), server({ gewicht_min: 20 })]), true)

// --- regelPunkte (CN-343) ---------------------------------------------------
assert.deepEqual(regelPunkte('• Kein Schuss\nSauen bis 50 kg\n•Hahn in Ruh'), [
  'Kein Schuss',
  'Sauen bis 50 kg',
  'Hahn in Ruh',
])
assert.deepEqual(regelPunkte('Absatz\n\n  • \n Absatz  '), ['Absatz', 'Absatz'])
assert.deepEqual(regelPunkte('• A • B'), ['A • B'])
// Ein selbst getipptes „•" bleibt stehen (App: „über mehrere Rundreisen", Codex CN-343).
assert.deepEqual(regelPunkte('• • A\n• •\n• ••\n• •B'), ['• A', '•', '••', '•B'])

// --- nach Wildart (CN-347) --------------------------------------------------
{
  const KATALOG: ReadonlyMap<string, KatalogArt> = new Map([
    ['rw', { name: 'Rotwild', elternId: null }],
    ['rk', { name: 'Rotkalb', elternId: 'rw' }],
    ['rs', { name: 'Rotschmaltier', elternId: 'rw' }],
    ['sw', { name: 'Schwarzwild', elternId: null }],
    ['fr', { name: 'Frischling', elternId: 'sw' }],
    ['ul', { name: 'Überläufer', elternId: 'sw' }],
    ['fu', { name: 'Fuchs', elternId: null }],
  ])
  const z = (wildart_id: string, name: string, extra: Partial<FreigabeZeile> = {}): FreigabeZeile => ({
    wildart_id,
    name,
    geschlecht: null,
    gewicht_min: null,
    gewicht_max: null,
    ...extra,
  })
  const TEST_REGELN = [
    z('rk', 'Rotkalb', { geschlecht: 'maennlich' }),
    z('fr', 'Frischling', { gewicht_min: 12, gewicht_max: 40 }),
    z('ul', 'Überläufer', { gewicht_max: 50 }),
    z('rs', 'Rotschmaltier'),
  ]

  assert.deepEqual(
    sortiereNachWildart(TEST_REGELN, KATALOG).map((x) => x.name),
    ['Rotkalb', 'Rotschmaltier', 'Frischling', 'Überläufer'],
  )
  assert.deepEqual(
    sortiereNachWildart(
      [
        z('fu', 'Fuchs'),
        z('ul', 'Überläufer', { geschlecht: 'maennlich', gewicht_min: 80 }),
        z('ul', 'Überläufer', { geschlecht: 'maennlich', gewicht_max: 50 }),
        z('rw', 'Rotwild'),
      ],
      KATALOG,
    ).map(freigabeText),
    ['Fuchs', 'Rotwild', 'Überläufer · männlich · ab 80 kg', 'Überläufer · männlich · bis 50 kg'],
  )
  assert.deepEqual(
    sortiereNachWildart(TEST_REGELN, new Map()).map((x) => x.name),
    ['Frischling', 'Rotkalb', 'Rotschmaltier', 'Überläufer'],
  )

  assert.deepEqual(freigabeBloecke(TEST_REGELN, KATALOG), [
    { titel: 'Rotwild', zeilen: ['Rotkalb · männlich', 'Rotschmaltier'], regeln: [] },
    { titel: 'Schwarzwild', zeilen: ['Frischling · 12–40 kg', 'Überläufer · bis 50 kg'], regeln: [] },
  ])
  assert.deepEqual(
    freigabeBloecke([z('sw', 'Schwarzwild', { gewicht_max: 80 }), z('rw', 'Rotwild'), z('fu', 'Fuchs')], KATALOG),
    [
      { titel: 'Fuchs', zeilen: [], regeln: [] },
      { titel: 'Rotwild', zeilen: ['alle'], regeln: [] },
      { titel: 'Schwarzwild', zeilen: ['alle · bis 80 kg'], regeln: [] },
    ],
  )
  assert.deepEqual(freigabeBloecke([z('fu', 'Fuchs', { geschlecht: 'weiblich' })], KATALOG), [
    { titel: 'Fuchs', zeilen: ['weiblich'], regeln: [] },
  ])
  // Fuchs ganz UND Fuchs weiblich: „alle" bleibt stehen (ODER).
  assert.deepEqual(freigabeBloecke([z('fu', 'Fuchs'), z('fu', 'Fuchs', { geschlecht: 'weiblich' })], KATALOG), [
    { titel: 'Fuchs', zeilen: ['alle', 'weiblich'], regeln: [] },
  ])
  // Oberart fehlt im Katalog: Klassen stehen für sich, kein doppelter Block.
  const ohneSchwarzwild = new Map([...KATALOG].filter(([id]) => id !== 'sw'))
  assert.deepEqual(
    freigabeBloecke([z('fr', 'Frischling'), z('fu', 'Fuchs'), z('ul', 'Überläufer')], ohneSchwarzwild),
    [
      { titel: 'Frischling', zeilen: [], regeln: [] },
      { titel: 'Fuchs', zeilen: [], regeln: [] },
      { titel: 'Überläufer', zeilen: [], regeln: [] },
    ],
  )
}

// --- Regeln je Wildart (CN-348) ---------------------------------------------
{
  const KATALOG: ReadonlyMap<string, KatalogArt> = new Map([
    ['rw', { name: 'Rotwild', elternId: null }],
    ['rk', { name: 'Rotkalb', elternId: 'rw' }],
    ['sw', { name: 'Schwarzwild', elternId: null }],
    ['ul', { name: 'Überläufer', elternId: 'sw' }],
    ['fu', { name: 'Fuchs', elternId: null }],
  ])
  const z = (wildart_id: string, name: string): FreigabeZeile => ({
    wildart_id,
    name,
    geschlecht: null,
    gewicht_min: null,
    gewicht_max: null,
  })
  const ROTWILD: FreigabeRegel = { wildart_id: 'rw', name: 'Rotwild', regeln: '• Aus Rudeln nur Kälber\n• Kalb vor Alttier' }
  const FUCHS: FreigabeRegel = { wildart_id: 'fu', name: 'Fuchs', regeln: '• Nur Jungfüchse' }

  assert.deepEqual(pruefeFreigabeRegeln([ROTWILD]), [ROTWILD])
  assert.equal(pruefeFreigabeRegeln(null), null)
  assert.equal(pruefeFreigabeRegeln(undefined), undefined)
  assert.equal(pruefeFreigabeRegeln('x'), undefined)
  assert.equal(pruefeFreigabeRegeln([{ wildart_id: 'rw', name: 'Rotwild' }]), undefined)
  assert.equal(pruefeFreigabeRegeln([ROTWILD, null]), undefined)

  assert.deepEqual(freigabeBloecke([z('rk', 'Rotkalb'), z('fu', 'Fuchs')], KATALOG, [FUCHS, ROTWILD]), [
    { titel: 'Fuchs', zeilen: [], regeln: ['Nur Jungfüchse'] },
    { titel: 'Rotwild', zeilen: ['Rotkalb'], regeln: ['Aus Rudeln nur Kälber', 'Kalb vor Alttier'] },
  ])
  // Eine Regel ohne Block steht am Ende, nie versteckt (S4).
  assert.deepEqual(freigabeBloecke([z('fu', 'Fuchs')], KATALOG, [ROTWILD]), [
    { titel: 'Fuchs', zeilen: [], regeln: [] },
    { titel: 'Rotwild', zeilen: [], regeln: ['Aus Rudeln nur Kälber', 'Kalb vor Alttier'] },
  ])
  assert.deepEqual(regelBloecke([ROTWILD, FUCHS]).map((b) => b.titel), ['Fuchs', 'Rotwild'])
}

// --- Sicht (141) ------------------------------------------------------------
assert.deepEqual(
  sichtAusZeile({ schuetzen_sicht: 'umkreis', sicht_umkreis_m: 300, gruppenleiter_sicht: 'wie_schuetzen' }),
  { schuetzen: 'umkreis', umkreisM: 300, gruppenleiter: 'wie_schuetzen' },
)
assert.equal(sichtAusZeile({ schuetzen_sicht: 'gruppe', sicht_umkreis_m: 300, gruppenleiter_sicht: 'alles' }), undefined)
assert.equal(sichtAusZeile({ schuetzen_sicht: 'alles', sicht_umkreis_m: 49, gruppenleiter_sicht: 'alles' }), undefined)
assert.equal(sichtAusZeile({ schuetzen_sicht: 'alles', sicht_umkreis_m: 300.5, gruppenleiter_sicht: 'alles' }), undefined)
assert.equal(sichtAusZeile({ schuetzen_sicht: 'alles', sicht_umkreis_m: 300 }), undefined)
// Die Obergrenze des CHECK (2000 m) ist gültig — in der App über `pruefeSicht`.
assert.deepEqual(sichtAusZeile({ schuetzen_sicht: 'eigener', sicht_umkreis_m: 2000, gruppenleiter_sicht: 'alles' }), {
  schuetzen: 'eigener',
  umkreisM: 2000,
  gruppenleiter: 'alles',
})

assert.deepEqual(umkreisOptionen(300).map((o) => o.value), [100, 200, 300, 500])
assert.deepEqual(umkreisOptionen(750).map((o) => o.value), [100, 200, 300, 500, 750])
assert.deepEqual(umkreisOptionen(50).map((o) => o.label), ['50 m', '100 m', '200 m', '300 m', '500 m'])

assert.equal(sichtText({ schuetzen: 'umkreis', umkreisM: 200, gruppenleiter: 'alles' }), 'Umkreis 200 m')
assert.equal(sichtText({ schuetzen: 'eigener', umkreisM: 300, gruppenleiter: 'alles' }), 'Nur eigener Stand')
assert.equal(sichtText({ schuetzen: 'alles', umkreisM: 300, gruppenleiter: 'alles' }), 'Alles')
// Der Zusatz nur, wenn die Stufe nicht ohnehin „alles" ist (SichtBlock.tsx).
assert.equal(sichtLesetext({ schuetzen: 'alles', umkreisM: 300, gruppenleiter: 'alles' }), 'Alles')
assert.equal(
  sichtLesetext({ schuetzen: 'eigener', umkreisM: 300, gruppenleiter: 'alles' }),
  'Nur eigener Stand · Gruppenleiter sehen alles',
)
assert.equal(sichtLesetext({ schuetzen: 'umkreis', umkreisM: 200, gruppenleiter: 'wie_schuetzen' }), 'Umkreis 200 m')

// Eine Änderung schreibt genau EINE Spalte (S6) — Portal-eigen, wie `speichereJagdSicht()`.
assert.deepEqual(sichtSpalte({ feld: 'schuetzen', wert: 'eigener' }), { schuetzen_sicht: 'eigener' })
assert.deepEqual(sichtSpalte({ feld: 'umkreisM', wert: 200 }), { sicht_umkreis_m: 200 })
assert.deepEqual(sichtSpalte({ feld: 'gruppenleiter', wert: 'wie_schuetzen' }), { gruppenleiter_sicht: 'wie_schuetzen' })
{
  const s = { schuetzen: 'umkreis', umkreisM: 300, gruppenleiter: 'alles' } as const
  assert.equal(sichtEnthaelt(s, { feld: 'umkreisM', wert: 300 }), true)
  assert.equal(sichtEnthaelt(s, { feld: 'umkreisM', wert: 200 }), false)
  assert.equal(sichtEnthaelt(s, { feld: 'gruppenleiter', wert: 'wie_schuetzen' }), false)
}

// ── P1b: Jagdregeln bearbeiten ───────────────────────────────────────────────
// Fälle aus `freigabe.test.ts` (regelnZumSpeichern) und `vorlagen.test.ts`
// (pruefeVorlagen, vorlageEinfuegen), Stand 27.10.2026. Die Fälle von
// `ablehnungsGrund` stehen unten bei `speicherAusgang`, das ihn bildet.

// --- regelnZumSpeichern (CN-343) ---
// Ohne Inhalt wird es null — wie im Trigger.
assert.equal(regelnZumSpeichern([]), null)
assert.equal(regelnZumSpeichern(['']), null)
assert.equal(regelnZumSpeichern([' ', '\t', '\n']), null)
// Jede nicht leere Zeile wird ein Punkt, Leerraum am Rand fällt weg.
assert.equal(regelnZumSpeichern(['Kein Schuss ', '', ' Sauen bis 50 kg']), '• Kein Schuss\n• Sauen bis 50 kg')
// Eingefügte Zeilenumbrüche werden eigene Punkte.
assert.equal(regelnZumSpeichern(['A\nB']), '• A\n• B')
// Hin und zurück bleibt der gespeicherte Text gleich.
{
  const gespeichert = '• Kein Schuss\n• Sauen bis 50 kg'
  assert.equal(regelnZumSpeichern(regelPunkte(gespeichert)), gespeichert)
}
// Ein selbst getipptes „•" bleibt, auch über mehrere Rundreisen (Codex CN-343, Befund 1).
{
  const gespeichert = regelnZumSpeichern(['• A', '•', '••', '•B'])
  assert.equal(gespeichert, '• • A\n• •\n• ••\n• •B')
  assert.deepEqual(regelPunkte(gespeichert as string), ['• A', '•', '••', '•B'])
  assert.equal(regelnZumSpeichern(regelPunkte(gespeichert as string)), gespeichert)
}
// CRLF aus eingefügtem Text wird zu sauberen Punkten.
assert.equal(regelnZumSpeichern(['A\r\nB\r\n']), '• A\n• B')

// --- pruefeVorlagen ---
const ROTWILD: RegelVorlage = { titel: 'Rotwild', regeln: '• Aus Rudeln nur Kälber\n• Kalb vor Alttier' }
const DRUECKJAGD: RegelVorlage = { titel: 'Drückjagd', regeln: '• Kein Schuss über die Kuppe' }
// Nimmt eine Liste lesbarer Vorlagen, auch die leere.
assert.deepEqual(pruefeVorlagen([ROTWILD]), [ROTWILD])
assert.deepEqual(pruefeVorlagen([]), [])
// Macht aus Unlesbarem „unbekannt", nie „keine Vorlagen" (S4).
assert.equal(pruefeVorlagen(null), undefined)
assert.equal(pruefeVorlagen({}), undefined)
assert.equal(pruefeVorlagen([ROTWILD, 5]), undefined)
assert.equal(pruefeVorlagen([{ titel: 'x' }]), undefined)
assert.equal(pruefeVorlagen([{ titel: 3, regeln: 'a' }]), undefined)

// --- vorlageEinfuegen ---
// Hängt unten an, bestehende Zeilen bleiben.
assert.deepEqual(vorlageEinfuegen(['Nur mit Signalfarbe'], ROTWILD), [
  'Nur mit Signalfarbe',
  'Aus Rudeln nur Kälber',
  'Kalb vor Alttier',
])
// Lässt wortgleiche Regeln weg — auch bei zweimal derselben Vorlage.
{
  const einmal = vorlageEinfuegen([], ROTWILD)
  assert.deepEqual(vorlageEinfuegen(einmal, ROTWILD), einmal)
}
// Zerlegt ein mehrzeiliges Feld vor dem Vergleich (Codex C9).
assert.deepEqual(vorlageEinfuegen(['A\nAus Rudeln nur Kälber'], ROTWILD), ['A', 'Aus Rudeln nur Kälber', 'Kalb vor Alttier'])
// Räumt die leere Zeile eines leeren Editors weg.
assert.deepEqual(vorlageEinfuegen([''], DRUECKJAGD), ['Kein Schuss über die Kuppe'])

// --- Portal-eigen: abgelehntMitCode (nativ ungetestet) ---
assert.equal(abgelehntMitCode({ code: '22023' }), '22023')
// Ein leerer Code ist keiner — so meldet postgrest-js einen Netzfehler.
assert.equal(abgelehntMitCode({ code: '' }), null)
assert.equal(abgelehntMitCode({ message: 'Bad Request' }), null)
assert.equal(abgelehntMitCode(null), null)

// --- Portal-eigen: das Textfeld (E3) ---
// `null` öffnet ein leeres Feld (Codex 4a); sonst eine Regel je Zeile, ohne Punkt.
assert.equal(alsFeldtext(null), '')
assert.equal(alsFeldtext('• A\n• B'), 'A\nB')
// Rundreise: was das Feld zeigt, speichert sich als derselbe Text.
assert.equal(regelnZumSpeichern([alsFeldtext('• A\n• B')]), '• A\n• B')

// --- Portal-eigen: „geändert" vergleicht beide Seiten normalisiert (E3) ---
// Unverändert geöffnet ist nicht geändert — auch bei einem Servertext mit
// Leerzeilen oder ohne Punkte (vor CN-343).
assert.equal(jagdregelnGeaendert(regelnZumSpeichern([alsFeldtext('A\n\nB')]), 'A\n\nB'), false)
assert.equal(jagdregelnGeaendert(null, null), false)
assert.equal(jagdregelnGeaendert('• A', null), true)
assert.equal(jagdregelnGeaendert(null, '• A'), true)
assert.equal(jagdregelnGeaendert('• A\n• C', '• A\n• B'), true)

// --- Portal-eigen: Ausgänge beim Speichern (E6) ---
// Die Fehler haben die Form von `SchreibFehler` (`schreiben.ts`).
const fehler = (teil: Record<string, unknown>) => ({ keineZeile: false, code: null, status: null, grund: null, ...teil })
assert.deepEqual(speicherAusgang(fehler({ keineZeile: true, status: 200 })), { art: 'keineZeile' })
assert.deepEqual(speicherAusgang(fehler({ code: 'PGRST301', status: 401, grund: 'JWT expired' })), { art: 'abgemeldet' })
// 401 ohne Code (Antwort ohne PostgREST-JSON) ist ebenfalls abgelaufen.
assert.deepEqual(speicherAusgang(fehler({ status: 401 })), { art: 'abgemeldet' })
assert.deepEqual(
  speicherAusgang(fehler({ code: '42501', status: 403, grund: 'Freigabe und Jagdregeln einer beendeten Jagd sind fest' })),
  { art: 'abgelehnt', code: '42501', grund: ' — Freigabe und Jagdregeln einer beendeten Jagd sind fest' },
)
// Ohne Meldung (oder nur Leerraum) kein Zusatz — wie `ablehnungsGrund` der App.
assert.deepEqual(speicherAusgang(fehler({ code: '42501', status: 403 })), { art: 'abgelehnt', code: '42501', grund: '' })
assert.deepEqual(speicherAusgang(fehler({ code: '42501', grund: '  ' })), { art: 'abgelehnt', code: '42501', grund: '' })
// Den App-Satz nimmt das Portal heraus — es gibt hier keine App zu aktualisieren.
assert.deepEqual(
  speicherAusgang(fehler({ code: '22023', status: 400, grund: 'Für Rotwild stehen Regeln je Wildart. Bitte die App aktualisieren.' })),
  { art: 'abgelehnt', code: '22023', grund: ' — Für Rotwild stehen Regeln je Wildart.' },
)
// **Netzfehler (`code: ''`) ist KEINE Ablehnung** (Schlusslesung V2, F3).
assert.deepEqual(speicherAusgang(fehler({ code: '', status: 0, grund: 'TypeError: fetch failed' })), { art: 'keineAntwort' })
// Kante: `400` ohne PostgREST-Code.
assert.deepEqual(speicherAusgang(fehler({ status: 400, grund: 'Bad Request' })), { art: 'keineAntwort' })
// Ein fremder Fehler (Frist, Programmfehler) ist ebenfalls keine Antwort.
assert.deepEqual(speicherAusgang(new Error('Keine Antwort vom Server (15 s).')), { art: 'keineAntwort' })
assert.deepEqual(speicherAusgang(null), { art: 'keineAntwort' })
