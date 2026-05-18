import { createClient } from '@/lib/supabase/server'
import { berlinMidnight, toBerlinDateKey } from './time'
import { pickCoverPhoto } from './cover-photo'
import type {
  AnblickDetail,
  ErlegungDetail,
  GesellDetail,
} from './detail-types'
import type { Database } from '@/lib/supabase/database.types'

type Kill = Database['public']['Tables']['kills']['Row']
type Hunt = Database['public']['Tables']['hunts']['Row']
type WildEvent = Database['public']['Tables']['wild_events']['Row']
type HuntPhoto = Database['public']['Tables']['hunt_photos']['Row']

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ---------- Erlegung ----------

/**
 * Lädt eine einzelne Erlegung. RLS auf kills entscheidet Sichtbarkeit
 * (Reporter + Mitjäger sichtbarer Hunts) — KEIN expliziter
 * reporter_id-Check, sonst bräche die Gesell→Kill-Navigation für
 * Mitjäger (Phase 5: Kill-Row-Klick öffnet /erlegung/[id]).
 */
// userId ist Teil des Loader-Contracts (page.tsx ruft mit user.id), wird hier
// aber bewusst NICHT zum Filtern genutzt: RLS regelt Sichtbarkeit, ein
// expliziter reporter_id-Check bräche die Gesell→Kill-Navigation für Mitjäger.
export async function getErlegungDetail(
  killId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId: string,
): Promise<ErlegungDetail | null> {
  const supabase = await createClient()

  const killRes = await supabase
    .from('kills')
    .select('*')
    .eq('id', killId)
    .maybeSingle()

  if (killRes.error || !killRes.data) return null
  const kill = killRes.data as Kill

  const [huntRes, photosRes] = await Promise.all([
    kill.hunt_id
      ? supabase.from('hunts').select('*').eq('id', kill.hunt_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('hunt_photos').select('*').contains('kill_ids', [killId]),
  ])

  const hunt = (huntRes.data as Hunt | null) ?? null

  // photos[0] = Hero, photos[1..] = "Weitere Fotos"-Stack (Phase 4).
  // Default: ältestes kill-spezifisches Foto = Hero.
  const photos = ((photosRes.data ?? []) as HuntPhoto[])
    .slice()
    .sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1))

  // 7.6: Hat der Jagdleiter ein Hunt-Cover gesetzt UND ist genau dieses
  // Foto kill-spezifisch (also bereits in `photos`, da via kill_ids
  // gefiltert), zieht es als Hero nach vorn — Konsistenz mit Gesell.
  // Kein Zusatz-Query: hunt ist hier schon geladen.
  if (hunt?.cover_photo_id) {
    const i = photos.findIndex((p) => p.id === hunt.cover_photo_id)
    if (i > 0) {
      const [cover] = photos.splice(i, 1)
      photos.unshift(cover)
    }
  }

  return { kill, hunt, photos }
}

// ---------- Gesell ----------

/**
 * profiles hat nur display_name (NOT NULL) — kein full_name/email.
 * Legacy-User haben display_name == Email (alter Profil-Trigger,
 * CLAUDE.md known bug). UI will keinen Email-String: bei '@' den
 * Local-Part nehmen. Leer → "Unbekannt".
 */
function cleanReporterName(displayName: string): string {
  const n = displayName.trim()
  if (n === '') return 'Unbekannt'
  if (n.includes('@')) return n.split('@')[0]
  return n
}

export async function getGesellDetail(
  huntId: string,
  userId: string,
): Promise<GesellDetail | null> {
  const supabase = await createClient()

  const huntRes = await supabase
    .from('hunts')
    .select('*')
    .eq('id', huntId)
    .maybeSingle()

  if (huntRes.error || !huntRes.data) return null
  const hunt = huntRes.data as Hunt

  const [killsRes, partsRes, photosRes] = await Promise.all([
    supabase
      .from('kills')
      .select('id, wild_art, erlegt_am, reporter_id, distance_m')
      .eq('hunt_id', huntId),
    supabase.from('hunt_participants').select('user_id').eq('hunt_id', huntId),
    supabase.from('hunt_photos').select('*').eq('hunt_id', huntId),
  ])

  type KillLite = Pick<
    Kill,
    'id' | 'wild_art' | 'erlegt_am' | 'reporter_id' | 'distance_m'
  >
  const killRows = (killsRes.data ?? []) as KillLite[]

  // Reporter-Namen in einer Batch-Query (distinct reporter_ids)
  const reporterIds = Array.from(
    new Set(killRows.map((k) => k.reporter_id).filter(Boolean)),
  )
  const nameById = new Map<string, string>()
  if (reporterIds.length > 0) {
    const profRes = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', reporterIds)
    for (const p of (profRes.data ?? []) as {
      id: string
      display_name: string
    }[]) {
      nameById.set(p.id, cleanReporterName(p.display_name))
    }
  }

  const kills = killRows
    .slice()
    .sort((a, b) => ((a.erlegt_am ?? '') < (b.erlegt_am ?? '') ? -1 : 1))
    .map((k) => ({
      ...k,
      reporter_name: nameById.get(k.reporter_id) ?? null,
    }))

  const photos = (photosRes.data ?? []) as HuntPhoto[]

  return {
    hunt,
    kills,
    participantCount: (partsRes.data ?? []).length,
    totalKills: killRows.length,
    userKills: killRows.filter((k) => k.reporter_id === userId).length,
    userRole: hunt.creator_id === userId ? 'Jagdleiter' : 'Schütze',
    coverPhoto: pickCoverPhoto(photos, hunt.cover_photo_id),
  }
}

// ---------- Anblick ----------

/**
 * Aggregiert eine Liste eigener Sightings analog buildAnblick() in
 * timeline.ts: pro species SUM(count ?? 1), Rows ohne species ignoriert.
 */
function aggregateSightings(rows: WildEvent[]): {
  totalCount: number
  speciesBreakdown: { species: string; count: number }[]
} {
  const bySpecies = new Map<string, number>()
  for (const r of rows) {
    if (!r.species) continue
    bySpecies.set(r.species, (bySpecies.get(r.species) ?? 0) + (r.count ?? 1))
  }
  const speciesBreakdown = Array.from(bySpecies.entries())
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count || a.species.localeCompare(b.species))
  const totalCount = speciesBreakdown.reduce((s, x) => s + x.count, 0)
  return { totalCount, speciesBreakdown }
}

async function getAnblickByHunt(
  huntId: string,
  userId: string,
): Promise<AnblickDetail | null> {
  const supabase = await createClient()

  const [sightRes, huntRes] = await Promise.all([
    supabase
      .from('wild_events')
      .select('*')
      .eq('hunt_id', huntId)
      .eq('user_id', userId)
      .eq('type', 'sighting'),
    supabase.from('hunts').select('*').eq('id', huntId).maybeSingle(),
  ])

  const sightings = ((sightRes.data ?? []) as WildEvent[]).filter(
    (s) => s.species,
  )
  if (sightings.length === 0) return null

  const hunt = (huntRes.data as Hunt | null) ?? null
  const earliest = sightings
    .map((s) => new Date(s.occurred_at).getTime())
    .sort((a, b) => a - b)[0]
  const anchor =
    hunt?.started_at != null ? new Date(hunt.started_at) : new Date(earliest)

  return {
    hunt,
    sightings,
    ...aggregateSightings(sightings),
    occurredOn: toBerlinDateKey(anchor),
  }
}

async function getAnblickByDate(
  dateKey: string,
  userId: string,
): Promise<AnblickDetail | null> {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10))
  if (!y || !m || !d) return null

  const start = berlinMidnight(y, m - 1, d)
  const end = berlinMidnight(y, m - 1, d + 1) // Date.UTC normalisiert Overflow

  const supabase = await createClient()
  const sightRes = await supabase
    .from('wild_events')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'sighting')
    .is('hunt_id', null)
    .gte('occurred_at', start.toISOString())
    .lt('occurred_at', end.toISOString())

  const sightings = ((sightRes.data ?? []) as WildEvent[]).filter(
    (s) => s.species,
  )
  if (sightings.length === 0) return null

  return {
    hunt: null,
    sightings,
    ...aggregateSightings(sightings),
    occurredOn: dateKey,
  }
}

export async function getAnblickDetail(
  id: string,
  userId: string,
): Promise<AnblickDetail | null> {
  if (UUID_RE.test(id)) return getAnblickByHunt(id, userId)
  if (DATE_RE.test(id)) return getAnblickByDate(id, userId)
  return null
}
