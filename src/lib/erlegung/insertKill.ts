import { createClient } from '@/lib/supabase/client'
import type { KillStatus } from '@/lib/types/kill'
import type { WildArt, Geschlecht } from '@/lib/species-config'

export interface InsertKillParams {
  wildArt: WildArt
  geschlecht?: Geschlecht | null
  position: { lat: number; lng: number } | null
  huntId?: string | null
  status?: KillStatus
}

export async function insertKill(params: InsertKillParams): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht eingeloggt')

  const positionEwkt = params.position
    ? `SRID=4326;POINT(${params.position.lng} ${params.position.lat})`
    : null

  const { data, error } = await supabase
    .from('kills')
    .insert({
      reporter_id: user.id,
      wild_art: params.wildArt,
      status: params.status ?? 'harvested',
      geschlecht: params.geschlecht ?? null,
      position: positionEwkt,
      hunt_id: params.huntId ?? null,
      erlegt_am: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}
