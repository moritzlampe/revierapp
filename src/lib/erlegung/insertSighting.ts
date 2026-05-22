import { createClient } from '@/lib/supabase/client'

/**
 * Eingabe für einen Anblick (Sprint 60.5e-1).
 *
 * Detailfelder (gender, age_class, weight_estimate_kg, distance_m, photo_url)
 * sind bewusst NICHT Teil dieses Typs — sie werden erst über die Bearbeiten-
 * Maske in Sprint 60.5e-2 befüllt und bleiben hier NULL.
 */
export interface SightingInput {
  /** Wildart als Freitext bzw. Wildgruppe — landet in wild_events.species */
  species: string
  /** Anzahl beobachteter Stücke, ≥ 1 */
  count: number
  /** Aktive Jagd oder null (Solo-Anblick) — es gibt KEINEN Auto-Solo-Hunt */
  huntId: string | null
  /** Auto-GPS-Position der Beobachtung */
  location: { lat: number; lng: number }
  /** Zeitpunkt der Beobachtung. Default: jetzt */
  occurredAt?: Date
  /** Optionale Notiz. In 60.5e-1 nicht aus der UI gesetzt — Helper kann es bereits. */
  note?: string
}

/**
 * Schreibt einen Anblick als EINE wild_events-Row (type='sighting', count=N).
 *
 * Anders als insertKillBatch entsteht hier genau eine Row mit count=N —
 * nicht N Rows mit count=1. Das ist die Kernsemantik der Anblick-Erfassung.
 *
 * KEIN Auto-Solo-Hunt: huntId wird 1:1 übernommen (gesetzt oder null). Ein
 * Anblick ohne aktive Jagd bleibt huntId=null; die AnblickCard rendert dann
 * ohne Hunt-Kontext (Recon R8).
 *
 * RLS: wild_events hat die Policy "wild_events_owner_all"
 * (WITH CHECK user_id = auth.uid(), Migration 036) — ein Client-Insert mit
 * user_id = session.user.id geht ohne SECURITY DEFINER durch. Identisch zur
 * Lage bei insertKill.ts / kills.
 *
 * WICHTIG: Der Aufrufer MUSS nach Erfolg router.refresh() aufrufen, bevor
 * weiteres setState/Navigation passiert (Router-Cache-Lehre aus Sprint 60.5a).
 *
 * @returns die id der angelegten wild_events-Row
 */
export async function insertSighting(input: SightingInput): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht eingeloggt')

  if (!Number.isFinite(input.count) || input.count < 1) {
    throw new Error('Anzahl muss mindestens 1 sein')
  }

  // EWKT-String — PostGREST castet das in die geography(Point,4326)-Spalte.
  // Reihenfolge ist POINT(lng lat), nicht (lat lng). Vgl. insertKill.ts.
  const locationEwkt = `SRID=4326;POINT(${input.location.lng} ${input.location.lat})`

  const { data, error } = await supabase
    .from('wild_events')
    .insert({
      user_id: user.id,
      hunt_id: input.huntId,
      type: 'sighting',
      species: input.species,
      count: input.count,
      occurred_at: (input.occurredAt ?? new Date()).toISOString(),
      location: locationEwkt,
      note: input.note ?? null,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}
