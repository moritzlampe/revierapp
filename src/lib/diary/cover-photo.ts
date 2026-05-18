import type { Database } from '@/lib/supabase/database.types'

type HuntPhoto = Database['public']['Tables']['hunt_photos']['Row']

// created_at ist nullable (DB-Default, aber Typ erlaubt null) — null
// sortiert als "" ganz nach vorn, konsistent mit den übrigen Loadern.
function byAgeAsc(a: HuntPhoto, b: HuntPhoto): number {
  return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1
}

/**
 * Wählt das Cover-Foto für eine Detail-Page anhand einer 4-Stufen-
 * Fallback-Logik. Reine Funktion, keine DB-Calls.
 *
 * @param photos        Alle für den Kontext relevanten hunt_photos
 *                       (Gesell: alle photos des Hunts).
 * @param customCoverId  hunt.cover_photo_id (vom Jagdleiter manuell gewählt).
 * @returns Das auszuwählende Foto, oder null wenn keines existiert.
 *
 * Fallback-Reihenfolge:
 *  1. User-Custom-Pick:   photo mit id === customCoverId
 *  2. Hunt-Stimmungsbild: ältestes photo ohne kill_ids-Bezug
 *  3. Erstes Kill-Foto:   ältestes hunt_photo (created_at ASC)
 *  4. UI-Fallback:        null → DetailHero rendert Gradient-Fallback
 */
export function pickCoverPhoto(
  photos: HuntPhoto[],
  customCoverId: string | null,
): HuntPhoto | null {
  if (photos.length === 0) return null

  // Stufe 1: User-Custom-Pick
  if (customCoverId) {
    const found = photos.find((p) => p.id === customCoverId)
    if (found) return found
  }

  const byAge = [...photos].sort(byAgeAsc)

  // Stufe 2: Hunt-Stimmungsbild (kein kill_ids-Bezug), ältestes zuerst
  const stimmung = byAge.find((p) => !p.kill_ids || p.kill_ids.length === 0)
  if (stimmung) return stimmung

  // Stufe 3: Ältestes Foto überhaupt (photos.length > 0 garantiert)
  return byAge[0]
}
