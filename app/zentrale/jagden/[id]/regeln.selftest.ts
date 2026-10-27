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
  alsEntwurf,
  alsFreigabeArt,
  blockTextSetzen,
  entwurfBloecke,
  entwurfStand,
  fassung,
  fuegeHinzu,
  konfliktBeimHinzufuegen,
  pruefeEntwurf,
  pruefeFreigabeVersion,
  regelnZumSpeichernJeWildart,
  verwaisteRegeln,
  type EntwurfZeile,
  type FreigabeArt,
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
  gleicherTitel,
  neueVorlageFehler,
  VORLAGEN_MAX,
  vorlageFehler,
  vorlageMeldung,
  VorlageNichtGespeichert,
  vorlageSpeichern,
  type VorlagenClient,
  type VorlagenFilter,
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

// ════ P1c — Freigabe bearbeiten. Fälle aus `freigabe.test.ts`, Stand 27.10.2026 ════

const SCHWARZWILD: FreigabeArt = { id: 'sw', name: 'Schwarzwild', elternId: null, geschlechtImplizit: false }
const UEBERLAEUFER: FreigabeArt = { id: 'ul', name: 'Überläufer', elternId: 'sw', geschlechtImplizit: false }
const KEILER: FreigabeArt = { id: 'ke', name: 'Keiler', elternId: 'sw', geschlechtImplizit: true }
const FUCHS_ART: FreigabeArt = { id: 'fu', name: 'Fuchs', elternId: null, geschlechtImplizit: false }
const ROTWILD_ART: FreigabeArt = { id: 'rw', name: 'Rotwild', elternId: null, geschlechtImplizit: false }
const ROTKALB: FreigabeArt = { id: 'rk', name: 'Rotkalb', elternId: 'rw', geschlechtImplizit: false }
const ARTEN: ReadonlyMap<string, FreigabeArt> = new Map([
  ['rw', ROTWILD_ART],
  ['rk', ROTKALB],
  ['ul', UEBERLAEUFER],
  ['sw', SCHWARZWILD],
  ['fu', FUCHS_ART],
])
const ez = (art: FreigabeArt, extra: Partial<EntwurfZeile> = {}): EntwurfZeile => ({
  art,
  geschlecht: null,
  gewichtMin: '',
  gewichtMax: '',
  ...extra,
})
const ROTWILD_REGEL: FreigabeRegel = { wildart_id: 'rw', name: 'Rotwild', regeln: '• Aus Rudeln nur Kälber\n• Kalb vor Alttier' }
const FUCHS_REGEL: FreigabeRegel = { wildart_id: 'fu', name: 'Fuchs', regeln: '• Nur Jungfüchse' }

// --- pruefeFreigabeVersion: ganze Zahl ab 0, sonst unbekannt ---
assert.equal(pruefeFreigabeVersion(0), 0)
assert.equal(pruefeFreigabeVersion(7), 7)
assert.equal(pruefeFreigabeVersion(-1), undefined)
assert.equal(pruefeFreigabeVersion(1.5), undefined)
assert.equal(pruefeFreigabeVersion('3'), undefined)
assert.equal(pruefeFreigabeVersion(undefined), undefined)

// --- Oberart und Klassen schliessen sich aus ---
assert.equal(konfliktBeimHinzufuegen(UEBERLAEUFER, [ez(SCHWARZWILD)]), 'oberart-frei')
{
  const zeilen = [ez(UEBERLAEUFER), ez(FUCHS_ART)]
  assert.equal(konfliktBeimHinzufuegen(SCHWARZWILD, zeilen), 'ersetzt-klassen')
  assert.deepEqual(
    fuegeHinzu(zeilen, SCHWARZWILD).map((z) => z.art.id),
    ['fu', 'sw'],
  )
}
assert.equal(konfliktBeimHinzufuegen(FUCHS_ART, [ez(SCHWARZWILD)]), null)

// --- pruefeEntwurf ---
{
  const r = pruefeEntwurf([ez(UEBERLAEUFER, { geschlecht: 'maennlich', gewichtMax: '50' }), ez(FUCHS_ART)])
  assert.equal(r.gueltig, true)
  assert.deepEqual(r.wert, [
    { wildart_id: 'ul', name: 'Überläufer', geschlecht: 'maennlich', gewicht_min: null, gewicht_max: 50 },
    { wildart_id: 'fu', name: 'Fuchs', geschlecht: null, gewicht_min: null, gewicht_max: null },
  ])
}
assert.deepEqual(pruefeEntwurf([]), { fehler: [], wert: null, gueltig: true })
for (const [gewichtMin, gewichtMax] of [
  ['0', ''],
  ['', '1000'],
  ['47.5', ''],
  ['', 'NaN'],
  ['-3', ''],
  // Portal-eigen (E1: Textfeld statt `type="number"`): „1e2" darf nicht durch.
  ['1e2', ''],
]) {
  const r = pruefeEntwurf([ez(UEBERLAEUFER, { gewichtMin, gewichtMax })])
  assert.equal(r.gueltig, false, `${gewichtMin}/${gewichtMax}`)
  assert.match(r.fehler[0] ?? '', /ganzen kg/)
}
assert.match(pruefeEntwurf([ez(UEBERLAEUFER, { gewichtMin: '60', gewichtMax: '50' })]).fehler[0] ?? '', /grösser/)
assert.equal(pruefeEntwurf([ez(KEILER, { geschlecht: 'maennlich' })]).gueltig, false)
assert.deepEqual(pruefeEntwurf([ez(SCHWARZWILD), ez(UEBERLAEUFER)]).fehler, [
  null,
  'Die Oberart ist schon ganz freigegeben.',
])
assert.equal(
  pruefeEntwurf([
    ez(UEBERLAEUFER, { geschlecht: 'maennlich', gewichtMax: '50' }),
    ez(UEBERLAEUFER, { geschlecht: 'maennlich', gewichtMin: '80' }),
  ]).gueltig,
  true,
)
assert.equal(pruefeEntwurf([ez(UEBERLAEUFER), ez(UEBERLAEUFER)]).gueltig, false)
assert.equal(
  pruefeEntwurf([ez(UEBERLAEUFER, { geschlecht: 'maennlich' }), ez(UEBERLAEUFER, { geschlecht: 'weiblich' })]).gueltig,
  true,
)
{
  const viele = Array.from({ length: 41 }, (_, i) =>
    ez({ id: `a${i}`, name: `Art ${i}`, elternId: null, geschlechtImplizit: false }),
  )
  assert.equal(pruefeEntwurf(viele).gueltig, false)
  assert.equal(pruefeEntwurf(viele.slice(0, 40)).gueltig, true)
}

// --- alsEntwurf ---
assert.deepEqual(alsEntwurf([server({ gewicht_max: 50 })], new Map([['ul', UEBERLAEUFER]])), [
  { art: UEBERLAEUFER, geschlecht: null, gewichtMin: '', gewichtMax: '50' },
])
assert.deepEqual(alsEntwurf([server()], new Map())[0].art, {
  id: 'ul',
  name: 'Überläufer',
  elternId: null,
  geschlechtImplizit: false,
})

// --- fassung: unabhängig von der Schlüsselreihenfolge ---
{
  const umgestellt = {
    name: 'Überläufer',
    geschlecht: null,
    wildart_id: 'ul',
    gewicht_max: null,
    gewicht_min: null,
  } as FreigabeZeile
  assert.equal(fassung([umgestellt]), fassung([server()]))
}

// --- Regeln je Wildart im Editor ---
assert.deepEqual(entwurfBloecke([ez(ROTKALB), ez(FUCHS_ART), ez(ROTKALB, { geschlecht: 'weiblich' })], ARTEN), [
  { id: 'fu', name: 'Fuchs' },
  { id: 'rw', name: 'Rotwild' },
])
assert.deepEqual(verwaisteRegeln([ROTWILD_REGEL, FUCHS_REGEL], [ez(ROTKALB)]), [FUCHS_REGEL])
assert.deepEqual(verwaisteRegeln([ROTWILD_REGEL], [ez(ROTWILD_ART)]), [])
assert.deepEqual(verwaisteRegeln([ROTWILD_REGEL], []), [ROTWILD_REGEL])
// Oberart ersetzt Klassen: derselbe Block, die Regeln bleiben.
assert.deepEqual(verwaisteRegeln([ROTWILD_REGEL], fuegeHinzu([ez(ROTKALB)], ROTWILD_ART)), [])
assert.deepEqual(
  regelnZumSpeichernJeWildart([ROTWILD_REGEL, FUCHS_REGEL])?.map((r) => r.name),
  ['Fuchs', 'Rotwild'],
)
assert.equal(regelnZumSpeichernJeWildart([]), null)

// ════ P1c — Portal-eigen ════

// --- alsFreigabeArt ---
assert.deepEqual(alsFreigabeArt({ id: 'ke', name: 'Keiler', eltern_id: 'sw', geschlecht_implizit: 'maennlich' }), KEILER)
assert.equal(alsFreigabeArt({ id: 'fu', name: 'Fuchs', eltern_id: null, geschlecht_implizit: null }).geschlechtImplizit, false)

// --- entwurfStand ---
{
  const basis = { freigabe: [server({ wildart_id: 'rk', name: 'Rotkalb' })], regeln: [ROTWILD_REGEL], version: 4 }
  const zeilen = alsEntwurf(basis.freigabe, ARTEN)
  // Unverändert geöffnet ist nicht geändert.
  const offen = entwurfStand(zeilen, basis.regeln, ARTEN, basis)
  assert.equal(offen.geaendert, false)
  assert.deepEqual(offen.bloecke, [{ id: 'rw', name: 'Rotwild' }])
  assert.deepEqual(offen.sichtbareRegeln, [ROTWILD_REGEL])
  assert.deepEqual(offen.ausgeblendet, [])
  assert.equal(offen.regelZeichen, ROTWILD_REGEL.regeln.length)
  // Rotkalb entfernt: die Rotwild-Regeln bleiben im Zustand, werden aber
  // nicht gesendet und stehen als ausgeblendet da (E1 Schritt 5).
  const ohne = entwurfStand([], basis.regeln, ARTEN, basis)
  assert.equal(ohne.sichtbareRegeln, null)
  assert.deepEqual(ohne.ausgeblendet, [ROTWILD_REGEL])
  assert.equal(ohne.regelZeichen, 0)
  assert.equal(ohne.geaendert, true)
  // Kommt Rotwild zurück, ist der Text wieder da — und nichts geändert.
  assert.equal(entwurfStand(fuegeHinzu([], ROTKALB), basis.regeln, ARTEN, basis).geaendert, false)
  // Ein geändertes Gewicht ist eine Änderung.
  assert.equal(entwurfStand([{ ...zeilen[0], gewichtMax: '60' }], basis.regeln, ARTEN, basis).geaendert, true)
}
{
  // Der Summenzähler zählt über ALLE gesendeten Blöcke (Fable B1): einzeln
  // grün, zusammen zu lang.
  const lang = (id: string, name: string, n: number): FreigabeRegel => ({ wildart_id: id, name, regeln: 'x'.repeat(n) })
  const basis = { freigabe: null, regeln: null, version: 0 }
  const s = entwurfStand([ez(ROTWILD_ART), ez(SCHWARZWILD)], [lang('rw', 'Rotwild', 2500), lang('sw', 'Schwarzwild', 2000)], ARTEN, basis)
  assert.equal(s.regelZeichen, 4500)
  assert.equal(s.regelnZuLang, true)
  // Ein roher Block voller Leerzeilen zählt so lang, wie er gesendet wird und
  // der Server ihn zählt (5) — nicht neu gefasst als „• A\n• B" (7, Codex D1).
  const roh = entwurfStand([ez(FUCHS_ART)], [{ wildart_id: 'fu', name: 'Fuchs', regeln: 'A\n\n\nB' }], ARTEN, basis)
  assert.equal(roh.regelZeichen, 5)
  // UTF-16 wie die App (E3): ein Emoji zählt 2. 2000 Emoji = 4000 geht,
  // ein Zeichen mehr nicht (Codex P1c A5).
  const emoji = (n: number): FreigabeRegel[] => [{ wildart_id: 'fu', name: 'Fuchs', regeln: '🦊'.repeat(n) }]
  assert.equal(entwurfStand([ez(FUCHS_ART)], emoji(2000), ARTEN, basis).regelZeichen, 4000)
  assert.equal(entwurfStand([ez(FUCHS_ART)], emoji(2000), ARTEN, basis).regelnZuLang, false)
  const drueber = [{ wildart_id: 'fu', name: 'Fuchs', regeln: '🦊'.repeat(2000) + 'x' }]
  assert.equal(entwurfStand([ez(FUCHS_ART)], drueber, ARTEN, basis).regelnZuLang, true)
}
{
  // Leere Basis (`null`) gegen leeren Entwurf: nicht geändert.
  assert.equal(entwurfStand([], [], ARTEN, { freigabe: null, regeln: null, version: 0 }).geaendert, false)
  // Eine ungültige Zeile ist eine Änderung, auch wenn sie im Speicherwert
  // fehlt — sonst verwürfe „Schließen" sie ohne Rückfrage (Codex P1c A2/C-F2).
  const ungueltig = [ez(FUCHS_ART, { gewichtMin: '0' })]
  assert.equal(pruefeEntwurf(ungueltig).wert, null)
  assert.equal(entwurfStand(ungueltig, [], ARTEN, { freigabe: null, regeln: null, version: 0 }).geaendert, true)
}

// --- blockTextSetzen: unberührt bleibt roh, normal-gleich bleibt roh (E3) ---
{
  const rohGespeichert: FreigabeRegel = { wildart_id: 'fu', name: 'Fuchs', regeln: 'A\n\nB' }
  const block = { id: 'fu', name: 'Fuchs' }
  // Getippt und normalisiert gleich dem Gespeicherten → der rohe Eintrag bleibt.
  assert.deepEqual(blockTextSetzen([rohGespeichert], block, 'A\nB', [rohGespeichert]), [rohGespeichert])
  assert.deepEqual(blockTextSetzen([], block, 'A\n\nB ', [rohGespeichert]), [rohGespeichert])
  // Wirklich geändert → neu gefasst.
  assert.deepEqual(blockTextSetzen([rohGespeichert], block, 'A\nC', [rohGespeichert]), [
    { wildart_id: 'fu', name: 'Fuchs', regeln: '• A\n• C' },
  ])
  // Leer → Eintrag weg.
  assert.deepEqual(blockTextSetzen([rohGespeichert], block, ' \n ', [rohGespeichert]), [])
  // Andere Blöcke bleiben unberührt, roh.
  const rot: FreigabeRegel = { wildart_id: 'rw', name: 'Rotwild', regeln: 'X\n\nY' }
  assert.deepEqual(blockTextSetzen([rot], block, 'Neu', null), [
    rot,
    { wildart_id: 'fu', name: 'Fuchs', regeln: '• Neu' },
  ])
}

// ── P1d: Als Vorlage speichern ──────────────────────────────────────────────
// Fälle aus `src/lib/hunt/__tests__/vorlagen.test.ts` (Name, vorlageFehler)
// und `src/lib/data/__tests__/vorlagen.test.ts` (Schleife), Stand 27.10.2026.
// Portal-eigen: vergebener Name, nur `regel_vorlagen` im UPDATE, Meldungen.

// --- Name ---
// Vergleicht ohne Gross/Klein und ohne Rand.
assert.equal(gleicherTitel(' Rotwild ', 'rotwild'), true)
assert.equal(gleicherTitel('Rotwild', 'Rotwild II'), false)

// --- vorlageFehler ---
// Lässt eine gültige Vorlage durch.
assert.equal(vorlageFehler([], 'Rotwild', ROTWILD.regeln), null)
// Verlangt Regeln und einen Namen.
assert.match(vorlageFehler([], 'Rotwild', null) ?? '', /Keine Regel/)
assert.match(vorlageFehler([], '  ', ROTWILD.regeln) ?? '', /Name fehlt/)
assert.match(vorlageFehler([], 'x'.repeat(61), ROTWILD.regeln) ?? '', /zu lang/)
assert.match(vorlageFehler([], 'Rotwild', `• ${'a'.repeat(4000)}`) ?? '', /Zu lang/)
// Hält die Obergrenze — Ersetzen geht auch bei voller Liste.
const VOLL = Array.from({ length: VORLAGEN_MAX }, (_, i) => ({ titel: `V${i}`, regeln: '• a' }))
assert.match(vorlageFehler(VOLL, 'Neu', '• a') ?? '', /Höchstens/)
assert.equal(vorlageFehler(VOLL, 'v3', '• b'), null)

// --- neueVorlageFehler (Portal-eigen, E4): vergeben ist ein Fehler ---
// Nennt die gespeicherte Schreibweise und verweist aufs Ersetzen in der App.
assert.equal(
  neueVorlageFehler([ROTWILD], ' rotwild ', '• a'),
  'Eine Vorlage „Rotwild“ gibt es schon — wähl einen anderen Namen. Ersetzen geht in der App.',
)
// Auch bei voller Liste: vergeben, nicht „Höchstens" (beides stimmt, der Name ist der Grund).
assert.match(neueVorlageFehler(VOLL, 'v3', '• b') ?? '', /gibt es schon/)
assert.match(neueVorlageFehler(VOLL, 'Neu', '• b') ?? '', /Höchstens/)
// Ein leerer Name trifft nie eine Vorlage, sondern „Name fehlt".
assert.match(neueVorlageFehler([ROTWILD], '  ', '• a') ?? '', /Name fehlt/)
assert.equal(neueVorlageFehler([ROTWILD], 'Drückjagd', '• a'), null)

// --- vorlageSpeichern: Compare-and-Swap auf updated_at ---
// Attrappe wie in der App: jede Antwort aus einer Warteschlange, jeder Aufruf
// mit Art, Zeile und Filtern mitgeschrieben. **Ein Write ohne `.select()`
// bekommt keine Zeile zurück** — wie der echte Server (Codex P1d A-F4).
type Aufruf = { art: string; zeile?: unknown; filter: unknown[] }
type MockAntwort = { data: unknown; error: { message: string; code?: string } | null; status?: number }
function attrappe(antworten: MockAntwort[]) {
  const aufrufe: Aufruf[] = []
  const kette = (art: string, zeile?: unknown): VorlagenFilter => {
    const aufruf: Aufruf = { art, zeile, filter: [] }
    aufrufe.push(aufruf)
    const k: VorlagenFilter = {
      eq: (...f) => (aufruf.filter.push(['eq', ...f]), k),
      is: (...f) => (aufruf.filter.push(['is', ...f]), k),
      select: (spalten) => (aufruf.filter.push(['select', spalten]), k),
      maybeSingle: () => {
        const naechste = antworten.shift()
        if (!naechste) throw new Error('Attrappe: keine Antwort mehr')
        const ohneSelect = art !== 'lesen' && !aufruf.filter.some((f) => Array.isArray(f) && f[0] === 'select')
        return Promise.resolve(ohneSelect ? { data: null, error: null, status: 204 } : { status: 200, ...naechste })
      },
    }
    return k
  }
  const client: VorlagenClient = {
    from: () => ({
      select: () => kette('lesen'),
      insert: (zeile) => kette('einfuegen', zeile),
      update: (zeile) => kette('aendern', zeile),
    }),
  }
  return { client, aufrufe }
}
const VA = { titel: 'A', regeln: '• a' }
const VB = { titel: 'B', regeln: '• b' }
const VC = { titel: 'C', regeln: '• c' }
const gelesen = (vorlagen: unknown, marke: string | null = 't1') => ({
  data: { regel_vorlagen: vorlagen, updated_at: marke },
  error: null,
})
const zurueck = (vorlagen: unknown) => ({ data: { regel_vorlagen: vorlagen }, error: null })
/** Wirft `vorlageSpeichern`? Gibt den Fehler zurück, sonst scheitert die Probe. */
async function wirft(lauf: Promise<unknown>): Promise<unknown> {
  try {
    await lauf
  } catch (e) {
    return e
  }
  throw new Error('vorlageSpeichern hätte werfen müssen')
}

{
  // Ändert die Zeile nur mit der gelesenen Marke und schreibt NUR `regel_vorlagen` (E4).
  // jsonb ordnet Schlüssel um — der Vergleich darf daran nicht scheitern.
  const { client, aufrufe } = attrappe([gelesen([VA]), zurueck([VA, { regeln: '• b', titel: 'B' }])])
  assert.deepEqual(await vorlageSpeichern(client, 'u', ' B ', '• b'), [VA, VB])
  assert.deepEqual(aufrufe[1], {
    art: 'aendern',
    zeile: { regel_vorlagen: [VA, VB] },
    filter: [
      ['eq', 'user_id', 'u'],
      ['eq', 'updated_at', 't1'],
      ['select', 'regel_vorlagen'],
    ],
  })
}
{
  // Ohne Marke (`updated_at` null) prüft der Swap auf `is null`.
  const { client, aufrufe } = attrappe([gelesen([], null), zurueck([VB])])
  await vorlageSpeichern(client, 'u', 'B', '• b')
  assert.deepEqual(aufrufe[1].filter, [
    ['eq', 'user_id', 'u'],
    ['is', 'updated_at', null],
    ['select', 'regel_vorlagen'],
  ])
}
{
  // Abgeprallt (0 Zeilen): neu lesen, auf den NEUEN Stand anhängen.
  const { client, aufrufe } = attrappe([
    gelesen([VA]),
    { data: null, error: null },
    // Inzwischen hat ein anderes Gerät C gespeichert.
    gelesen([VA, VC], 't2'),
    zurueck([VA, VC, VB]),
  ])
  assert.deepEqual(await vorlageSpeichern(client, 'u', 'B', '• b'), [VA, VC, VB])
  assert.deepEqual(aufrufe[3].filter.at(-2), ['eq', 'updated_at', 't2'])
}
{
  // Abgeprallt, und im neuen Stand ist der Name vergeben → nichts geschrieben.
  const { client, aufrufe } = attrappe([gelesen([VA]), { data: null, error: null }, gelesen([VA, VB], 't2')])
  const e = await wirft(vorlageSpeichern(client, 'u', 'b', '• anders'))
  assert.ok(e instanceof VorlageNichtGespeichert)
  assert.match(vorlageMeldung(e), /„B“ gibt es schon/)
  assert.deepEqual(
    aufrufe.map((a) => a.art),
    ['lesen', 'aendern', 'lesen'],
  )
}
{
  // Ohne Zeile wird eingefügt — nur `user_id` und `regel_vorlagen`; ein 23505
  // heisst: inzwischen da, neue Runde, dann ändern.
  const { client, aufrufe } = attrappe([
    { data: null, error: null },
    { data: null, error: { message: 'duplicate key', code: '23505' } },
    gelesen([], 't3'),
    zurueck([VB]),
  ])
  assert.deepEqual(await vorlageSpeichern(client, 'u', 'B', '• b'), [VB])
  assert.deepEqual(
    aufrufe.map((a) => a.art),
    ['lesen', 'einfuegen', 'lesen', 'aendern'],
  )
  assert.deepEqual(aufrufe[1].zeile, { user_id: 'u', regel_vorlagen: [VB] })
  assert.deepEqual(aufrufe[1].filter, [['select', 'regel_vorlagen']])
}
{
  // Ohne Zeile, eingefügt und genau so zurück → Erfolg nach EINEM Write.
  const { client, aufrufe } = attrappe([{ data: null, error: null }, zurueck([VB])])
  assert.deepEqual(await vorlageSpeichern(client, 'u', 'B', '• b'), [VB])
  assert.equal(aufrufe.length, 2)
}
{
  // Auch beim EINFÜGEN: ein anderer Inhalt zurück ist kein Erfolg (S1).
  const { client, aufrufe } = attrappe([{ data: null, error: null }, zurueck([VA])])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /nicht gespeichert/)
  assert.deepEqual(
    aufrufe.map((a) => a.art),
    ['lesen', 'einfuegen'],
  )
}
{
  // Beim Einfügen ohne Zeile zurück: kein Erfolg, und KEINE neue Runde — die
  // fände ihren eigenen Namen und meldete „gibt es schon".
  const { client, aufrufe } = attrappe([
    { data: null, error: null },
    { data: null, error: null },
  ])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /nicht gespeichert/)
  assert.equal(aufrufe.length, 2)
}
{
  // Gibt nach GENAU drei abgeprallten Runden auf, statt still zu überschreiben:
  // sechs Anfragen, keine Antwort übrig (Codex P1d A-F3).
  const antworten: MockAntwort[] = []
  for (let i = 0; i < 3; i++) antworten.push(gelesen([], `t${i}`), { data: null, error: null })
  const { client, aufrufe } = attrappe(antworten)
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /woanders geändert/)
  assert.equal(aufrufe.length, 6)
  assert.equal(antworten.length, 0)
}
{
  // Kommt beim Ändern ein anderer Inhalt zurück, ist es kein Erfolg (S1).
  const { client } = attrappe([gelesen([]), zurueck([VA])])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /nicht gespeichert/)
}
{
  // Ein Fehler beim Schreiben wirft mit Code — als Ablehnung gemeldet.
  const { client } = attrappe([
    gelesen([]),
    { data: null, error: { message: 'new row violates check constraint', code: '23514' } },
  ])
  assert.equal(
    vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))),
    'Der Server hat abgelehnt (23514) — new row violates check constraint',
  )
}
{
  // Netz weg beim SCHREIBEN (`code: ''`, Status 0): keine gültige Antwort,
  // NICHT „abgelehnt ()" — ob der Write ankam, ist offen.
  const { client } = attrappe([
    gelesen([]),
    { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 },
  ])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /^Keine gültige Antwort/)
}
{
  // Netz weg oder Ablehnung beim LESEN: sicher nichts gespeichert, auch nach
  // einer abgeprallten Runde (Schlusslesung P1d F1).
  const netz = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }
  for (const antworten of [[netz], [gelesen([]), { data: null, error: null }, netz]] as MockAntwort[][]) {
    const { client } = attrappe(antworten)
    assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /nichts gespeichert/)
  }
  const { client } = attrappe([{ data: null, error: { message: 'boom', code: '57014' }, status: 500 }])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /nichts gespeichert/)
}
{
  // Anmeldung abgelaufen (PGRST301) bzw. 401 → eigene Meldung.
  const { client } = attrappe([{ data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 }])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /^Anmeldung abgelaufen/)
}
{
  // Leere Antwort mit anderem Status ist keine Auskunft — nichts geschrieben.
  const { client, aufrufe } = attrappe([{ data: null, error: null, status: 204 }])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /204/)
  assert.equal(aufrufe.length, 1)
}
{
  // Unlesbar wirft, nie still zu „keine" (S4) — nichts geschrieben.
  const { client, aufrufe } = attrappe([gelesen({ kaputt: true })])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', '• b'))), /nicht lesbar/)
  assert.equal(aufrufe.length, 1)
}
{
  // Ungültig (keine Regel, voll) wird gar nicht erst geschrieben.
  const { client, aufrufe } = attrappe([gelesen([]), gelesen(VOLL)])
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'B', null))), /Keine Regel/)
  assert.match(vorlageMeldung(await wirft(vorlageSpeichern(client, 'u', 'Neu', '• a'))), /Höchstens/)
  assert.deepEqual(
    aufrufe.map((a) => a.art),
    ['lesen', 'lesen'],
  )
}
