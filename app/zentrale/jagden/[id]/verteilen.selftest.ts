// Gegenprobe fuer das Verteilen der Schuetzen (Portal P2a, Bauplan Verteilen V2.2).
//
//   node --experimental-strip-types "app/zentrale/jagden/[id]/verteilen.selftest.ts"
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
// Teil 1 sind die 17 Faelle aus quickhunt-native
// `src/lib/hunt/__tests__/assignment.test.ts` (Stand 71c36f2) — Faelle und
// Zusicherungen wie dort, nur ohne `coord` (s. Kopf von verteilen.ts).
import assert from 'node:assert/strict'
import {
  angebote,
  baueMatrix,
  bild,
  buildHuntSeating,
  effectiveStand,
  gleichesBild,
  JAGDWEIT,
  kartenNamen,
  leerenText,
  standLabels,
  toDriveStand,
  umsetzFehler,
  UmsetzenUnbestaetigt,
  zuweisbar,
  type DriveRow,
  type DriveStand,
  type HuntDrive,
  type SeatRow,
  type VerteilenDaten,
} from './verteilen.ts'

// ===========================================================================
// Teil 1 — die 17 Faelle der App
// ===========================================================================

const stand = (over: Partial<DriveStand> & { standId: string }): DriveStand => ({
  id: `row-${over.standId}`,
  kind: 'fixed',
  participantId: null,
  name: over.standId,
  ...over,
})

const drive = (stands: DriveStand[]): HuntDrive => ({
  id: 'd1',
  name: 'Treiben 1',
  sequence: 1,
  status: 'active',
  stands,
})

const assignedSeat = (id: string, userId: string, seatId: string, name: string): SeatRow => ({
  id,
  user_id: userId,
  seat_id: seatId,
  seat_type: 'assigned',
  seat_name: null,
  position_lat: null,
  position_lng: null,
  map_objects: { name },
})

const adhocSeat = (id: string, userId: string | null, name: string): SeatRow => ({
  id,
  user_id: userId,
  seat_id: null,
  seat_type: 'adhoc',
  seat_name: name,
  position_lat: 53.1,
  position_lng: 10.5,
  map_objects: null,
})

const PARTICIPANTS = [
  { participantId: 'p-heinrich', userId: 'u-heinrich' },
  { participantId: 'p-moritz', userId: 'u-moritz' },
  { participantId: 'p-gast', userId: null },
]

const NAMES: Record<string, string> = { 'p-heinrich': 'Heinrich', 'p-moritz': 'Moritz' }
const nameOf = (participantId: string) => NAMES[participantId]

// --- buildHuntSeating (3) ---
{
  const seating = buildHuntSeating([assignedSeat('s1', 'u-heinrich', 'mo-nord', 'Kanzel Nord')], PARTICIPANTS)
  assert.deepEqual(seating.get('p-heinrich'), { standId: 'mo-nord', kind: 'fixed', name: 'Kanzel Nord' })
}
{
  const seating = buildHuntSeating([adhocSeat('s2', 'u-moritz', 'Bruch Süd')], PARTICIPANTS)
  assert.deepEqual(seating.get('p-moritz'), { standId: 's2', kind: 'adhoc', name: 'Bruch Süd' })
}
{
  const seating = buildHuntSeating(
    [assignedSeat('s1', 'u-fremd', 'mo-nord', 'Kanzel Nord'), { ...adhocSeat('s3', 'u-moritz', 'Frei'), seat_type: 'free_pos' }],
    PARTICIPANTS,
  )
  assert.equal(seating.size, 0, 'skips rows whose user is no participant, and free_pos rows')
}

// --- effectiveStand (6) ---
{
  const seating = buildHuntSeating([assignedSeat('s1', 'u-heinrich', 'mo-nord', 'Kanzel Nord')], PARTICIPANTS)

  const active1 = drive([stand({ standId: 'mo-sued', name: 'Kanzel Süd', participantId: 'p-heinrich' })])
  assert.deepEqual(effectiveStand('p-heinrich', active1, seating), { standId: 'mo-sued', kind: 'fixed', name: 'Kanzel Süd' })

  const active2 = drive([stand({ standId: 'mo-sued' })])
  assert.equal(effectiveStand('p-heinrich', active2, seating)?.standId, 'mo-nord', 'falls back when the drive leaves him unseated')

  assert.equal(effectiveStand('p-heinrich', null, seating)?.standId, 'mo-nord', 'falls back when no drive runs')

  const active3 = drive([stand({ standId: 'seat-adhoc', name: 'Bruch Süd', participantId: 'p-heinrich' })])
  const e = effectiveStand('p-heinrich', active3, seating)
  assert.equal(e?.standId, 'seat-adhoc')
  assert.equal(e?.name, 'Bruch Süd')

  assert.equal(effectiveStand('p-moritz', null, seating), null)
  assert.equal(effectiveStand(null, drive([]), seating), null)

  const active4 = drive([stand({ standId: 'mo-sued', participantId: null })])
  assert.equal(effectiveStand('p-moritz', active4, new Map()), null, 'null once the participant left')
}

// --- standLabels (8) ---
{
  const seating = buildHuntSeating(
    [assignedSeat('s1', 'u-heinrich', 'mo-nord', 'Kanzel Nord'), adhocSeat('s2', 'u-moritz', 'Bruch Süd')],
    PARTICIPANTS,
  )

  assert.deepEqual(standLabels(null, seating, nameOf), { 'mo-nord': 'Heinrich', s2: 'Moritz' })

  {
    const labels = standLabels(drive([stand({ standId: 'mo-sued', participantId: 'p-heinrich' })]), seating, nameOf)
    assert.equal(labels['mo-sued'], 'Heinrich')
    assert.equal(labels['mo-nord'], undefined, 'the old hunt stand goes quiet')
    assert.equal(labels.s2, 'Moritz')
  }
  {
    const labels = standLabels(drive([stand({ standId: 's2', name: 'Bruch Süd', participantId: 'p-heinrich' })]), seating, nameOf)
    assert.equal(labels.s2, 'Heinrich')
    assert.equal(labels['mo-nord'], undefined)
  }
  assert.equal(standLabels(drive([stand({ standId: 'mo-nord' })]), seating, nameOf)['mo-nord'], 'Heinrich')

  {
    const planning = drive([stand({ standId: 'mo-sued', participantId: 'p-heinrich' })])
    assert.equal(standLabels(null, seating, nameOf, planning)['mo-sued'], 'Heinrich')
  }
  {
    const planning = drive([stand({ standId: 'mo-sued', participantId: 'p-heinrich' })])
    const labels = standLabels(null, seating, nameOf, planning)
    assert.equal(labels['mo-nord'], undefined, 'denselben Menschen nicht zweimal')
    assert.equal(labels.s2, 'Moritz')
  }
  {
    const planning = drive([stand({ standId: 'mo-sued', participantId: null })])
    assert.equal(standLabels(null, seating, nameOf, planning)['mo-sued'], undefined)
  }
  {
    const active = drive([stand({ standId: 'mo-nord', participantId: 'p-heinrich' })])
    const planning = drive([stand({ standId: 'mo-sued', participantId: 'p-moritz' })])
    const labels = standLabels(active, seating, nameOf, planning)
    assert.equal(labels['mo-nord'], 'Heinrich')
    assert.equal(labels['mo-sued'], 'Moritz')
  }
}

// --- toDriveStand: ein Schluesselraum fuer beide Spalten ---
assert.deepEqual(
  toDriveStand({ id: 'r', map_object_id: 'mo', seat_assignment_id: null, participant_id: 'p', map_objects: null, hunt_seat_assignments: null }),
  { id: 'r', standId: 'mo', kind: 'fixed', participantId: 'p', name: 'Stand' },
  'Embed null (Papierkorb) heisst in der App "Stand"',
)
assert.equal(
  toDriveStand({ id: 'r', map_object_id: null, seat_assignment_id: 'sa', participant_id: null, map_objects: null, hunt_seat_assignments: { seat_name: 'Bruch' } })?.standId,
  'sa',
)

// ===========================================================================
// Teil 2 — Matrix, Bindung, Rueckfall, Angebote
// ===========================================================================

const objekt = (id: string) => ({ id, name: id })

const zeile = (id: string, moId: string, pid: string | null, name = moId): DriveRow['hunt_drive_stands'][number] => ({
  id,
  map_object_id: moId,
  seat_assignment_id: null,
  participant_id: pid,
  map_objects: { name },
  hunt_seat_assignments: null,
})

/**
 * Grundaufstellung: A (Heinrich) jagdweit auf K1, B (Moritz) jagdweit auf K2,
 * G Gast ohne Konto, T Treiber. Treiben 1 setzt B auf K1 (B4: A erbt K1, die
 * App gibt K1 aber B), Treiben 2 hat K3 frei.
 */
const basis = (): VerteilenDaten => ({
  teilnehmer: [
    { id: 'pA', user_id: 'uA', role: 'schuetze', status: 'joined', entfernt_am: null },
    { id: 'pB', user_id: 'uB', role: 'jagdleiter', status: 'joined', entfernt_am: null },
    { id: 'pG', user_id: null, role: 'schuetze', status: 'invited', entfernt_am: null },
    { id: 'pT', user_id: 'uT', role: 'treiber', status: 'joined', entfernt_am: null },
  ],
  namen: new Map([
    ['pA', 'Anna'],
    ['pB', 'Bernd'],
    ['pG', 'Gast'],
    ['pT', 'Theo'],
  ]),
  sitze: [assignedSeat('sA', 'uA', 'K1', 'K1'), assignedSeat('sB', 'uB', 'K2', 'K2')],
  treiben: [
    { id: 't1', name: 'Treiben 1', sequence: 1, status: 'pending', hunt_drive_stands: [zeile('r1', 'K1', 'pB'), zeile('r2', 'K3', null)] },
    { id: 't2', name: 'Treiben 2', sequence: 2, status: 'pending', hunt_drive_stands: [zeile('r3', 'K3', null)] },
  ],
  objekte: ['K1', 'K2', 'K3', 'K4'].map(objekt),
  pruefung: new Map(),
})

// --- Matrix: Zeilen, Sortierung, Spalten ---
{
  const m = baueMatrix(basis())
  assert.deepEqual(m.zeilen.map((z) => z.name), ['Anna', 'Bernd', 'Gast', 'Theo'], 'Treiber unter den Schuetzen')
  assert.deepEqual(m.spalten.map((s) => s.schluessel), [JAGDWEIT, 't1', 't2'])
  assert.equal(m.laeuft, null)
  assert.ok(m.spalten.every((s) => s.schreibbar))
  assert.equal(m.ausgeschiedene.length, 0)

  const anna = m.zeilen[0]
  assert.equal(anna.zellen[JAGDWEIT].direkt?.stand?.standId, 'K1')
  // B4: Anna erbt K1 in Treiben 1, die App gibt K1 dort aber Bernd → rot.
  assert.equal(anna.zellen.t1.direkt, null)
  assert.equal(anna.zellen.t1.geerbt?.stand.standId, 'K1')
  assert.equal(anna.zellen.t1.geerbt?.belegtVon, 'Bernd', 'B4: zwei Schuetzen, ein Stand')
  assert.equal(anna.zellen.t1.geerbt?.ausserhalb, false)
  // Treiben 2 hat K1 nicht in der Standmenge → gelb, nicht rot.
  assert.equal(anna.zellen.t2.geerbt?.belegtVon, null)
  assert.equal(anna.zellen.t2.geerbt?.ausserhalb, true)

  const bernd = m.zeilen[1]
  assert.equal(bernd.zellen.t1.direkt?.stand?.standId, 'K1')
  assert.equal(bernd.zellen.t2.geerbt?.stand.standId, 'K2', 'erbt seinen jagdweiten Stand')

  // Zaehler: jagdweit sind K3, K4 frei; ohne Stand Gast und Theo.
  const [jw, t1, t2] = m.spalten
  assert.equal(jw.frei, 2)
  assert.equal(jw.ohneStand, 2)
  // Treiben 1: K1 (Bernd direkt) belegt, K3 frei. Ohne Stand: Gast, Theo — Anna erbt K1.
  assert.equal(t1.frei, 1)
  assert.equal(t1.ohneStand, 2)
  assert.equal(t2.frei, 1)
}

// --- "frei" aus der effektiven Belegung: wer jagdweit dort steht, belegt (E4) ---
{
  const d = basis()
  d.treiben[1].hunt_drive_stands.push(zeile('r4', 'K2', null))
  const t2 = baueMatrix(d).spalten[2]
  assert.equal(t2.frei, 1, 'K2 traegt in der App Bernd, obwohl die Standzeile leer ist')
}

// --- laufendes Treiben: ganze Matrix read-only (B9) ---
{
  const d = basis()
  d.treiben[1].status = 'active'
  const m = baueMatrix(d)
  assert.equal(m.laeuft, 'Treiben 2')
  assert.ok(m.spalten.every((s) => !s.schreibbar), 'auch jagdweit und das geplante Treiben')
}
{
  const d = basis()
  d.treiben[0].status = 'completed'
  const m = baueMatrix(d)
  assert.equal(m.laeuft, null)
  assert.deepEqual(m.spalten.map((s) => s.schreibbar), [true, false, true], 'beendetes Treiben read-only')
}

// --- gesperrt, unbekannt, geerbt gesperrt (E4, E6) ---
{
  const d = basis()
  d.pruefung = new Map([['K1', { status: 'gesperrt', checked_at: '2026-10-01', pruefer: 'X' }]])
  const anna = baueMatrix(d).zeilen[0]
  assert.equal(anna.zellen[JAGDWEIT].direkt?.sperre, 'gesperrt')
  assert.equal(anna.zellen.t2.geerbt?.sperre, 'gesperrt', 'auch geerbt rot gesperrt')
  d.pruefung = null
  assert.equal(baueMatrix(d).zeilen[0].zellen[JAGDWEIT].direkt?.sperre, 'unbekannt', 'Ladefehler ist nie offen')
}

// --- nicht verfuegbar (B6, B13) ---
{
  const d = basis()
  d.objekte = d.objekte.filter((o) => o.id !== 'K1') // K1 im Papierkorb oder fremd
  const m = baueMatrix(d)
  assert.equal(m.zeilen[0].zellen[JAGDWEIT].direkt?.verfuegbar, false)
  assert.equal(m.zeilen[1].zellen.t1.direkt?.verfuegbar, false)
  assert.equal(m.spalten[1].frei, 1, 'K1 zaehlt nie als frei')
  // Auch geerbt: Anna erbt K1 in Treiben 2 — die Zelle sagt "nicht verfuegbar" (Codex A2).
  assert.equal(m.zeilen[0].zellen.t2.geerbt?.verfuegbar, false)
  assert.equal(baueMatrix(basis()).zeilen[0].zellen.t2.geerbt?.verfuegbar, true)
  assert.ok(!angebote(d, 't1', 'pA').some((a) => a.standId === 'K1'), 'nicht angeboten')
  assert.ok(!angebote(d, JAGDWEIT, 'pA').some((a) => a.standId === 'K1'))
}
{
  // assigned ohne seat_id: die App zeigt nichts, das Portal "nicht verfuegbar" mit "leeren".
  const d = basis()
  d.sitze[0] = { ...d.sitze[0], seat_id: null, map_objects: null }
  const c = baueMatrix(d).zeilen[0].zellen[JAGDWEIT]
  assert.equal(c.direkt?.stand, null)
  assert.equal(c.direkt?.verfuegbar, false)
  assert.equal(baueMatrix(d).zeilen[0].zellen.t1.geerbt, null, 'kein Rueckfall, wie in der App')
}
{
  // Ad-hoc-Sitz im Treiben: gueltig nur als adhoc dieser Jagd mit Position, ohne seat_id.
  const d = basis()
  d.sitze.push(adhocSeat('sx', null, 'Bruch'))
  d.treiben[1].hunt_drive_stands.push({
    id: 'r5', map_object_id: null, seat_assignment_id: 'sx', participant_id: 'pG',
    map_objects: null, hunt_seat_assignments: { seat_name: 'Bruch' },
  })
  assert.equal(baueMatrix(d).zeilen[2].zellen.t2.direkt?.verfuegbar, true)
  d.sitze[2] = { ...d.sitze[2], seat_type: 'assigned' }
  assert.equal(baueMatrix(d).zeilen[2].zellen.t2.direkt?.verfuegbar, false, 'assigned als Sitzreferenz ist ungueltig')
  d.sitze.pop()
  assert.equal(baueMatrix(d).zeilen[2].zellen.t2.direkt?.verfuegbar, false, 'Sitz einer fremden Jagd')
}

// --- ausgeschieden mit Zuweisung (B11, E5) ---
{
  const d = basis()
  d.teilnehmer[0] = { ...d.teilnehmer[0], status: 'left', entfernt_am: '2026-10-20' }
  const m = baueMatrix(d)
  assert.ok(!m.zeilen.some((z) => z.teilnahmeId === 'pA'))
  assert.deepEqual(m.ausgeschiedene.map((z) => z.name), ['Anna'])
  // Sie haelt K1 jagdweit weiter: der Stand ist nicht frei, und wer ihn will, verdraengt sie.
  assert.equal(m.spalten[0].frei, 2)
  assert.equal(angebote(d, JAGDWEIT, 'pT').find((a) => a.standId === 'K1')?.inhaber?.name, 'Anna')
  const b = bild(d, JAGDWEIT, 'pT', 'K1')
  assert.match(b?.frage ?? '', /Anna hat dann keinen jagdweiten Stand/)
  // Ohne Zuweisung taucht ein Ausgeschiedener nicht auf.
  d.sitze = d.sitze.filter((s) => s.user_id !== 'uA')
  assert.equal(baueMatrix(d).ausgeschiedene.length, 0)
}

// --- Angebote ---
{
  const d = basis()
  const jw = angebote(d, JAGDWEIT, 'pT')
  assert.deepEqual(jw.map((a) => a.standId), ['K1', 'K2', 'K3', 'K4'])
  assert.equal(jw.find((a) => a.standId === 'K3')?.zeileId, null, 'Sitzzeile fehlt — E2 legt sie an')
  assert.equal(jw.find((a) => a.standId === 'K1')?.zeileId, 'sA')

  const t1 = angebote(d, 't1', 'pT')
  assert.deepEqual(t1.map((a) => a.standId), ['K1', 'K3'], 'nur die Standmenge')
  assert.equal(t1.find((a) => a.standId === 'K1')?.inhaber?.name, 'Bernd')
  // K3 in Treiben 1 erbt niemand; K1 erbt Anna nicht, weil Bernd ihn direkt haelt — aber sie steht jagdweit dort.
  const d2 = basis()
  d2.treiben[0].hunt_drive_stands[0].participant_id = null
  assert.equal(angebote(d2, 't1', 'pT').find((a) => a.standId === 'K1')?.erbtHier, 'Anna', 'B4-Hinweis')
  assert.equal(angebote(d2, 't1', 'pA').find((a) => a.standId === 'K1')?.erbtHier, 'Anna')
}

// --- Bild und Rueckfrage (E3) ---
{
  const d = basis()
  // Theo auf K1 in Treiben 1: verdraengt Bernd, der auf K2 (jagdweit) zurueckfaellt.
  const b = bild(d, 't1', 'pT', 'K1')
  assert.equal(b?.verdraengt?.name, 'Bernd')
  assert.equal(b?.frage, 'Bernd fällt in Treiben 1 auf den jagdweiten Stand K2 zurück.')

  // Faellt er auf einen Stand, den das Treiben einem anderen gibt → "dort steht dann auch".
  const d2 = basis()
  d2.treiben[0].hunt_drive_stands.push(zeile('r6', 'K2', 'pT'))
  assert.equal(
    bild(d2, 't1', 'pA', 'K1')?.frage,
    'Bernd fällt in Treiben 1 auf den jagdweiten Stand K2 zurück — dort steht dann auch Theo.',
  )

  // Gesperrter Rueckfallstand wird genannt.
  const d3 = basis()
  d3.pruefung = new Map([['K2', { status: 'gesperrt', checked_at: '2026-10-01', pruefer: null }]])
  assert.match(bild(d3, 't1', 'pT', 'K1')?.frage ?? '', /K2 ist gesperrt\.$/)

  // Ein Gast hat nie einen jagdweiten Rueckfall.
  const d4 = basis()
  d4.treiben[1].hunt_drive_stands[0].participant_id = 'pG'
  assert.equal(bild(d4, 't2', 'pT', 'K3')?.frage, 'Gast hat in Treiben 2 dann keinen Stand.')

  // Freier Stand, eigener Stand: keine Rueckfrage.
  assert.equal(bild(d, 't1', 'pT', 'K3')?.frage, null)
  assert.equal(bild(d, 't1', 'pB', 'K1')?.verdraengt, null, 'wer schon dort steht, verdraengt sich nicht')

  // Jagdweit: Gast ist kein Empfaenger (B1), ein Abgesagter auch nicht (Codex R3-7).
  assert.equal(bild(d, JAGDWEIT, 'pG', 'K3')?.empfaengerZuweisbar, false)
  assert.equal(bild(d, 't2', 'pG', 'K3')?.empfaengerZuweisbar, true, 'je Treiben schon')
  const d5 = basis()
  d5.teilnehmer[3] = { ...d5.teilnehmer[3], status: 'declined' }
  assert.equal(bild(d5, 't2', 'pT', 'K3')?.empfaengerZuweisbar, false)

  // Leeren nennt den Rueckfall; Bernd faellt auf K2.
  assert.equal(leerenText(d, 't1', 'pB'), 'Treiben-Zuweisung entfernen — fällt auf K2 (jagdweit) zurück')
  assert.equal(bild(d, 't1', 'pB', null)?.zeileId, 'r1')
  assert.equal(bild(d, 't1', 'pA', null), null, 'eine geerbte Zelle hat nichts zu leeren (E5)')
}

// --- gleichesBild: E10 ---
{
  const vorher = bild(basis(), 't1', 'pT', 'K1')
  // Unveraendert → gleich.
  assert.ok(gleichesBild(vorher, bild(basis(), 't1', 'pT', 'K1')))
  // Inhaber gewechselt → abweichend.
  const d = basis()
  d.treiben[0].hunt_drive_stands[0].participant_id = 'pA'
  assert.ok(!gleichesBild(vorher, bild(d, 't1', 'pT', 'K1')))
  // Rueckfall des Verdraengten gewechselt (Codex R3-2) → abweichend.
  const d2 = basis()
  d2.sitze[1] = assignedSeat('sB', 'uB', 'K4', 'K4')
  assert.ok(!gleichesBild(vorher, bild(d2, 't1', 'pT', 'K1')))
  // Sitzzeile inzwischen leer angelegt → gleich (E2).
  const jw = bild(basis(), JAGDWEIT, 'pT', 'K3')
  const d3 = basis()
  d3.sitze.push({ ...assignedSeat('neu', 'x', 'K3', 'K3'), user_id: null })
  assert.ok(gleichesBild(jw, bild(d3, JAGDWEIT, 'pT', 'K3')))
  // ... aber mit Person darauf nicht (Fable R3-6).
  d3.sitze[d3.sitze.length - 1].user_id = 'uA'
  assert.ok(!gleichesBild(jw, bild(d3, JAGDWEIT, 'pT', 'K3')))
}

// --- free_pos mit Person ist in der App kein Stand — im Portal auch nicht (Schlusslesung F4) ---
{
  const d = basis()
  d.sitze.push({ ...adhocSeat('fp', 'uT', 'frei'), seat_type: 'free_pos' })
  const theo = baueMatrix(d).zeilen.find((z) => z.teilnahmeId === 'pT')
  assert.equal(theo?.zellen[JAGDWEIT].direkt, null)
  assert.equal(bild(d, JAGDWEIT, 'pT', null), null, 'nichts zu leeren')
}

// --- gleichesBild: unbekannt -> offen ist kein Abbruch, unbekannt -> gesperrt schon (Schlusslesung F5) ---
{
  const d = basis()
  d.pruefung = null
  const vorher = bild(d, 't1', 'pT', 'K1')
  assert.equal(vorher?.zielSperre, 'unbekannt')
  assert.ok(gleichesBild(vorher, bild(basis(), 't1', 'pT', 'K1')), 'offen statt unbekannt')
  const d2 = basis()
  d2.pruefung = new Map([['K1', { status: 'gesperrt', checked_at: '2026-10-01', pruefer: null }]])
  assert.ok(!gleichesBild(vorher, bild(d2, 't1', 'pT', 'K1')), 'gesperrt statt unbekannt')
  // Rueckfall-Sperre ebenso: Bernd faellt auf K2.
  const d3 = basis()
  d3.pruefung = new Map([['K2', { status: 'gesperrt', checked_at: '2026-10-01', pruefer: null }]])
  assert.ok(!gleichesBild(vorher, bild(d3, 't1', 'pT', 'K1')))
  // Umgekehrt (offen vorher, unbekannt jetzt) bleibt Abweichung.
  assert.ok(!gleichesBild(bild(basis(), 't1', 'pT', 'K1'), vorher))
}

// --- Kartennamen wie die App beim Verteilen ---
{
  const d = basis()
  assert.deepEqual(kartenNamen(d, JAGDWEIT), { K1: 'Anna', K2: 'Bernd' })
  assert.deepEqual(kartenNamen(d, 't1'), { K1: 'Bernd' }, 'Bernd zieht nach K1, sein K2 wird still')
}

// --- umsetzFehler ---
assert.match(umsetzFehler(new UmsetzenUnbestaetigt()), /nicht bestätigt/)
assert.match(umsetzFehler({ code: 'P0002', message: 'x' }), /gibt es nicht mehr/)
assert.match(umsetzFehler({ code: '42501', message: 'x' }), /nicht zuteilen/)
assert.equal(umsetzFehler({ code: 'XX', message: 'kaputt' }), 'Die Zuteilung ist fehlgeschlagen: kaputt')

// --- Faelle aus der Mutationsprobe (28.10.2026): je einer, der sonst gruen blieb ---
// entfernt_am entscheidet, nicht nur der Status.
assert.equal(zuweisbar({ status: 'joined', entfernt_am: '2026-10-20' }), false)
assert.equal(zuweisbar({ status: 'invited', entfernt_am: null }), true)
{
  // Ad-hoc mit seat_id ist keine gueltige Sitzreferenz (B6).
  const d = basis()
  d.sitze.push({ ...adhocSeat('sy', null, 'Bruch'), seat_id: 'K4' })
  d.treiben[1].hunt_drive_stands.push({
    id: 'r8', map_object_id: null, seat_assignment_id: 'sy', participant_id: 'pG',
    map_objects: null, hunt_seat_assignments: { seat_name: 'Bruch' },
  })
  assert.equal(baueMatrix(d).zeilen[2].zellen.t2.direkt?.verfuegbar, false)
}
{
  // Die RPC raeumt den Empfaenger aus seiner alten Zeile: steht Theo auf K3 und
  // faellt Bernd jagdweit auf K3 zurueck, ist K3 danach frei — kein "dort steht auch".
  const d = basis()
  d.sitze[1] = assignedSeat('sB', 'uB', 'K3', 'K3')
  d.treiben[0].hunt_drive_stands[1].participant_id = 'pT'
  assert.equal(bild(d, 't1', 'pT', 'K1')?.frage, 'Bernd fällt in Treiben 1 auf den jagdweiten Stand K3 zurück.')
}
{
  // Treiber stehen unter den Schuetzen, auch wenn der Name vorne liegt.
  const d = basis()
  d.namen = new Map([...d.namen, ['pT', 'Aaron']])
  assert.deepEqual(baueMatrix(d).zeilen.map((z) => z.name), ['Anna', 'Bernd', 'Gast', 'Aaron'])
}
{
  // Wer im Treiben direkt steht, erbt seinen jagdweiten Stand dort nicht.
  const d = basis()
  d.treiben[0].hunt_drive_stands.push(zeile('r7', 'K2', null))
  assert.equal(angebote(d, 't1', 'pT').find((a) => a.standId === 'K2')?.erbtHier, null)
}
{
  // "Stand 2" vor "Stand 10" — Revierstaende sind durchnummeriert.
  const d = basis()
  d.objekte = [{ id: 'a', name: 'Stand 10' }, { id: 'b', name: 'Stand 2' }]
  assert.deepEqual(angebote(d, JAGDWEIT, 'pT').map((a) => a.name), ['Stand 2', 'Stand 10'])
}
