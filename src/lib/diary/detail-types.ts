import type { Database } from '@/lib/supabase/database.types'

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
