import type { Kill, KillBatch } from '@/lib/types/kill'

// Multi-Tap-Erlegungen (z.B. 3 Frischlinge hintereinander) zu einem
// Batch zusammenfassen. Gruppierung rein client-seitig.
//
// WICHTIG: Wir benutzen created_at (Server-Timestamp aus DB-DEFAULT),
// NICHT erlegt_am (Client-Timestamp pro Tap). Grund: erlegt_am ist
// der Moment des Taps im WildartPicker und kann bei langsamerem Tapping
// >2s auseinanderliegen, obwohl es ein einziger INSERT-Call war. Das
// würde einen Batch künstlich aufsplitten. created_at kommt aus
// demselben INSERT-Call und ist für alle Rows praktisch identisch.
// Siehe Recon §2.2.
const BATCH_WINDOW_MS = 2000

export function groupKillsByBatch(kills: Kill[]): KillBatch[] {
  const batches: KillBatch[] = []

  for (const k of kills) {
    const last = batches[batches.length - 1]
    const sameReporter = last?.reporter_id === k.reporter_id
    const closeInTime =
      last !== undefined &&
      Math.abs(
        new Date(k.created_at).getTime() - new Date(last.last_at).getTime(),
      ) < BATCH_WINDOW_MS

    if (last && sameReporter && closeInTime) {
      last.kills.push(k)
      last.last_at = k.created_at
    } else {
      batches.push({
        id: k.id,
        reporter_id: k.reporter_id,
        first_at: k.created_at,
        last_at: k.created_at,
        kills: [k],
      })
    }
  }

  return batches
}
