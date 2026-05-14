import { createClient } from '@/lib/supabase/server'
import {
  type WildArt,
  type WildGroup,
  WILD_ART_TO_GROUP,
  WILD_GROUP_CONFIG,
  SOLO_AGGREGATE_THRESHOLD,
} from '@/lib/species-config'
import type { Jagdjahr } from './season'
import { toBerlinDateKey } from './time'

// ---------- Public types (UI contract) ----------

export type TimelineItem =
  | TimelineErlegung
  | TimelineStrecke
  | TimelineGesell
  | TimelineAnblick

interface TimelineBase {
  /** Stable React key derived from kind/hunt/date */
  id: string
  /** Date object for sorting and rendering */
  occurredAt: Date
  huntId: string | null
}

export interface TimelineErlegung extends TimelineBase {
  kind: 'erlegung'
  killId: string
  species: WildArt
  species_group: WildGroup
  gewichtKg: number | null
  distanceM: number | null
  fotoUrl: string | null
  notiz: string | null
  weatherSnapshot: { temp_c?: number; wind_dir?: string } | null
  /** Hunt-Name oder null bei orphan-Kills (hunt_id NULL) */
  place: string | null
}

export interface TimelineStrecke extends TimelineBase {
  kind: 'strecke'
  species_group: WildGroup
  speciesBreakdown: { species: WildArt; count: number }[]
  totalCount: number
  huntName: string | null
}

export interface TimelineGesell extends TimelineBase {
  kind: 'gesell'
  huntName: string
  /** Raw enum value, fallback string for forward-compat */
  huntKind: 'group' | 'solo' | string
  /** Roh-Wert von hunts.type ('ansitz' | 'pirsch' | 'drueckjagd' | 'erntejagd' …) */
  huntType: string
  /** Roh-Wert von hunts.status — UI markiert 'auto_completed' mit Chip */
  huntStatus: string | null
  /** True wenn driven_hunt_id NICHT NULL */
  isDriven: boolean
  teilnehmerCount: number
  /** Nur User's eigene Kills, aggregiert nach species */
  deinAnteil: { species: WildArt; count: number }[]
  /** Nur User's eigene Sightings auf diesem Hunt, aggregiert nach species (Freitext) */
  deineAnblicke: { species: string; count: number }[]
  /** 'locked' wenn share_total_strecke=false UND user !== creator_id */
  gesamtStrecke: { species: WildArt; count: number }[] | 'locked'
  startedAt: Date | null
  endedAt: Date | null
  notiz: string | null
  /** Anzahl Kills mit nachsuche=true (alle Reporter wenn visible, sonst nur User) */
  nachsucheCount: number
}

export interface TimelineAnblick extends TimelineBase {
  kind: 'anblick'
  /** Hunt-Name wenn huntId !== null (Hunt-Kontext "ohne Strecke"), sonst null (Solo-Tag) */
  huntName: string | null
  /** Roh-Wert von hunts.type ('ansitz' | 'pirsch' | 'drueckjagd' | 'erntejagd' …) — null bei Solo */
  huntType: string | null
  /** Roh-Wert von hunts.status — null bei Solo-Tag; UI markiert 'auto_completed' mit Chip */
  huntStatus: string | null
  /** Pro species aggregiert mittels SUM(wild_events.count). species ist Freitext. */
  sightings: { species: string; count: number }[]
  /** Hunt-Kontext: hunt.started_at; Solo: frühestes occurred_at des Tages */
  startedAt: Date | null
  /** Hunt-Kontext: hunt.ended_at; Solo: spätestes occurred_at des Tages */
  endedAt: Date | null
  /** Hunt-Kontext: hunt.notiz; Solo: erste nicht-leere wild_events.note */
  notiz: string | null
}

// ---------- Internal row shapes ----------

interface KillRow {
  id: string
  hunt_id: string | null
  wild_art: string
  gewicht_kg: number | null
  foto_url: string | null
  distance_m: number | null
  erlegt_am: string | null
  notiz: string | null
  weather_snapshot: unknown
  nachsuche: boolean | null
}

interface HuntRow {
  id: string
  name: string
  kind: string
  type: string
  status: string | null
  started_at: string | null
  ended_at: string | null
  driven_hunt_id: string | null
  share_total_strecke: boolean
  creator_id: string
  notiz: string | null
}

interface AllKillRow {
  hunt_id: string | null
  wild_art: string
  nachsuche: boolean | null
}

interface SightingRow {
  id: string
  hunt_id: string | null
  species: string | null
  count: number | null
  occurred_at: string
  note: string | null
}

// ---------- Main function ----------

/**
 * Liefert die Timeline-Items für das Tagebuch eines Users im Jagdjahr,
 * sortiert nach occurredAt absteigend (neueste zuerst).
 *
 * Aggregations-Logik:
 *  - Hunts mit >=2 Teilnehmern  -> 1x TimelineGesell (auch bei 0 eigenen Kills)
 *  - Hunts mit  <2 Teilnehmern, 0 Kills, >0 Sightings -> 1x TimelineAnblick (Hunt-Kontext)
 *  - Hunts mit  <2 Teilnehmern, 0 Kills, 0 Sightings  -> kein Item (Hunt war ergebnislos)
 *  - Hunts mit  <2 Teilnehmern, >0 Kills -> Solo-Kill-Logik:
 *       Pro (Tag, Wildgruppe): wenn aggregatePerDay=true ODER count>=THRESHOLD
 *         -> 1x TimelineStrecke
 *       sonst: N x TimelineErlegung
 *  - Kills ohne hunt_id (orphan) -> immer TimelineErlegung mit place=null
 *  - Sightings ohne hunt_id (orphan) -> pro Tag 1x TimelineAnblick (Solo-Tag)
 */
export async function getTimelineItems(
  userId: string,
  jagdjahr: Jagdjahr,
): Promise<TimelineItem[]> {
  const supabase = await createClient()
  const startIso = jagdjahr.start.toISOString()
  const endIso = jagdjahr.end.toISOString()

  // 1. User-eigene Kills im Jagdjahr
  const userKillsRes = await supabase
    .from('kills')
    .select(
      'id, hunt_id, wild_art, gewicht_kg, foto_url, distance_m, erlegt_am, notiz, weather_snapshot, nachsuche',
    )
    .eq('reporter_id', userId)
    .gte('erlegt_am', startIso)
    .lt('erlegt_am', endIso)

  if (userKillsRes.error) {
    throw new Error(`getTimelineItems: user-kills failed: ${userKillsRes.error.message}`)
  }
  const userKills = (userKillsRes.data ?? []) as KillRow[]

  // 1b. User-eigene Sightings (wild_events.type='sighting') im Jagdjahr
  const sightingsRes = await supabase
    .from('wild_events')
    .select('id, hunt_id, species, count, occurred_at, note')
    .eq('user_id', userId)
    .eq('type', 'sighting')
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso)

  if (sightingsRes.error) {
    throw new Error(`getTimelineItems: sightings failed: ${sightingsRes.error.message}`)
  }
  const sightings = (sightingsRes.data ?? []) as SightingRow[]

  // Sightings nach Hunt splitten: hunt-context-bound vs. orphan-day
  const sightingsByHunt = new Map<string, SightingRow[]>()
  const orphanSightings: SightingRow[] = []
  for (const s of sightings) {
    if (!s.species) continue // species ist Freitext-NULL möglich; defensiv überspringen
    if (s.hunt_id) {
      const list = sightingsByHunt.get(s.hunt_id) ?? []
      list.push(s)
      sightingsByHunt.set(s.hunt_id, list)
    } else {
      orphanSightings.push(s)
    }
  }

  // 2. Hunt-Teilnahme des Users (alle, ohne Datums-Filter — Range wird über hunts.started_at gezogen)
  const partRes = await supabase
    .from('hunt_participants')
    .select('hunt_id')
    .eq('user_id', userId)

  if (partRes.error) {
    throw new Error(`getTimelineItems: participation failed: ${partRes.error.message}`)
  }
  const participationHuntIds = new Set<string>(
    (partRes.data ?? []).map(r => r.hunt_id).filter((id): id is string => !!id),
  )

  // 3. Alle relevanten Hunt-IDs = Teilnahme ∪ Kills ∪ Sightings
  const huntIdsFromKills = new Set<string>()
  for (const k of userKills) {
    if (k.hunt_id) huntIdsFromKills.add(k.hunt_id)
  }
  const huntIdsFromSightings = new Set<string>(sightingsByHunt.keys())
  const allHuntIds = new Set<string>([
    ...participationHuntIds,
    ...huntIdsFromKills,
    ...huntIdsFromSightings,
  ])

  // 4. Hunts laden
  // Saison-Cut auf started_at; null erlauben, damit Drafts ohne Datums-Anker
  // weiterleben und im Loop via earliestKillDate-Fallback geprüft werden
  // (Kill-Query ist datums-gefiltert -> earliestKillDate sitzt automatisch im Range).
  let hunts: HuntRow[] = []
  if (allHuntIds.size > 0) {
    const huntsRes = await supabase
      .from('hunts')
      .select('id, name, kind, type, status, started_at, ended_at, driven_hunt_id, share_total_strecke, creator_id, notiz')
      .in('id', Array.from(allHuntIds))
      .or(`started_at.is.null,and(started_at.gte.${startIso},started_at.lt.${endIso})`)

    if (huntsRes.error) {
      throw new Error(`getTimelineItems: hunts failed: ${huntsRes.error.message}`)
    }
    hunts = (huntsRes.data ?? []) as HuntRow[]
  }

  // 5. Participant-count pro Hunt
  const participantCount = new Map<string, number>()
  if (allHuntIds.size > 0) {
    const partsAllRes = await supabase
      .from('hunt_participants')
      .select('hunt_id')
      .in('hunt_id', Array.from(allHuntIds))

    if (partsAllRes.error) {
      throw new Error(`getTimelineItems: participants failed: ${partsAllRes.error.message}`)
    }
    for (const r of partsAllRes.data ?? []) {
      if (!r.hunt_id) continue
      participantCount.set(r.hunt_id, (participantCount.get(r.hunt_id) ?? 0) + 1)
    }
  }

  // 6. Hunts in Map für O(1)-Lookup
  const huntById = new Map<string, HuntRow>()
  for (const h of hunts) huntById.set(h.id, h)

  // 7. Welche Gesell-Hunts dürfen Gesamtstrecke zeigen? -> alle Kills nur für die laden
  const visibleGesellHuntIds: string[] = []
  for (const h of hunts) {
    const pc = participantCount.get(h.id) ?? 0
    if (pc >= 2 && (h.share_total_strecke === true || h.creator_id === userId)) {
      visibleGesellHuntIds.push(h.id)
    }
  }

  const allKillsByHunt = new Map<string, AllKillRow[]>()
  if (visibleGesellHuntIds.length > 0) {
    const allKillsRes = await supabase
      .from('kills')
      .select('hunt_id, wild_art, nachsuche')
      .in('hunt_id', visibleGesellHuntIds)

    if (allKillsRes.error) {
      throw new Error(`getTimelineItems: all-kills failed: ${allKillsRes.error.message}`)
    }
    for (const k of (allKillsRes.data ?? []) as AllKillRow[]) {
      if (!k.hunt_id) continue
      const list = allKillsByHunt.get(k.hunt_id) ?? []
      list.push(k)
      allKillsByHunt.set(k.hunt_id, list)
    }
  }

  // 8. User-Kills nach Hunt gruppieren; orphan-Kills separat
  const userKillsByHunt = new Map<string, KillRow[]>()
  const orphanKills: KillRow[] = []
  for (const k of userKills) {
    if (!k.erlegt_am) continue // skip kills ohne Datum (defensiv)
    if (!k.hunt_id) {
      orphanKills.push(k)
      continue
    }
    const list = userKillsByHunt.get(k.hunt_id) ?? []
    list.push(k)
    userKillsByHunt.set(k.hunt_id, list)
  }

  const items: TimelineItem[] = []

  // 9. Pro Hunt: Card-Typ entscheiden
  for (const hunt of hunts) {
    const userKillsInHunt = userKillsByHunt.get(hunt.id) ?? []
    const pc = participantCount.get(hunt.id) ?? 0

    const startedAt = hunt.started_at ? new Date(hunt.started_at) : null
    const earliestKillDate = userKillsInHunt
      .map(k => new Date(k.erlegt_am as string))
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
    const occurredAt = startedAt ?? earliestKillDate
    if (!occurredAt) continue // Hunt ohne Datums-Anker -> skip
    // Defensiver Saison-Cut: occurredAt muss strikt im Jagdjahr-Range liegen.
    // Schützt gegen null-started_at + out-of-range-earliestKillDate (theoretisch
    // nach kill-Filter unmöglich, aber explizit dokumentiert).
    if (occurredAt < jagdjahr.start || occurredAt >= jagdjahr.end) continue

    if (pc >= 2) {
      // CASE A: Gesellschaftsjagd
      const isVisible = hunt.share_total_strecke === true || hunt.creator_id === userId
      const deinAnteil = aggregateBySpecies(userKillsInHunt)

      const userSightingsInHunt = sightingsByHunt.get(hunt.id) ?? []
      const deineAnblickeMap = new Map<string, number>()
      for (const s of userSightingsInHunt) {
        if (!s.species) continue
        deineAnblickeMap.set(
          s.species,
          (deineAnblickeMap.get(s.species) ?? 0) + (s.count ?? 1),
        )
      }
      const deineAnblicke = Array.from(deineAnblickeMap.entries()).map(
        ([species, count]) => ({ species, count }),
      )

      let gesamtStrecke: { species: WildArt; count: number }[] | 'locked'
      let nachsucheCount: number
      if (isVisible) {
        const allKills = allKillsByHunt.get(hunt.id) ?? []
        gesamtStrecke = aggregateBySpecies(allKills)
        nachsucheCount = allKills.filter(k => k.nachsuche === true).length
      } else {
        gesamtStrecke = 'locked'
        nachsucheCount = userKillsInHunt.filter(k => k.nachsuche === true).length
      }

      items.push({
        kind: 'gesell',
        id: `g-${hunt.id}`,
        occurredAt,
        huntId: hunt.id,
        huntName: hunt.name,
        huntKind: hunt.kind,
        huntType: hunt.type,
        huntStatus: hunt.status ?? null,
        isDriven: hunt.driven_hunt_id !== null,
        teilnehmerCount: pc,
        deinAnteil,
        deineAnblicke,
        gesamtStrecke,
        startedAt,
        endedAt: hunt.ended_at ? new Date(hunt.ended_at) : null,
        notiz: hunt.notiz,
        nachsucheCount,
      })
    } else {
      // CASE B: Solo — entweder Anblick (0 Kills + Sightings) oder Strecke/Erlegung
      const huntSightings = sightingsByHunt.get(hunt.id) ?? []
      if (userKillsInHunt.length === 0) {
        if (huntSightings.length === 0) {
          // 0 Kills + 0 Sightings -> Hunt war ergebnislos, taucht nicht im Tagebuch auf
          continue
        }
        // 0 Kills + N Sightings -> AnblickCard mit Hunt-Kontext ("ohne Strecke")
        items.push(buildAnblick(huntSightings, hunt))
        continue
      }

      // CASE B': Solo mit Kills — Gruppierung nach (Tag, species_group)
      const groups = new Map<string, KillRow[]>()
      for (const k of userKillsInHunt) {
        const dateKey = toBerlinDateKey(new Date(k.erlegt_am as string))
        const sg = WILD_ART_TO_GROUP[k.wild_art as WildArt]
        if (!sg) continue // unbekannte wild_art -> skip (defensiv)
        const groupKey = `${dateKey}|${sg}`
        const list = groups.get(groupKey) ?? []
        list.push(k)
        groups.set(groupKey, list)
      }

      for (const [groupKey, killsInGroup] of groups) {
        const [dateKey, sg] = groupKey.split('|') as [string, WildGroup]
        const config = WILD_GROUP_CONFIG.find(c => c.group === sg)
        const aggregate =
          (config?.aggregatePerDay ?? false) ||
          killsInGroup.length >= SOLO_AGGREGATE_THRESHOLD

        if (aggregate) {
          const speciesBreakdown = aggregateBySpecies(killsInGroup)
          // occurredAt = frühestes erlegt_am in der Gruppe
          const groupOccurredAt = killsInGroup
            .map(k => new Date(k.erlegt_am as string))
            .sort((a, b) => a.getTime() - b.getTime())[0]

          items.push({
            kind: 'strecke',
            id: `s-${hunt.id}-${sg}-${dateKey.replace(/-/g, '')}`,
            occurredAt: groupOccurredAt,
            huntId: hunt.id,
            huntName: hunt.name,
            species_group: sg,
            speciesBreakdown,
            totalCount: killsInGroup.length,
          })
        } else {
          for (const k of killsInGroup) {
            items.push(buildErlegung(k, hunt.name))
          }
        }
      }
    }
  }

  // 10. Orphan-Kills (hunt_id NULL) -> immer Einzel-Erlegung-Card
  for (const k of orphanKills) {
    items.push(buildErlegung(k, null))
  }

  // 11. Orphan-Sightings (hunt_id NULL) -> pro Tag eine AnblickCard
  const sightingsByDay = new Map<string, SightingRow[]>()
  for (const s of orphanSightings) {
    const dateKey = toBerlinDateKey(new Date(s.occurred_at))
    const list = sightingsByDay.get(dateKey) ?? []
    list.push(s)
    sightingsByDay.set(dateKey, list)
  }
  for (const [dateKey, rows] of sightingsByDay) {
    items.push(buildAnblick(rows, null, dateKey))
  }

  // 12. Sortiere absteigend nach occurredAt
  items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

  return items
}

// ---------- Helpers ----------

function buildErlegung(k: KillRow, huntName: string | null): TimelineErlegung {
  const species = k.wild_art as WildArt
  const species_group = WILD_ART_TO_GROUP[species]
  const fotoUrl = k.foto_url && k.foto_url !== '' ? k.foto_url : null
  return {
    kind: 'erlegung',
    id: `e-${k.id}`,
    occurredAt: new Date(k.erlegt_am as string),
    huntId: k.hunt_id,
    killId: k.id,
    species,
    species_group,
    gewichtKg: k.gewicht_kg,
    distanceM: k.distance_m,
    fotoUrl,
    notiz: k.notiz,
    weatherSnapshot: parseWeather(k.weather_snapshot),
    place: huntName,
  }
}

function aggregateBySpecies(
  rows: { wild_art: string }[],
): { species: WildArt; count: number }[] {
  const map = new Map<WildArt, number>()
  for (const r of rows) {
    const wa = r.wild_art as WildArt
    map.set(wa, (map.get(wa) ?? 0) + 1)
  }
  return Array.from(map.entries()).map(([species, count]) => ({ species, count }))
}

/**
 * Baut ein TimelineAnblick-Item.
 * - Hunt-Kontext: hunt !== null, dateKey ungenutzt; occurredAt/start/end/notiz aus hunt.
 * - Solo-Tag: hunt === null, dateKey erforderlich; occurredAt = frühestes sighting,
 *             start/end = min/max sighting-time des Tages, notiz = erste nicht-leere Note.
 * Sightings-Aggregation in beiden Fällen: pro species SUM(count) (count fällt auf 1
 * zurück, wenn NULL). Rows ohne species sind beim Splitten bereits ausgefiltert.
 */
function buildAnblick(
  rows: SightingRow[],
  hunt: HuntRow | null,
  dateKey?: string,
): TimelineAnblick {
  const bySpecies = new Map<string, number>()
  for (const r of rows) {
    if (!r.species) continue
    bySpecies.set(r.species, (bySpecies.get(r.species) ?? 0) + (r.count ?? 1))
  }
  const aggregated = Array.from(bySpecies.entries()).map(([species, count]) => ({
    species,
    count,
  }))

  const sortedTimes = rows
    .map(r => new Date(r.occurred_at).getTime())
    .sort((a, b) => a - b)
  const earliestAt = new Date(sortedTimes[0])
  const latestAt = new Date(sortedTimes[sortedTimes.length - 1])

  if (hunt) {
    const startedAt = hunt.started_at ? new Date(hunt.started_at) : null
    const endedAt = hunt.ended_at ? new Date(hunt.ended_at) : null
    return {
      kind: 'anblick',
      id: `a-h-${hunt.id}`,
      occurredAt: startedAt ?? earliestAt,
      huntId: hunt.id,
      huntName: hunt.name,
      huntType: hunt.type,
      huntStatus: hunt.status ?? null,
      sightings: aggregated,
      startedAt,
      endedAt,
      notiz: hunt.notiz,
    }
  }

  // Solo-Tag — dateKey ist garantiert gesetzt vom Caller
  const firstNote = rows.find(r => r.note && r.note.trim() !== '')?.note ?? null
  const idKey = (dateKey ?? toBerlinDateKey(earliestAt)).replace(/-/g, '')
  return {
    kind: 'anblick',
    id: `a-orphan-${idKey}`,
    occurredAt: earliestAt,
    huntId: null,
    huntName: null,
    huntType: null,
    huntStatus: null,
    sightings: aggregated,
    startedAt: earliestAt,
    endedAt: latestAt,
    notiz: firstNote,
  }
}

function parseWeather(raw: unknown): { temp_c?: number; wind_dir?: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const result: { temp_c?: number; wind_dir?: string } = {}
  if (typeof obj.temp_c === 'number') result.temp_c = obj.temp_c
  if (typeof obj.wind_dir === 'string') result.wind_dir = obj.wind_dir
  return Object.keys(result).length > 0 ? result : null
}
