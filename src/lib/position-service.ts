import type { SupabaseClient } from '@supabase/supabase-js'

const THROTTLE_MS = 5000
let lastSendTime = 0

/**
 * Position an Supabase senden (UPSERT auf positions_current)
 * Throttle: maximal alle 5 Sekunden
 */
export async function updatePosition(
  supabase: SupabaseClient,
  participantId: string,
  huntId: string,
  position: { lat: number; lng: number },
  accuracy: number,
  isLocked: boolean,
): Promise<void> {
  const now = Date.now()
  if (now - lastSendTime < THROTTLE_MS) return
  lastSendTime = now

  const ewkt = `SRID=4326;POINT(${position.lng} ${position.lat})`

  const { error } = await supabase.from('positions_current').upsert({
    participant_id: participantId,
    hunt_id: huntId,
    location: ewkt,
    accuracy,
    is_locked: isLocked,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'participant_id',
  })

  if (error && process.env.NODE_ENV === 'development') {
    console.error('Position-Update fehlgeschlagen:', error.message)
  }
}
