/**
 * Jagden — reine Logik, ohne React und ohne Supabase.
 *
 * Portal-Phase 4a (`QuickHunt_Konzept_Revierzentrale_V1.md` §5). Der Bereich
 * bereitet Jagden VOR; der Jagdtag selbst läuft nativ. Aktive Jagden sind hier
 * ausdrücklich read-only (§3) — "ein offener Browser darf keine laufende
 * Feldsituation umschreiben".
 */

/** `hunt_type` — vier Werte, in den Daten bisher nur zwei (Konzept §4.3). */
export const JAGDARTEN = ['ansitz', 'pirsch', 'drueckjagd', 'erntejagd'] as const
export type Jagdart = (typeof JAGDARTEN)[number]

/** `hunt_status`. `draft` schreibt nativ niemand — die App kennt nur
 *  `scheduled` und `active` (draft.ts). Der Wert steht trotzdem hier, weil die
 *  DB ihn führt und eine Zeile aus einem anderen Weg ihn tragen könnte. */
export const JAGDSTATUS = [
  'draft',
  'scheduled',
  'active',
  'paused',
  'completed',
  'auto_completed',
] as const
export type Jagdstatus = (typeof JAGDSTATUS)[number]

export interface Jagd {
  id: string
  name: string | null
  type: Jagdart | null
  status: Jagdstatus | null
  scheduled_for: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string | null
}

/** Eine Teilnehmerzeile, so weit die Liste sie braucht. */
export interface Teilnahme {
  hunt_id: string
  status: string | null
}

export interface Zusagen {
  zugesagt: number
  offen: number
  abgesagt: number
}

export const KEINE_ZUSAGEN: Zusagen = { zugesagt: 0, offen: 0, abgesagt: 0 }

// ---------------------------------------------------------------------------
// Beschriftungen
// ---------------------------------------------------------------------------

const ART_LABEL: Record<Jagdart, string> = {
  ansitz: 'Ansitz',
  pirsch: 'Pirsch',
  drueckjagd: 'Drückjagd',
  erntejagd: 'Erntejagd',
}

export function jagdart(type: string | null): string {
  return ART_LABEL[type as Jagdart] ?? 'Unbekannt'
}

/**
 * `auto_completed` und `completed` heißen beide "Beendet".
 *
 * Der Unterschied ist eine Betriebsinnerei — hat der Leiter beendet oder eine
 * Zeitgrenze? — und für den, der die Liste liest, keine Auskunft. Nativ steht
 * an derselben Stelle dieselbe Zusammenfassung (`isHuntEnded`).
 */
const STATUS_LABEL: Record<Jagdstatus, string> = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  active: 'Läuft',
  paused: 'Pause',
  completed: 'Beendet',
  auto_completed: 'Beendet',
}

export function jagdstatus(status: string | null): string {
  return STATUS_LABEL[status as Jagdstatus] ?? 'Unbekannt'
}

/** Läuft gerade — dann ist die Jagd im Portal read-only (Konzept §3). */
export function laeuft(status: string | null): boolean {
  return status === 'active' || status === 'paused'
}

export function beendet(status: string | null): boolean {
  return status === 'completed' || status === 'auto_completed'
}

/** Vorbereitbar: nur was weder läuft noch beendet ist. */
export function vorbereitbar(status: string | null): boolean {
  return !laeuft(status) && !beendet(status)
}

// ---------------------------------------------------------------------------
// Termin
// ---------------------------------------------------------------------------

/**
 * Wann die Jagd war oder sein wird — in dieser Reihenfolge.
 *
 * **`scheduled_for` steht bewusst vorn, obwohl es seltener gefüllt ist.**
 * Gemessen am 03.08.2026 über Brockwinel: 4 von 18 Jagden tragen einen Termin,
 * die übrigen haben nur `started_at`. Der Grund ist der native Anlege-Flow —
 * "Sofort starten" schreibt `scheduled_for = null` und startet. Wer die Spalte
 * ignoriert und nur `started_at` läse, verlöre die einzige geplante Jagd im
 * Bestand aus der Sortierung, also genau die, die vorbereitet werden soll.
 */
export function termin(jagd: Jagd): string | null {
  return jagd.scheduled_for ?? jagd.started_at ?? jagd.created_at
}

/**
 * Termin als deutscher Text.
 *
 * **`timeZone` ist gesetzt, und das ist keine Kosmetik.** Die Seite rendert auf
 * dem Server (UTC) und im Browser (Berlin); ohne feste Zone liefern beide
 * verschiedene Zeichen, und React meldet einen Hydration-Mismatch. Dieselbe
 * Falle wie bei `erlegt_am` in Migration 087, nur eine Ebene höher.
 *
 * Ohne Uhrzeit, wenn keine gesetzt ist — eine Jagd "am 15.04.2027 um 00:00"
 * behauptet eine Genauigkeit, die in der Zeile nicht steht.
 */
export function terminText(wert: string | null, mitUhrzeit = true): string {
  if (!wert) return '—'
  const d = new Date(wert)
  if (Number.isNaN(d.getTime())) return '—'
  const datum = d.toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  if (!mitUhrzeit) return datum
  const zeit = d.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  })
  return zeit === '00:00' ? datum : `${datum}, ${zeit}`
}

/**
 * Sortierschlüssel. Offene und geplante zuerst (aufsteigend: das Nächste
 * oben), beendete danach (absteigend: das Letzte oben).
 *
 * Der Schreibtisch fragt "was ist als Nächstes vorzubereiten" (§1.3), nicht
 * "was war zuletzt". Eine rein chronologische Liste hätte die 17 beendeten
 * Jagden über die eine geplante gelegt.
 */
export function sortiere(jagden: readonly Jagd[]): Jagd[] {
  const zeit = (j: Jagd) => {
    const t = termin(j)
    return t ? new Date(t).getTime() : 0
  }
  const offen = jagden.filter((j) => !beendet(j.status)).sort((a, b) => zeit(a) - zeit(b))
  const alt = jagden.filter((j) => beendet(j.status)).sort((a, b) => zeit(b) - zeit(a))
  return [...offen, ...alt]
}

// ---------------------------------------------------------------------------
// Zusagen
// ---------------------------------------------------------------------------

/**
 * Zählt die Teilnahmen je Jagd.
 *
 * `declined` gibt es erst mit Migration 088 — bis dahin löschte eine Absage
 * die Zeile, und `abgesagt` bleibt hier schlicht 0. Der Zweig steht trotzdem
 * schon da: sobald 088 appliziert ist, zählt er ohne weitere Änderung.
 *
 * `left` zählt NICHT als Absage. Wer erst zusagt und dann geht, hat etwas
 * anderes getan als wer nie zusagt — die Liste würde beides vermischen. Im
 * Bestand steht ohnehin keine einzige Zeile auf `left`.
 */
export function zusagen(teilnahmen: readonly Teilnahme[]): Map<string, Zusagen> {
  const map = new Map<string, Zusagen>()
  for (const t of teilnahmen) {
    const z = map.get(t.hunt_id) ?? { ...KEINE_ZUSAGEN }
    if (t.status === 'joined') z.zugesagt += 1
    else if (t.status === 'invited') z.offen += 1
    else if (t.status === 'declined') z.abgesagt += 1
    map.set(t.hunt_id, z)
  }
  return map
}

// ---------------------------------------------------------------------------
// Filter — Zustand gehört in die URL (Konzept §2.4)
// ---------------------------------------------------------------------------

export const FILTER = ['alle', 'offen', 'geplant', 'beendet'] as const
export type Filter = (typeof FILTER)[number]

export function alsFilter(wert: string | undefined): Filter {
  return FILTER.includes(wert as Filter) ? (wert as Filter) : 'alle'
}

export function filtere(jagden: readonly Jagd[], filter: Filter): Jagd[] {
  switch (filter) {
    case 'offen':
      return jagden.filter((j) => !beendet(j.status))
    case 'geplant':
      return jagden.filter((j) => j.status === 'scheduled' || j.status === 'draft')
    case 'beendet':
      return jagden.filter((j) => beendet(j.status))
    default:
      return [...jagden]
  }
}

/**
 * Next liefert jeden Suchparameter als `string[]`, sobald er mehrfach in der
 * Adresse steht. Gleiche Begründung wie in `gaeste/kontakte.ts`.
 */
export function ersterWert(wert: string | string[] | undefined): string | undefined {
  return Array.isArray(wert) ? wert[0] : wert
}
