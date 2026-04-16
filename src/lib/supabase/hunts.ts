import { createClient } from '@/lib/supabase/client'
import type { HuntKind } from '@/lib/types/hunt'

/**
 * Erstellt eine Solo-Hunt und legt den User als Teilnehmer (Jagdleiter) an.
 *
 * Name-Komposition passiert NICHT hier, sondern im Caller (ErlegungSheet in 58.1e.c).
 * Dieser Helper nimmt nur den fertigen name-String.
 *
 * invite_code wird generiert, aber bei Solo-Hunts praktisch nicht genutzt.
 */
export async function createSoloHunt(params: {
  userId: string
  districtId: string | null
  name: string
}): Promise<{ id: string }> {
  const supabase = createClient()

  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()

  // Hunt anlegen
  const { data: hunt, error: huntError } = await supabase
    .from('hunts')
    .insert({
      kind: 'solo' satisfies HuntKind,
      name: params.name,
      district_id: params.districtId,
      creator_id: params.userId,
      invite_code: inviteCode,
      type: 'ansitz',
      status: 'active',
      signal_mode: 'silent',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (huntError || !hunt) {
    console.error('[createSoloHunt] hunt insert failed:', huntError)
    throw huntError ?? new Error('createSoloHunt failed')
  }

  // Jäger als Teilnehmer (Jagdleiter) anlegen, damit RLS den Zugriff erlaubt
  const { error: memberError } = await supabase
    .from('hunt_participants')
    .insert({
      hunt_id: hunt.id,
      user_id: params.userId,
      role: 'jagdleiter',
      status: 'joined',
      joined_at: new Date().toISOString(),
    })

  if (memberError) {
    console.error('[createSoloHunt] participant insert failed:', memberError)
    throw memberError
  }

  return { id: hunt.id }
}
