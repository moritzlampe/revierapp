// species-config.ts
// Zentrale Wildart-Konfiguration für Erlegung-Feature
// Wird vom Wildart-Picker (58.1d) und Strecke-Tab verwendet

export type WildArt =
  | 'rehbock' | 'ricke' | 'rehkitz' | 'bockkitz' | 'schmalbock'
  | 'schmalreh' | 'rehwild_unspez'
  | 'keiler' | 'bache' | 'ueberlaeufer' | 'frischling'
  | 'schwarzwild_unspez'
  | 'rothirsch' | 'rottier' | 'rotkalb' | 'schmaltier_rot' | 'spiesser_rot'
  | 'rotwild_unspez'
  | 'damhirsch' | 'damtier' | 'damkalb' | 'schmaltier_dam' | 'spiesser_dam'
  | 'damwild_unspez'
  | 'fuchs' | 'dachs' | 'waschbaer' | 'marderhund'
  | 'hase' | 'wildkaninchen'
  | 'fasan' | 'taube' | 'kraehe' | 'gans' | 'ente'
  | 'sonstiges'

export type WildGroup =
  | 'rehwild' | 'schwarzwild' | 'rotwild' | 'damwild'
  | 'raubwild' | 'hasenartig' | 'federwild' | 'sonstiges'

export type Geschlecht = 'maennlich' | 'weiblich' | 'unbekannt'

// Wildgruppe → Liste aller wild_art-Werte (für DB-Queries und Filter)
export const WILD_GROUPS: Record<WildGroup, WildArt[]> = {
  rehwild: ['rehbock', 'ricke', 'rehkitz', 'bockkitz', 'schmalbock', 'schmalreh', 'rehwild_unspez'],
  schwarzwild: ['keiler', 'bache', 'ueberlaeufer', 'frischling', 'schwarzwild_unspez'],
  rotwild: ['rothirsch', 'rottier', 'rotkalb', 'schmaltier_rot', 'spiesser_rot', 'rotwild_unspez'],
  damwild: ['damhirsch', 'damtier', 'damkalb', 'schmaltier_dam', 'spiesser_dam', 'damwild_unspez'],
  raubwild: ['fuchs', 'dachs', 'waschbaer', 'marderhund'],
  hasenartig: ['hase', 'wildkaninchen'],
  federwild: ['fasan', 'taube', 'kraehe', 'gans', 'ente'],
  sonstiges: ['sonstiges'],
}

// Reverse-Mapping: wild_art → Wildgruppe (für Anzeige in Strecke-Tab etc.)
export const WILD_ART_TO_GROUP: Record<WildArt, WildGroup> =
  Object.entries(WILD_GROUPS).reduce((acc, [group, arten]) => {
    arten.forEach(art => { acc[art] = group as WildGroup })
    return acc
  }, {} as Record<WildArt, WildGroup>)

// UI-Konfiguration je Wildgruppe (Stufe 1 im Picker)
export interface WildGroupConfig {
  group: WildGroup
  label: string
  emoji: string
  unspezValue: WildArt | null  // direkter "Bestätigen ohne Detail"-Wert
  hasGeschlecht: boolean        // Stufe-2-Frage anbieten?
  hasAltersklasse: boolean      // Stufe-3-Frage anbieten?
  /**
   * Aggregations-Default für Tagebuch-Timeline.
   * true  = mehrere Stücke am gleichen Tag werden zu 1 Strecke-Card zusammengefasst.
   * false = jedes Stück eigene Erlegung-Card. Solo-Schwellen-Override
   *         kann das in timeline.ts trotzdem aggregieren (>= SOLO_AGGREGATE_THRESHOLD).
   */
  aggregatePerDay: boolean
}

export const WILD_GROUP_CONFIG: WildGroupConfig[] = [
  { group: 'rehwild', label: 'Rehwild', emoji: '🦌', unspezValue: 'rehwild_unspez', hasGeschlecht: true, hasAltersklasse: true, aggregatePerDay: false },
  { group: 'schwarzwild', label: 'Schwarzwild', emoji: '🐗', unspezValue: 'schwarzwild_unspez', hasGeschlecht: true, hasAltersklasse: true, aggregatePerDay: false },
  { group: 'raubwild', label: 'Raubwild', emoji: '🦊', unspezValue: null, hasGeschlecht: false, hasAltersklasse: false, aggregatePerDay: false },
  { group: 'rotwild', label: 'Rotwild', emoji: '🦌', unspezValue: 'rotwild_unspez', hasGeschlecht: true, hasAltersklasse: true, aggregatePerDay: false },
  { group: 'hasenartig', label: 'Hasenartig', emoji: '🐰', unspezValue: null, hasGeschlecht: false, hasAltersklasse: false, aggregatePerDay: true },
  { group: 'federwild', label: 'Federwild', emoji: '🦆', unspezValue: null, hasGeschlecht: false, hasAltersklasse: false, aggregatePerDay: true },
  { group: 'damwild', label: 'Damwild', emoji: '🦌', unspezValue: 'damwild_unspez', hasGeschlecht: true, hasAltersklasse: true, aggregatePerDay: false },
  { group: 'sonstiges', label: 'Sonstiges', emoji: '❓', unspezValue: 'sonstiges', hasGeschlecht: false, hasAltersklasse: false, aggregatePerDay: true },
]

// Detail-Konfiguration je Wildgruppe (Stufe 2/3 — Geschlecht/Altersklasse)
export interface DetailOption {
  value: WildArt
  label: string
}

export interface GeschlechtOption {
  value: Geschlecht
  label: string
}

export type ImpliedGeschlecht = 'maennlich' | 'weiblich' | null

export interface AltersklasseEntry {
  value: WildArt
  label: string
  impliedGeschlecht: ImpliedGeschlecht
}

export interface WildGroupDetailConfig {
  geschlechter: GeschlechtOption[]
  altersklassen: AltersklasseEntry[]
}

export const WILD_GROUP_DETAILS: Partial<Record<WildGroup, WildGroupDetailConfig>> = {
  rehwild: {
    geschlechter: [
      { value: 'maennlich', label: 'Männlich' },
      { value: 'weiblich', label: 'Weiblich' },
    ],
    altersklassen: [
      { value: 'rehkitz',   label: 'Kitz',      impliedGeschlecht: null },
      { value: 'bockkitz',  label: 'Bockkitz',   impliedGeschlecht: 'maennlich' },
      { value: 'schmalreh', label: 'Schmalreh',  impliedGeschlecht: 'weiblich' },
      { value: 'ricke',     label: 'Ricke',      impliedGeschlecht: 'weiblich' },
      { value: 'rehbock',   label: 'Bock',       impliedGeschlecht: 'maennlich' },
      // schmalbock vorerst ausgeblendet, bleibt im Enum für späteres Edit-Feature
    ],
  },
  schwarzwild: {
    geschlechter: [
      { value: 'maennlich', label: 'Männlich' },
      { value: 'weiblich', label: 'Weiblich' },
    ],
    altersklassen: [
      { value: 'frischling',  label: 'Frischling',  impliedGeschlecht: null },
      { value: 'ueberlaeufer', label: 'Überläufer', impliedGeschlecht: null },
      { value: 'bache',       label: 'Bache',       impliedGeschlecht: 'weiblich' },
      { value: 'keiler',      label: 'Keiler',      impliedGeschlecht: 'maennlich' },
    ],
  },
  rotwild: {
    geschlechter: [
      { value: 'maennlich', label: 'Männlich' },
      { value: 'weiblich', label: 'Weiblich' },
    ],
    altersklassen: [
      { value: 'rotkalb',       label: 'Kalb',       impliedGeschlecht: null },
      { value: 'schmaltier_rot', label: 'Schmaltier', impliedGeschlecht: 'weiblich' },
      { value: 'rottier',       label: 'Tier',        impliedGeschlecht: 'weiblich' },
      { value: 'spiesser_rot',  label: 'Spießer',    impliedGeschlecht: 'maennlich' },
      { value: 'rothirsch',     label: 'Hirsch',      impliedGeschlecht: 'maennlich' },
    ],
  },
  damwild: {
    geschlechter: [
      { value: 'maennlich', label: 'Männlich' },
      { value: 'weiblich', label: 'Weiblich' },
    ],
    altersklassen: [
      { value: 'damkalb',        label: 'Kalb',       impliedGeschlecht: null },
      { value: 'schmaltier_dam', label: 'Schmaltier', impliedGeschlecht: 'weiblich' },
      { value: 'damtier',        label: 'Tier',        impliedGeschlecht: 'weiblich' },
      { value: 'spiesser_dam',   label: 'Spießer',    impliedGeschlecht: 'maennlich' },
      { value: 'damhirsch',      label: 'Hirsch',      impliedGeschlecht: 'maennlich' },
    ],
  },
  // raubwild / hasenartig / federwild / sonstiges: keine Stufen,
  // direkt Tier-Auswahl als flaches Grid (siehe FLAT_GROUP_TIERE)
}

// Direkte Tier-Auswahl für Gruppen ohne Geschlecht/Alter-Stufen
export const FLAT_GROUP_TIERE: Partial<Record<WildGroup, DetailOption[]>> = {
  raubwild: [
    { value: 'fuchs', label: 'Fuchs' },
    { value: 'dachs', label: 'Dachs' },
    { value: 'waschbaer', label: 'Waschbär' },
    { value: 'marderhund', label: 'Marderhund' },
  ],
  hasenartig: [
    { value: 'hase', label: 'Hase' },
    { value: 'wildkaninchen', label: 'Kaninchen' },
  ],
  federwild: [
    { value: 'fasan', label: 'Fasan' },
    { value: 'ente', label: 'Ente' },
    { value: 'taube', label: 'Taube' },
    { value: 'gans', label: 'Gans' },
    { value: 'kraehe', label: 'Krähe' },
  ],
}

/**
 * Schwellenwert für Solo-Schalenwild-Aggregation auf Einzeljagd.
 * Wenn auf einer Hunt mit < 2 Teilnehmern eine Wildgruppe (auch eine mit
 * aggregatePerDay=false) >= dieser Anzahl Stücke hat, wird trotzdem zu
 * einer Strecke-Card zusammengefasst.
 *
 * Begründung: Sicherheitsnetz gegen falsch-deklarierte Drückjagden und
 * gegen vergessene aggregatePerDay-Flags bei seltenen Wildarten.
 */
export const SOLO_AGGREGATE_THRESHOLD = 5

// Wildgruppen-Reihenfolge wie im Picker (WILD_GROUP_CONFIG-Array-Order).
// Tie-Breaker für aggregateByWildGroup bei Count-Gleichstand.
const GROUP_ORDER: WildGroup[] = WILD_GROUP_CONFIG.map(c => c.group)

export interface WildGroupAggregateItem {
  groupKey: WildGroup
  groupLabel: string
  count: number
}

/**
 * Aggregiert eine Kill-Liste zu Wildgruppen-Summen (Sprint 60.5b).
 *
 * Mapping wild_art → Wildgruppe via WILD_ART_TO_GROUP; unbekannte
 * wild_art-Werte (nicht im Mapping) fallen unter 'sonstiges'.
 *
 * Sortierung: Count absteigend, bei Gleichstand Picker-Reihenfolge
 * (WILD_GROUP_CONFIG-Index aufsteigend) — stabil/reproduzierbar.
 *
 * Reine Funktion. Leeres Array → leeres Array.
 */
export function aggregateByWildGroup(
  kills: Array<{ wild_art: string }>,
): WildGroupAggregateItem[] {
  const counts = new Map<WildGroup, number>()
  for (const k of kills) {
    const group = WILD_ART_TO_GROUP[k.wild_art as WildArt] ?? 'sonstiges'
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([groupKey, count]) => ({
      groupKey,
      groupLabel:
        WILD_GROUP_CONFIG.find(c => c.group === groupKey)?.label ?? groupKey,
      count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        GROUP_ORDER.indexOf(a.groupKey) - GROUP_ORDER.indexOf(b.groupKey),
    )
}

/**
 * Wie aggregateByWildGroup, aber liefert IMMER alle 8 Wildgruppen in fester
 * Picker-Reihenfolge (WILD_GROUP_CONFIG-Order) mit Zero-Fill für Gruppen ohne
 * Erlegung. Für das Bestiarium-Grid (Sprint 60.5f): feste Kachel-Positionen
 * (Muscle Memory, 1:1 zum Picker), Null-Gruppen werden ausgegraut statt
 * weggelassen. Reine Funktion. Leeres Array → alle 8 mit count 0.
 */
export function aggregateWildGroupsFull(
  kills: Array<{ wild_art: string }>,
): WildGroupAggregateItem[] {
  const counts = new Map<WildGroup, number>()
  for (const k of kills) {
    const group = WILD_ART_TO_GROUP[k.wild_art as WildArt] ?? 'sonstiges'
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  return WILD_GROUP_CONFIG.map(c => ({
    groupKey: c.group,
    groupLabel: c.label,
    count: counts.get(c.group) ?? 0,
  }))
}
