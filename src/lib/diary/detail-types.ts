import type { Database } from '@/lib/supabase/database.types'
import type { WildArt, WildGroup } from '@/lib/species-config'

type Kill = Database['public']['Tables']['kills']['Row']
type Hunt = Database['public']['Tables']['hunts']['Row']
type WildEvent = Database['public']['Tables']['wild_events']['Row']
type HuntPhoto = Database['public']['Tables']['hunt_photos']['Row']

/**
 * Einzelne Erlegung (TimelineErlegung → /du/tagebuch/erlegung/[kill_id]).
 * Ohne weitereErlegungenSameDay: StreckeCard ist aus 60.4 ausgeklammert
 * (eigener Mini-Sprint 60.5a), der weitere-Block entfällt damit komplett.
 */
export type ErlegungDetail = {
  kill: Kill
  /** null bei Orphan-Kill (hunt_id NULL) */
  hunt: Hunt | null
  /** hunt_photos, deren kill_ids[] diese kill_id enthält */
  photos: HuntPhoto[]
}

/**
 * Gesellschaftsjagd (TimelineGesell → /du/tagebuch/gesell/[hunt_id]).
 */
export type GesellDetail = {
  hunt: Hunt
  kills: (Pick<
    Kill,
    'id' | 'wild_art' | 'erlegt_am' | 'reporter_id' | 'distance_m'
  > & {
    reporter_name: string | null
  })[]
  participantCount: number
  /** Alle Kills des Hunts (RLS-permitting; Privacy-Gating ist Phase-5-UI) */
  totalKills: number
  /** Kills mit reporter_id === userId */
  userKills: number
  userRole: 'Jagdleiter' | 'Schütze'
  coverPhoto: HuntPhoto | null
}

/**
 * Strecke (TimelineStrecke → /du/tagebuch/strecke/[hunt_id]?d=YYYY-MM-DD&g=<group>).
 *
 * N-zu-1-Aggregat aus mehreren Solo-Kills derselben Wildgruppe an einem
 * Tag (Schwelle via SOLO_AGGREGATE_THRESHOLD oder aggregatePerDay in
 * species-config.ts). Aggregations-Mechanik analog zur Solo-Branch in
 * timeline.ts, damit Card und Detail dieselben Zahlen zeigen.
 */
export type StreckeDetail = {
  hunt: Hunt
  /** Wildgruppe der Aggregation (URL-Param g) */
  group: WildGroup
  /** Tag der Aggregation (URL-Param d, YYYY-MM-DD Berlin) */
  occurredOn: string
  /** Alle Kills in (hunt × group × day), sortiert chronologisch */
  kills: Pick<
    Kill,
    'id' | 'wild_art' | 'erlegt_am' | 'distance_m' | 'gewicht_kg'
  >[]
  /** Summe = kills.length */
  totalCount: number
  /** Pro wild_art aggregiert, absteigend nach count */
  speciesBreakdown: { species: WildArt; count: number }[]
  /** Hunt-bezogene Fotos (kein kill_ids-Filter — Hunt-Foto-Stack) */
  photos: HuntPhoto[]
}

/**
 * Bestiarium-Gruppe (BestiariumGrid-Kachel → /du/tagebuch/bestiarium/[group]?j=YYYY).
 *
 * Saison-Aggregat aller eigenen Erlegungen einer Wildgruppe, aufgeschlüsselt
 * nach Wildart. Quelle ist die kills-Tabelle (reporter_id) — deckungsgleich
 * mit dem Grid (Sprint 60.5f). totalCount 0 ist ein gültiger Zustand
 * (Zero-State-Detailseite), kein Fehler.
 */
export type BestiariumDetail = {
  group: WildGroup
  /** Wildgruppen-Label (z. B. "Schwarzwild") */
  label: string
  /** Jagdjahr-Label für den Saison-Kontext im Header (z. B. "Jagdjahr 26/27") */
  jagdjahrLabel: string
  /** Summe = Anzahl Erlegungen der Gruppe in der Saison */
  totalCount: number
  /** Pro wild_art aggregiert, absteigend nach count */
  speciesBreakdown: { species: WildArt; count: number }[]
}

/**
 * Anblick (TimelineAnblick → /du/tagebuch/anblick/[hunt_id|YYYY-MM-DD]).
 *
 * N-zu-1-Aggregat aus mehreren wild_events (kein einzelnes event_id).
 * Aggregations-Mechanik analog buildAnblick() in timeline.ts, damit Card
 * und Detail dieselben Zahlen zeigen.
 */
export type AnblickDetail = {
  /** null bei Solo-Tag-Aggregat (date-key), gesetzt bei Hunt-Kontext */
  hunt: Hunt | null
  /** alle wild_events der Aggregation (eigene Sightings des Users) */
  sightings: WildEvent[]
  /** Summe über event.count (count ?? 1) */
  totalCount: number
  /** group_by species, absteigend nach count */
  speciesBreakdown: { species: string; count: number }[]
  /** YYYY-MM-DD (Berlin) — Hunt: started_at/earliest; Solo: der date-key */
  occurredOn: string
}
