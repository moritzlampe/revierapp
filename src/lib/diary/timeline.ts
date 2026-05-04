import { createClient } from '@/lib/supabase/server'
import {
  type WildArt,
  type WildGroup,
  WILD_ART_TO_GROUP,
  WILD_GROUP_CONFIG,
  SOLO_AGGREGATE_THRESHOLD,
} from '@/lib/species-config'
import type { Jagdjahr } from './season'

// ---------- Public types (UI contract) ----------

export type TimelineItem = TimelineErlegung | TimelineStrecke | TimelineGesell

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
  /** True wenn driven_hunt_id NICHT NULL */
  isDriven: boolean
  teilnehmerCount: number
  /** Nur User's eigene Kills, aggregiert nach species */
  deinAnteil: { species: WildArt; count: number }[]
  /** 'locked' wenn share_total_strecke=false UND user !== creator_id */
  gesamtStrecke: { species: WildArt; count: number }[] | 'locked'
  startedAt: Date | null
  endedAt: Date | null
  notiz: string | null
  /** Anzahl Kills mit nachsuche=true (alle Reporter wenn visible, sonst nur User) */
  nachsucheCount: number
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

// ---------- Main function ----------

/**
 * Liefert die Timeline-Items für das Tagebuch eines Users im Jagdjahr,
 * sortiert nach occurredAt absteigend (neueste zuerst).
 *
 * Aggregations-Logik:
 *  - Hunts mit >=2 Teilnehmern  -> 1x TimelineGesell (auch bei 0 eigenen Kills)
 *  - Hunts mit  <2 Teilnehmern  -> Solo-Logik:
 *       Pro (Tag, Wildgruppe): wenn aggregatePerDay=true ODER count>=THRESHOLD
 *         -> 1x TimelineStrecke
 *       sonst: N x TimelineErlegung
 *  - Kills ohne hunt_id (orphan) -> immer TimelineErlegung mit place=null
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

  // 3. Alle relevanten Hunt-IDs = Teilnahme ∪ Hunts in denen User Kills hat
  const huntIdsFromKills = new Set<string>()
  for (const k of userKills) {
    if (k.hunt_id) huntIdsFromKills.add(k.hunt_id)
  }
  const allHuntIds = new Set<string>([...participationHuntIds, ...huntIdsFromKills])

  // 4. Hunts laden
  let hunts: HuntRow[] = []
  if (allHuntIds.size > 0) {
    const huntsRes = await supabase
      .from('hunts')
      .select('id, name, kind, started_at, ended_at, driven_hunt_id, share_total_strecke, creator_id, notiz')
      .in('id', Array.from(allHuntIds))

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

    if (pc >= 2) {
      // CASE A: Gesellschaftsjagd
      const isVisible = hunt.share_total_strecke === true || hunt.creator_id === userId
      const deinAnteil = aggregateBySpecies(userKillsInHunt)

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
        isDriven: hunt.driven_hunt_id !== null,
        teilnehmerCount: pc,
        deinAnteil,
        gesamtStrecke,
        startedAt,
        endedAt: hunt.ended_at ? new Date(hunt.ended_at) : null,
        notiz: hunt.notiz,
        nachsucheCount,
      })
    } else {
      // CASE B: Solo — Gruppierung nach (Tag, species_group)
      const groups = new Map<string, KillRow[]>()
      for (const k of userKillsInHunt) {
        const dateKey = toLocalDateKey(new Date(k.erlegt_am as string))
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

  // 11. Sortiere absteigend nach occurredAt
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

function parseWeather(raw: unknown): { temp_c?: number; wind_dir?: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const result: { temp_c?: number; wind_dir?: string } = {}
  if (typeof obj.temp_c === 'number') result.temp_c = obj.temp_c
  if (typeof obj.wind_dir === 'string') result.wind_dir = obj.wind_dir
  return Object.keys(result).length > 0 ? result : null
}

/** Local-time YYYY-MM-DD key for grouping kills by calendar day. */
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
