/**
 * Schützen verteilen — die Rechenregeln (Portal P2a, Bauplan
 * `QuickHunt_Bauplan_Portal_Verteilen_V2.md` V2.2).
 *
 * Bewusst **ohne jeden Import**, wie `treiben.ts`: dadurch ist die Datei mit
 * `node --experimental-strip-types` prüfbar (`verteilen.selftest.ts`).
 *
 * **Teil 1 ist eine KOPIE des nativen Resolvers** (Fahrplan §5: „übernehmen,
 * nicht nachbauen"): `buildHuntSeating`, `effectiveStand`, `standSeating`,
 * `standLabels` aus `src/lib/hunt/assignment.ts` und `toDriveStand` aus
 * `src/lib/data/drives.ts`, Stand quickhunt-native `71c36f2`. Die Namen sind
 * die der App, damit ein `grep` beide Seiten findet. **Ändert die App ihre
 * Präzedenz, ist diese Kopie falsch** — dann zeigt die Matrix eine andere
 * Belegung als die App, und genau das soll sie nie (Bauplan B4, E3).
 *
 * **Eine Abweichung, bewusst:** kein `coord`. Im Portal liest ihn niemand —
 * die Matrix zeigt Namen, die Karte nimmt die Punkte der Seite. Ad-hoc-Sitze
 * auf der Karte kommen mit P2b, der Ort dann mit ihnen.
 *
 * **Teil 2 ist Portal-eigen:** Matrix, Bindung an Jagd und Revier (B6),
 * Rückfall-Auskunft (E3), Angebote je Zelle und das „Bild", gegen das ein
 * Write nach der Rückfrage frisch geprüft wird (E10).
 */

// ===========================================================================
// Teil 1 — Kopie des nativen Resolvers
// ===========================================================================

export type StandArt = 'fixed' | 'adhoc'

/** Ein Stand im einen Schlüsselraum der App: `map_objects.id` bzw. `hunt_seat_assignments.id`. */
export interface SeatedStand {
  standId: string
  kind: StandArt
  name: string
}

/** Die jagdweite Sitzordnung: participantId → Stand. */
export type HuntSeating = ReadonlyMap<string, SeatedStand>

/** `hunt_seat_assignments` samt eingebettetem Stand, wie PostgREST sie liefert. */
export interface SeatRow {
  id: string
  user_id: string | null
  seat_id: string | null
  seat_type: string
  seat_name: string | null
  position_lat: number | null
  position_lng: number | null
  map_objects: { name: string } | null
}

export interface ParticipantRef {
  participantId: string
  userId: string | null
}

/** Eine Standzeile eines Treibens mit dem Schützen darauf (061). */
export interface DriveStand {
  /** hunt_drive_stands.id — das Ziel von `treiben_stand_umsetzen`. */
  id: string
  standId: string
  kind: StandArt
  participantId: string | null
  name: string
}

export interface HuntDrive {
  id: string
  name: string
  sequence: number
  status: string
  stands: DriveStand[]
}

/** `hunt_drive_stands` mit beiden Embeds, wie `fetchHuntDrives` der App. */
export interface DriveStandRow {
  id: string
  map_object_id: string | null
  seat_assignment_id: string | null
  participant_id: string | null
  map_objects: { name: string } | null
  hunt_seat_assignments: { seat_name: string | null } | null
}

/** `hunt_drives` samt Standzeilen. */
export interface DriveRow {
  id: string
  name: string
  sequence: number
  status: string
  hunt_drive_stands: DriveStandRow[]
}

export function buildHuntSeating(
  seats: readonly SeatRow[],
  participants: readonly ParticipantRef[],
): HuntSeating {
  const participantByUser = new Map(
    participants.filter((p) => p.userId).map((p) => [p.userId as string, p.participantId]),
  )

  const seating = new Map<string, SeatedStand>()
  for (const seat of seats) {
    if (!seat.user_id) continue
    const participantId = participantByUser.get(seat.user_id)
    if (!participantId) continue

    if (seat.seat_type === 'assigned' && seat.seat_id) {
      seating.set(participantId, {
        standId: seat.seat_id,
        kind: 'fixed',
        name: seat.map_objects?.name ?? 'Stand',
      })
    } else if (seat.seat_type === 'adhoc' && seat.position_lat != null && seat.position_lng != null) {
      seating.set(participantId, {
        standId: seat.id,
        kind: 'adhoc',
        name: seat.seat_name ?? 'Ad-hoc Stand',
      })
    }
  }
  return seating
}

export function effectiveStand(
  participantId: string | null,
  activeDrive: HuntDrive | null,
  huntSeating: HuntSeating,
): SeatedStand | null {
  if (!participantId) return null

  const inDrive = activeDrive?.stands.find((s) => s.participantId === participantId)
  if (inDrive) return { standId: inDrive.standId, kind: inDrive.kind, name: inDrive.name }

  return huntSeating.get(participantId) ?? null
}

export function standSeating(
  activeDrive: HuntDrive | null,
  huntSeating: HuntSeating,
): ReadonlyMap<string, string> {
  const byDrive = new Map<string, string>()
  for (const stand of activeDrive?.stands ?? []) {
    if (stand.participantId) byDrive.set(stand.standId, stand.participantId)
  }
  const seatedByDrive = new Set(byDrive.values())

  const seating = new Map(byDrive)
  for (const [participantId, stand] of huntSeating) {
    if (seatedByDrive.has(participantId)) continue
    if (byDrive.has(stand.standId)) continue
    seating.set(stand.standId, participantId)
  }
  return seating
}

export function standLabels(
  activeDrive: HuntDrive | null,
  huntSeating: HuntSeating,
  nameOf: (participantId: string) => string | undefined,
  planningDrive?: HuntDrive | null,
): Record<string, string> {
  const seating = new Map(standSeating(activeDrive, huntSeating))

  if (planningDrive) {
    const seatedHere = new Set<string>()
    for (const stand of planningDrive.stands) {
      if (stand.participantId) seatedHere.add(stand.participantId)
    }
    for (const [standId, participantId] of seating) {
      if (seatedHere.has(participantId)) seating.delete(standId)
    }
    for (const stand of planningDrive.stands) {
      if (stand.participantId) seating.set(stand.standId, stand.participantId)
    }
  }

  const labels: Record<string, string> = {}
  for (const [standId, participantId] of seating) {
    const name = nameOf(participantId)
    if (name) labels[standId] = name
  }
  return labels
}

export function toDriveStand(row: DriveStandRow): DriveStand | null {
  if (row.map_object_id) {
    return {
      id: row.id,
      standId: row.map_object_id,
      kind: 'fixed',
      participantId: row.participant_id,
      name: row.map_objects?.name ?? 'Stand',
    }
  }
  if (row.seat_assignment_id) {
    return {
      id: row.id,
      standId: row.seat_assignment_id,
      kind: 'adhoc',
      participantId: row.participant_id,
      name: row.hunt_seat_assignments?.seat_name ?? 'Ad-hoc Stand',
    }
  }
  return null
}

export function alsTreiben(row: DriveRow): HuntDrive {
  return {
    id: row.id,
    name: row.name,
    sequence: row.sequence,
    status: row.status,
    stands: row.hunt_drive_stands.flatMap((s) => toDriveStand(s) ?? []),
  }
}

/**
 * Der Satz, wenn ein Umsetzen scheitert — die Codes wie `umsetzFehler` der App
 * (`P0002` Zeile weg, `42501` kein Recht). „Nicht bestätigt" heisst: offen, ob
 * geschrieben wurde (S4) — dann nicht „fehlgeschlagen" behaupten.
 */
export function umsetzFehler(error: unknown): string {
  if (error instanceof UmsetzenUnbestaetigt) {
    return 'Die Zuteilung wurde nicht bestätigt — ob sie gespeichert ist, zeigt die neu geladene Seite.'
  }
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  if (code === 'P0002') return 'Den Stand gibt es nicht mehr. Die Seite lädt neu.'
  if (code === '42501') return 'Du darfst diesen Stand nicht zuteilen.'
  const text = error instanceof Error ? error.message : (error as { message?: unknown } | null)?.message
  return `Die Zuteilung ist fehlgeschlagen${typeof text === 'string' && text ? `: ${text}` : '.'}`
}

/** Die RPC lief, die Kontroll-Lesung zeigt aber nicht den gewählten Wert (S1). */
export class UmsetzenUnbestaetigt extends Error {
  constructor() {
    super('Zuteilung nicht bestätigt.')
    this.name = 'UmsetzenUnbestaetigt'
  }
}

// ===========================================================================
// Teil 2 — Matrix, Bindung, Rückfall, Angebote
// ===========================================================================

/** Teilnehmerzeile, so weit die Matrix sie braucht — ALLE Zeilen der Jagd (B11). */
export interface TeilnehmerRoh {
  id: string
  user_id: string | null
  role: string | null
  status: string | null
  entfernt_am: string | null
}

/** Jüngste Prüfung eines Standes (`map_object_letzte_pruefung`, 117). */
export interface Pruefung {
  status: string
  checked_at: string
  /** Aufgelöster Name des Prüfers, `null` = unbekannt. */
  pruefer: string | null
}

export interface VerteilenDaten {
  teilnehmer: readonly TeilnehmerRoh[]
  /** teilnahmeId → Anzeigename. */
  namen: ReadonlyMap<string, string>
  sitze: readonly SeatRow[]
  treiben: readonly DriveRow[]
  /** Die Stände des Reviers nach `STAND_TYPEN`, sichtbar (nicht im Papierkorb). */
  objekte: readonly { id: string; name: string }[]
  /** map_object_id → jüngste Prüfung. `null` = der Prüfstand war nicht ladbar (S4). */
  pruefung: ReadonlyMap<string, Pruefung> | null
}

/** Der Schlüssel der jagdweiten Spalte; Treiben-Spalten tragen ihre ID. */
export const JAGDWEIT = 'jagd'

/** `gesperrt` | `offen` | `unbekannt` — ein Ladefehler wird nie still zu „offen" (S4). */
export type Sperre = 'gesperrt' | 'offen' | 'unbekannt'

export function sperre(daten: Pick<VerteilenDaten, 'pruefung'>, stand: { standId: string; kind: StandArt }): Sperre {
  // Prüfungen gibt es nur an Kartenobjekten; ein Ad-hoc-Sitz kann nicht gesperrt sein.
  if (stand.kind === 'adhoc') return 'offen'
  if (!daten.pruefung) return 'unbekannt'
  return daten.pruefung.get(stand.standId)?.status === 'gesperrt' ? 'gesperrt' : 'offen'
}

/**
 * Wer zuweisbar ist — wie das native Einteil-Blatt (`joined` und `invited`,
 * ohne Rollenfilter, `StandAssignSheet.tsx`), dazu `entfernt_am` leer
 * (E5). Wer entfernt wurde, trägt `left`; die Prüfung ist trotzdem explizit,
 * weil die Spalte der eigentliche Zustand ist.
 */
export function zuweisbar(t: Pick<TeilnehmerRoh, 'status' | 'entfernt_am'>): boolean {
  return (t.status === 'joined' || t.status === 'invited') && t.entfernt_am === null
}

function refs(teilnehmer: readonly TeilnehmerRoh[]): ParticipantRef[] {
  return teilnehmer.map((t) => ({ participantId: t.id, userId: t.user_id }))
}

/**
 * Ist eine Standzeile dem Portal zuordenbar (B6)? Die DB bindet weder
 * `participant_id` an die Jagd noch das Objekt an das Revier — also bindet das
 * Portal beim Lesen UND beim Anbieten:
 * - ein Revierstand muss in `objekte` stehen (Revier der Jagd, `STAND_TYPEN`,
 *   nicht im Papierkorb);
 * - ein Ad-hoc-Sitz muss eine Sitzzeile DIESER Jagd sein, `adhoc` mit Position
 *   wie `buildHuntSeating`, und ohne `seat_id` — `toDriveStand` deutet jede
 *   Sitz-Referenz als Ad-hoc-Stand, auch eine `assigned`-Zeile.
 * Was nicht passt, zeigt „Stand nicht verfügbar", zählt nie als frei und wird
 * nicht angeboten — gelöscht und fremd sind RLS-unsichtbar und nicht zu
 * unterscheiden, deshalb eine Regel für beides.
 */
export function standGueltig(
  daten: Pick<VerteilenDaten, 'objekte' | 'sitze'>,
  stand: { standId: string; kind: StandArt },
): boolean {
  if (stand.kind === 'fixed') return daten.objekte.some((o) => o.id === stand.standId)
  const sitz = daten.sitze.find((s) => s.id === stand.standId)
  return (
    !!sitz &&
    sitz.seat_type === 'adhoc' &&
    sitz.seat_id === null &&
    sitz.position_lat != null &&
    sitz.position_lng != null
  )
}

/** Ist eine jagdweite Sitzzeile mit Person dem Portal zuordenbar (B6)? */
function sitzGueltig(daten: Pick<VerteilenDaten, 'objekte' | 'sitze'>, sitz: SeatRow): boolean {
  if (sitz.seat_type === 'assigned') return !!sitz.seat_id && daten.objekte.some((o) => o.id === sitz.seat_id)
  return standGueltig(daten, { standId: sitz.id, kind: 'adhoc' })
}

/**
 * Die jagdweite Sitzzeile einer Person, die einen STAND meint (`assigned`,
 * `adhoc`). `free`/`free_pos` sind in der App kein Stand (`buildHuntSeating`
 * überspringt sie) — als „nicht verfügbar" geführt, wiche die Zelle von der App
 * ab (Schlusslesung F4; die PWA schreibt `free_pos` beim Anlegen).
 */
function standSitz(daten: Pick<VerteilenDaten, 'sitze'>, userId: string | null): SeatRow | undefined {
  if (!userId) return undefined
  return daten.sitze.find((s) => s.user_id === userId && (s.seat_type === 'assigned' || s.seat_type === 'adhoc'))
}

/** Der Stand einer jagdweiten Sitzzeile im Schlüsselraum der App — `null`, wo die App keinen sieht. */
function sitzStand(sitz: SeatRow): SeatedStand | null {
  if (sitz.seat_type === 'assigned' && sitz.seat_id)
    return { standId: sitz.seat_id, kind: 'fixed', name: sitz.map_objects?.name ?? 'Stand' }
  if (sitz.seat_type === 'adhoc' && sitz.position_lat != null && sitz.position_lng != null)
    return { standId: sitz.id, kind: 'adhoc', name: sitz.seat_name ?? 'Ad-hoc Stand' }
  return null
}

export interface Spalte {
  /** `JAGDWEIT` oder die Treiben-ID. */
  schluessel: string
  titel: string
  treiben: HuntDrive | null
  /** Schreibbar heisst: Treiben `pending` (bzw. jagdweit) UND kein Treiben läuft (B9). */
  schreibbar: boolean
  /** Zuweisbare ohne Stand in dieser Spalte — nach dem Resolver, also wie die App. */
  ohneStand: number
  /** Gültige Stände dieser Spalte, die nach der effektiven Belegung niemandem gehören (E4). */
  frei: number
}

/** Eine eigene Zuweisung dieser Person in dieser Spalte. */
export interface Direkt {
  /** Was die App zeigt; `null`, wo sie nichts zeigt (z. B. `assigned` ohne `seat_id`). */
  stand: SeatedStand | null
  verfuegbar: boolean
  sperre: Sperre
}

/** Der jagdweite Stand, den eine Treiben-Zelle ohne eigene Zuweisung erbt (E4). */
export interface Geerbt {
  stand: SeatedStand
  /**
   * Nach B6 zuordenbar — sonst „nicht verfügbar" (Papierkorb, fremd). Die App
   * schickt ihn trotzdem hin; die Zelle sagt es, ändern geht jagdweit (Codex A2).
   */
  verfuegbar: boolean
  /** Name dessen, dem die App diesen Stand in diesem Treiben gibt — B4, rot. */
  belegtVon: string | null
  /** Der Stand gehört nicht zur Standmenge dieses Treibens — gelb, kein Zähler. */
  ausserhalb: boolean
  sperre: Sperre
}

export interface Zelle {
  direkt: Direkt | null
  geerbt: Geerbt | null
}

export interface Zeile {
  teilnahmeId: string
  userId: string | null
  name: string
  rolle: string | null
  zellen: Record<string, Zelle>
}

export interface Matrix {
  spalten: Spalte[]
  zeilen: Zeile[]
  /** Nicht mehr Zuweisbare, die noch eine Zuweisung halten (B11, E5). */
  ausgeschiedene: Zeile[]
  /** Name des laufenden Treibens — dann ist die ganze Matrix read-only (B9). */
  laeuft: string | null
}

/** Name einer Teilnahme; `Unbekannt` für eine ID, die nicht zu dieser Jagd gehört (B6). */
export function nameVon(daten: Pick<VerteilenDaten, 'namen'>, teilnahmeId: string): string {
  return daten.namen.get(teilnahmeId) ?? 'Unbekannt'
}

/** Jagdleiter und Schützen vor den Treibern, je Gruppe nach Name (E5). */
function rang(rolle: string | null): number {
  return rolle === 'treiber' ? 1 : 0
}

export function baueMatrix(daten: VerteilenDaten): Matrix {
  const seating = buildHuntSeating(daten.sitze, refs(daten.teilnehmer))
  const treiben = [...daten.treiben]
    .sort((a, b) => a.sequence - b.sequence)
    .map(alsTreiben)
  const laufendes = treiben.find((t) => t.status === 'active') ?? null

  const zelleJagdweit = (t: TeilnehmerRoh): Zelle => {
    const sitz = standSitz(daten, t.user_id)
    if (!sitz) return { direkt: null, geerbt: null }
    const stand = sitzStand(sitz)
    return {
      direkt: {
        stand,
        verfuegbar: sitzGueltig(daten, sitz),
        sperre: stand ? sperre(daten, stand) : 'offen',
      },
      geerbt: null,
    }
  }

  const zelleTreiben = (t: TeilnehmerRoh, d: HuntDrive): Zelle => {
    const eigene = d.stands.find((s) => s.participantId === t.id)
    if (eigene) {
      return {
        direkt: {
          stand: { standId: eigene.standId, kind: eigene.kind, name: eigene.name },
          verfuegbar: standGueltig(daten, eigene),
          sperre: sperre(daten, eigene),
        },
        geerbt: null,
      }
    }
    const erbe = seating.get(t.id)
    if (!erbe) return { direkt: null, geerbt: null }
    const inhaber = standSeating(d, seating).get(erbe.standId)
    return {
      direkt: null,
      geerbt: {
        stand: erbe,
        verfuegbar: standGueltig(daten, erbe),
        belegtVon: inhaber && inhaber !== t.id ? nameVon(daten, inhaber) : null,
        ausserhalb: !d.stands.some((s) => s.standId === erbe.standId),
        sperre: sperre(daten, erbe),
      },
    }
  }

  const zeileVon = (t: TeilnehmerRoh): Zeile => {
    const zellen: Record<string, Zelle> = { [JAGDWEIT]: zelleJagdweit(t) }
    for (const d of treiben) zellen[d.id] = zelleTreiben(t, d)
    return { teilnahmeId: t.id, userId: t.user_id, name: nameVon(daten, t.id), rolle: t.role, zellen }
  }

  const sortiert = (liste: Zeile[]) =>
    liste.sort((a, b) => rang(a.rolle) - rang(b.rolle) || a.name.localeCompare(b.name, 'de'))

  const zeilen = sortiert(daten.teilnehmer.filter(zuweisbar).map(zeileVon))

  // Ausgeschieden mit Zuweisung: hält in der App weiter einen Stand (B11).
  const ausgeschiedene = sortiert(
    daten.teilnehmer
      .filter((t) => !zuweisbar(t))
      .map(zeileVon)
      .filter((z) => Object.values(z.zellen).some((c) => c.direkt !== null)),
  )

  const gueltigeStaende = (d: HuntDrive | null): string[] =>
    d
      ? d.stands.filter((s) => standGueltig(daten, s)).map((s) => s.standId)
      : daten.objekte.map((o) => o.id)

  const spalte = (d: HuntDrive | null): Spalte => {
    const belegt = standSeating(d, seating)
    return {
      schluessel: d ? d.id : JAGDWEIT,
      titel: d ? d.name : 'Jagdweit',
      treiben: d,
      schreibbar: laufendes === null && (d === null || d.status === 'pending'),
      ohneStand: zeilen.filter((z) =>
        d ? effectiveStand(z.teilnahmeId, d, seating) === null : !seating.has(z.teilnahmeId),
      ).length,
      frei: gueltigeStaende(d).filter((id) => !belegt.has(id)).length,
    }
  }

  return {
    spalten: [spalte(null), ...treiben.map(spalte)],
    zeilen,
    ausgeschiedene,
    laeuft: laufendes?.name ?? null,
  }
}

/** Ein wählbarer Stand in der Liste einer Zelle. */
export interface Angebot {
  standId: string
  name: string
  /**
   * Die Zeile, auf die die RPC zielt. Jagdweit kann sie fehlen: dann legt das
   * Portal sie vor dem Umsetzen an (E2).
   */
  zeileId: string | null
  /** Wer die Zeile DIREKT hält — er wird verdrängt (E3). */
  inhaber: { teilnahmeId: string | null; name: string } | null
  /** Treiben-Spalte: wer den Stand jagdweit hält und hier erbt (B4-Hinweis). */
  erbtHier: string | null
  sperre: Sperre
  /** Steht die Person schon dort? */
  aktuell: boolean
}

function inhaberJagdweit(daten: VerteilenDaten, sitz: SeatRow | undefined): Angebot['inhaber'] {
  if (!sitz?.user_id) return null
  const t = daten.teilnehmer.find((x) => x.user_id === sitz.user_id)
  return { teilnahmeId: t?.id ?? null, name: t ? nameVon(daten, t.id) : 'Unbekannt' }
}

/**
 * Was eine Zelle anbietet: jagdweit die Stände des Reviers (eine fehlende
 * Sitzzeile legt E2 an), je Treiben die gültigen Stände seiner Standmenge —
 * die RPC braucht eine vorhandene Standzeile.
 */
export function angebote(daten: VerteilenDaten, spalte: string, teilnahmeId: string): Angebot[] {
  const t = daten.teilnehmer.find((x) => x.id === teilnahmeId)
  const liste: Angebot[] = []

  if (spalte === JAGDWEIT) {
    for (const o of daten.objekte) {
      const sitz = daten.sitze.find((s) => s.seat_type === 'assigned' && s.seat_id === o.id)
      const inhaber = inhaberJagdweit(daten, sitz)
      liste.push({
        standId: o.id,
        name: o.name,
        zeileId: sitz?.id ?? null,
        inhaber,
        erbtHier: null,
        sperre: sperre(daten, { standId: o.id, kind: 'fixed' }),
        aktuell: !!t?.user_id && sitz?.user_id === t.user_id,
      })
    }
  } else {
    const roh = daten.treiben.find((d) => d.id === spalte)
    if (!roh) return []
    const d = alsTreiben(roh)
    const seating = buildHuntSeating(daten.sitze, refs(daten.teilnehmer))
    const direkt = new Set(d.stands.map((s) => s.participantId).filter(Boolean))
    for (const s of d.stands) {
      if (!standGueltig(daten, s)) continue
      let erbtHier: string | null = null
      for (const [pid, st] of seating) {
        if (st.standId === s.standId && !direkt.has(pid)) erbtHier = nameVon(daten, pid)
      }
      liste.push({
        standId: s.standId,
        name: s.name,
        zeileId: s.id,
        inhaber: s.participantId ? { teilnahmeId: s.participantId, name: nameVon(daten, s.participantId) } : null,
        erbtHier,
        sperre: sperre(daten, s),
        aktuell: s.participantId === teilnahmeId,
      })
    }
  }
  return liste.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
}

/**
 * Wohin eine Person in einem Treiben fällt, wenn ihre Treiben-Zuweisung dort
 * wegfällt — **aus dem Resolver, also das, was die App zeigen wird** (E3,
 * Codex R3-5), nicht aus der Portal-Einstufung „nicht verfügbar".
 */
export interface Rueckfall {
  stand: SeatedStand | null
  /** Wem die App diesen Stand in diesem Treiben dann gibt, falls nicht ihr selbst. */
  dortAuch: string | null
  sperre: Sperre
}

function rueckfall(daten: VerteilenDaten, treibenNachher: HuntDrive, teilnahmeId: string): Rueckfall {
  const seating = buildHuntSeating(daten.sitze, refs(daten.teilnehmer))
  const stand = effectiveStand(teilnahmeId, treibenNachher, seating)
  if (!stand) return { stand: null, dortAuch: null, sperre: 'offen' }
  const inhaber = standSeating(treibenNachher, seating).get(stand.standId)
  return {
    stand,
    dortAuch: inhaber && inhaber !== teilnahmeId ? nameVon(daten, inhaber) : null,
    sperre: sperre(daten, stand),
  }
}

/** Das Treiben, wie es nach `treiben_stand_umsetzen(zeile, person)` aussieht (141). */
function nachUmsetzen(d: HuntDrive, zeileId: string, teilnahmeId: string | null): HuntDrive {
  return {
    ...d,
    stands: d.stands.map((s) =>
      s.id === zeileId
        ? { ...s, participantId: teilnahmeId }
        : teilnahmeId !== null && s.participantId === teilnahmeId
          ? { ...s, participantId: null }
          : s,
    ),
  }
}

export function rueckfallText(name: string, treibenName: string, r: Rueckfall): string {
  if (!r.stand) return `${name} hat in ${treibenName} dann keinen Stand.`
  let text = `${name} fällt in ${treibenName} auf den jagdweiten Stand ${r.stand.name} zurück`
  if (r.dortAuch) text += ` — dort steht dann auch ${r.dortAuch}`
  if (r.sperre === 'gesperrt') text += ` — ${r.stand.name} ist gesperrt`
  return `${text}.`
}

/**
 * Was ein Write bewirkt und worauf seine Rückfrage beruht — das **Bild**
 * (E10). Es wird einmal aus dem geladenen Stand gerechnet (für die Rückfrage)
 * und nach der Bestätigung noch einmal aus FRISCH gelesenen Daten. Weicht es
 * ab, wird nicht geschrieben: dann gilt die Rückfrage nicht mehr.
 *
 * `standId = null` heisst „leeren" bzw. „entfernen" — nur an einer direkten
 * Zuweisung (E5).
 */
export interface Bild {
  /** Die Person darf (noch) einen Stand bekommen (Codex R3-7); beim Leeren immer wahr. */
  empfaengerZuweisbar: boolean
  /** Die Zielzeile — `null` jagdweit, wenn sie erst angelegt werden muss. */
  zeileId: string | null
  /** Der direkte Inhaber der Zielzeile vor dem Write, wenn nicht die Person selbst. */
  verdraengt: { teilnahmeId: string | null; name: string } | null
  zielSperre: Sperre
  /** Treiben-Spalte: Rückfall des Verdrängten bzw. beim Leeren der Person selbst. */
  rueckfall: Rueckfall | null
  /** Der Satz für die Rückfrage, `null` = keine nötig. */
  frage: string | null
}

export function bild(
  daten: VerteilenDaten,
  spalte: string,
  teilnahmeId: string,
  standId: string | null,
): Bild | null {
  const t = daten.teilnehmer.find((x) => x.id === teilnahmeId)
  // Jagdweit hängt die Sitzordnung an `user_id` — ein Gast ohne Konto bekommt
  // nur je Treiben einen Stand (B1).
  const empfaengerZuweisbar =
    standId === null || (!!t && zuweisbar(t) && (spalte !== JAGDWEIT || t.user_id !== null))

  if (spalte === JAGDWEIT) {
    if (standId === null) {
      const sitz = standSitz(daten, t?.user_id ?? null)
      if (!sitz) return null
      return { empfaengerZuweisbar, zeileId: sitz.id, verdraengt: null, zielSperre: 'offen', rueckfall: null, frage: null }
    }
    const ziel = angebote(daten, JAGDWEIT, teilnahmeId).find((a) => a.standId === standId)
    if (!ziel) return null
    const verdraengt = ziel.inhaber && ziel.inhaber.teilnahmeId !== teilnahmeId ? ziel.inhaber : null
    return {
      empfaengerZuweisbar,
      zeileId: ziel.zeileId,
      verdraengt,
      zielSperre: ziel.sperre,
      rueckfall: null,
      frage: verdraengt
        ? `${verdraengt.name} hat dann keinen jagdweiten Stand; die Treiben-Zuweisungen bleiben.`
        : null,
    }
  }

  const roh = daten.treiben.find((d) => d.id === spalte)
  if (!roh) return null
  const d = alsTreiben(roh)

  if (standId === null) {
    const eigene = d.stands.find((s) => s.participantId === teilnahmeId)
    if (!eigene) return null
    const r = rueckfall(daten, nachUmsetzen(d, eigene.id, null), teilnahmeId)
    return { empfaengerZuweisbar, zeileId: eigene.id, verdraengt: null, zielSperre: 'offen', rueckfall: r, frage: null }
  }

  const ziel = angebote(daten, spalte, teilnahmeId).find((a) => a.standId === standId)
  if (!ziel || !ziel.zeileId) return null
  const verdraengt = ziel.inhaber && ziel.inhaber.teilnahmeId !== teilnahmeId ? ziel.inhaber : null
  const r =
    verdraengt?.teilnahmeId != null
      ? rueckfall(daten, nachUmsetzen(d, ziel.zeileId, teilnahmeId), verdraengt.teilnahmeId)
      : null
  return {
    empfaengerZuweisbar,
    zeileId: ziel.zeileId,
    verdraengt,
    zielSperre: ziel.sperre,
    rueckfall: r,
    frage: verdraengt
      ? r
        ? rueckfallText(verdraengt.name, d.name, r)
        : `${verdraengt.name} hat in ${d.name} dann keinen Stand.`
      : null,
  }
}

/**
 * Gleich im Sinne von E10: dieselbe Rückfrage wäre auf dem neuen Stand noch
 * wahr. **Ohne `zeileId`:** eine jagdweite Sitzzeile, die eine zweite Sitzung
 * inzwischen leer angelegt hat, ändert an der Folge nichts (E2), und eine neu
 * angelegte Treiben-Standzeile meint denselben Stand. Geschrieben wird auf die
 * `zeileId` des FRISCHEN Bilds.
 */
export function gleichesBild(a: Bild | null, b: Bild | null): boolean {
  if (!a || !b) return a === b
  // „unbekannt" vorher, „offen" jetzt ist mehr Wissen, keine Abweichung: der
  // Nutzer hat für den ungünstigeren Fall schon bestätigt (Schlusslesung F5).
  // „unbekannt" → „gesperrt" bleibt eine Abweichung.
  const angeglichen = (vorher: Sperre, jetzt: Sperre): Sperre =>
    vorher === 'unbekannt' && jetzt === 'offen' ? 'unbekannt' : jetzt
  const b2: Bild = {
    ...b,
    zielSperre: angeglichen(a.zielSperre, b.zielSperre),
    rueckfall:
      b.rueckfall && a.rueckfall
        ? { ...b.rueckfall, sperre: angeglichen(a.rueckfall.sperre, b.rueckfall.sperre) }
        : b.rueckfall,
  }
  const ohneZeile = (x: Bild) => ({ ...x, zeileId: undefined })
  return JSON.stringify(ohneZeile(a)) === JSON.stringify(ohneZeile(b2))
}

/** Der Satz zum Leeren einer Treiben-Zelle — nennt den Rückfall (E3). */
export function leerenText(daten: VerteilenDaten, spalte: string, teilnahmeId: string): string {
  if (spalte === JAGDWEIT) return 'Jagdweiten Stand entfernen'
  const b = bild(daten, spalte, teilnahmeId, null)
  const r = b?.rueckfall
  if (!r?.stand) return 'Treiben-Zuweisung entfernen — dann ohne Stand'
  let text = `Treiben-Zuweisung entfernen — fällt auf ${r.stand.name} (jagdweit) zurück`
  if (r.dortAuch) text += `, dort steht auch ${r.dortAuch}`
  if (r.sperre === 'gesperrt') text += `, gesperrt`
  return text
}

/**
 * Die Beschriftung der Karte für eine Spalte: Stand → Name, wie die App sie
 * beim Verteilen zeigt (`standLabels` mit dem geplanten Treiben). Jagdweit
 * ohne Treiben. Läuft ein Treiben, legt die App es darunter — die Matrix ist
 * dann ohnehin read-only (B9).
 */
export function kartenNamen(daten: VerteilenDaten, spalte: string): Record<string, string> {
  const seating = buildHuntSeating(daten.sitze, refs(daten.teilnehmer))
  const treiben = daten.treiben.map(alsTreiben)
  const laufendes = treiben.find((d) => d.status === 'active') ?? null
  const geplant = spalte === JAGDWEIT ? null : (treiben.find((d) => d.id === spalte) ?? null)
  return standLabels(laufendes, seating, (pid) => daten.namen.get(pid), geplant)
}
