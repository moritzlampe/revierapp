import { createClient } from '@/lib/supabase/server'
import type { Jagdjahr } from './season'
import { toBerlinDateKey } from './time'

/**
 * Aggregierte Werte für die Stats-Subline im Tagebuch-Header.
 * Anblick wird mit Sprint 60.6 nachgereicht.
 */
export interface DiaryStats {
  /** Anzahl distinct Tage mit Aktivität (Kills oder Hunt-Teilnahme) */
  jagdtage: number
  /** Anzahl wild_events mit type='kill' für User im Jagdjahr */
  erlegungen: number
  /** Summe (ended_at - started_at) über Hunts mit Teilnahme, in Stunden, 1 Nachkommastelle */
  stundenImRevier: number
}

/**
 * Liefert die Stats-Subline-Werte für einen User in einem Jagdjahr.
 * Server-Component-fähig — nutzt RLS-authentifizierten Supabase-Client.
 *
 * Wirft, wenn ein Sub-Query fehlschlägt. Caller rendert dann Empty-/Error-State.
 */
export async function getDiaryStats(
  userId: string,
  jagdjahr: Jagdjahr,
): Promise<DiaryStats> {
  const supabase = await createClient()
  const startIso = jagdjahr.start.toISOString()
  const endIso = jagdjahr.end.toISOString()

  // A) ERLEGUNGEN — direkter count auf wild_events
  const erlegungenRes = await supabase
    .from('wild_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'kill')
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso)

  if (erlegungenRes.error) {
    throw new Error(`getDiaryStats: erlegungen-query failed: ${erlegungenRes.error.message}`)
  }
  const erlegungen = erlegungenRes.count ?? 0

  // B) JAGDTAGE — Union aus Kill-Daten und Hunt-Teilnahme-Daten
  const killDatesRes = await supabase
    .from('kills')
    .select('erlegt_am')
    .eq('reporter_id', userId)
    .gte('erlegt_am', startIso)
    .lt('erlegt_am', endIso)

  if (killDatesRes.error) {
    throw new Error(`getDiaryStats: kill-dates-query failed: ${killDatesRes.error.message}`)
  }

  // Hunt-IDs mit User-Teilnahme (für Jagdtage UND Stunden)
  const participationRes = await supabase
    .from('hunt_participants')
    .select('hunt_id')
    .eq('user_id', userId)

  if (participationRes.error) {
    throw new Error(`getDiaryStats: participation-query failed: ${participationRes.error.message}`)
  }
  const huntIds = (participationRes.data ?? [])
    .map(r => r.hunt_id)
    .filter((id): id is string => id !== null)

  // Hunts im Jagdjahr mit started_at — liefert Daten für Jagdtage UND (zusammen mit ended_at) Stunden
  let huntRows: { started_at: string | null; ended_at: string | null }[] = []
  if (huntIds.length > 0) {
    const huntsRes = await supabase
      .from('hunts')
      .select('started_at, ended_at')
      .in('id', huntIds)
      .not('started_at', 'is', null)
      .gte('started_at', startIso)
      .lt('started_at', endIso)

    if (huntsRes.error) {
      throw new Error(`getDiaryStats: hunts-query failed: ${huntsRes.error.message}`)
    }
    huntRows = huntsRes.data ?? []
  }

  // Date-Set bauen (lokale YYYY-MM-DD-Keys)
  const dateSet = new Set<string>()
  for (const row of killDatesRes.data ?? []) {
    if (row.erlegt_am) dateSet.add(toBerlinDateKey(new Date(row.erlegt_am)))
  }
  for (const row of huntRows) {
    if (row.started_at) dateSet.add(toBerlinDateKey(new Date(row.started_at)))
  }
  const jagdtage = dateSet.size

  // C) STUNDEN IM REVIER — laufende Hunts (ended_at NULL) ausgeschlossen
  let totalMs = 0
  for (const row of huntRows) {
    if (!row.started_at || !row.ended_at) continue
    const ms = new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()
    if (ms > 0) totalMs += ms
  }
  const stundenImRevier = Math.round((totalMs / 3_600_000) * 10) / 10

  return { jagdtage, erlegungen, stundenImRevier }
}
