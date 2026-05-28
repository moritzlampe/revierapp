import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'

type WildEventRow = Database['public']['Tables']['wild_events']['Row']

/**
 * Patch payload for the Anblick edit flow (Sprint 60.5e-2).
 *
 * Only the four fields editable via Field-Sheets are accepted here. age_class
 * is intentionally excluded — it ships in a species-aware follow-up sprint.
 *
 * gender uses the binary set 'male' | 'female'; NULL means "unknown".
 * There is no 'unknown' literal — deselecting both pills in the sheet writes
 * NULL.
 */
export type WildEventUpdate = {
  gender?: 'male' | 'female' | null
  weight_estimate_kg?: number | null
  distance_m?: number | null
  photo_url?: string | null
}

export type WildEventUpdateResult = {
  data: WildEventRow | null
  error: PostgrestError | Error | null
}

/**
 * Pure validation for a WildEventUpdate patch.
 *
 * Returns null when the patch is acceptable, otherwise a German user-facing
 * error message (with umlauts). Migration 047 stores these columns as plain
 * text/double/integer without CHECK constraints, so these ranges are purely
 * client-side guardrails for the sheets.
 *
 * Rules:
 *   gender:             'male' | 'female' | null
 *   weight_estimate_kg: 0.1 ≤ x ≤ 300  or null
 *   distance_m:         0 ≤ x ≤ 500, integer, or null
 *   photo_url:          non-empty string or null (no strict URL check)
 */
export function validateWildEventUpdate(patch: WildEventUpdate): string | null {
  if ('gender' in patch) {
    const g = patch.gender
    if (g !== null && g !== undefined && g !== 'male' && g !== 'female') {
      return 'Geschlecht muss „männlich", „weiblich" oder leer sein.'
    }
  }

  if ('weight_estimate_kg' in patch) {
    const w = patch.weight_estimate_kg
    if (w !== null && w !== undefined) {
      if (!Number.isFinite(w)) {
        return 'Gewicht muss eine Zahl sein.'
      }
      if (w < 0.1 || w > 300) {
        return 'Gewicht muss zwischen 0,1 kg und 300 kg liegen.'
      }
    }
  }

  if ('distance_m' in patch) {
    const d = patch.distance_m
    if (d !== null && d !== undefined) {
      if (!Number.isFinite(d) || !Number.isInteger(d)) {
        return 'Entfernung muss eine ganze Zahl sein.'
      }
      if (d < 0 || d > 500) {
        return 'Entfernung muss zwischen 0 m und 500 m liegen.'
      }
    }
  }

  if ('photo_url' in patch) {
    const p = patch.photo_url
    if (p !== null && p !== undefined) {
      if (typeof p !== 'string' || p.trim().length === 0) {
        return 'Foto-URL darf nicht leer sein.'
      }
    }
  }

  return null
}

/**
 * Patches a wild_events row by id with the provided fields.
 *
 * RLS policy "wild_events_owner_all" (migration 036) ensures users can only
 * update their own rows — no extra user_id check needed in this helper.
 *
 * Behaviour:
 *   - Runs validateWildEventUpdate first. On failure: returns
 *     { data: null, error: new Error(message) } without touching the DB.
 *   - On Supabase error: returns { data: null, error: <PostgrestError> }.
 *   - On success: returns { data: <updated row>, error: null }.
 *
 * IMPORTANT: After a successful call the caller must invoke router.refresh()
 * before further setState/navigation — same router-cache discipline as
 * insertSighting / insertKill.
 */
export async function updateWildEvent(
  id: string,
  patch: WildEventUpdate
): Promise<WildEventUpdateResult> {
  // Strip undefined keys so single-field edits never overwrite untouched
  // columns with NULL. null is preserved on purpose — it is the explicit
  // "clear this field" signal (e.g. gender deselect, empty weight input).
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  ) as WildEventUpdate

  if (Object.keys(cleanPatch).length === 0) {
    return { data: null, error: new Error('Keine Änderungen zum Speichern.') }
  }

  const validationError = validateWildEventUpdate(cleanPatch)
  if (validationError !== null) {
    return { data: null, error: new Error(validationError) }
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('wild_events')
    .update(cleanPatch)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { data: null, error }
  }
  return { data, error: null }
}
