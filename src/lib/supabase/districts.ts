import { createClient } from '@/lib/supabase/client'
import type { Revier } from '@/lib/types/revier'

/**
 * Findet alle Reviere, deren Boundary den GPS-Punkt enthält.
 * Überlappungen möglich — Caller entscheidet wie weiter (0 = auswärts,
 * 1 = direkt, 2+ = Auswahl).
 */
export async function findDistrictsAtPoint(
  lng: number,
  lat: number
): Promise<Revier[]> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('find_districts_for_point', {
    p_lng: lng,
    p_lat: lat,
  })

  if (error) {
    console.error('[findDistrictsAtPoint] RPC error:', error)
    throw error
  }

  return (data ?? []) as Revier[]
}
