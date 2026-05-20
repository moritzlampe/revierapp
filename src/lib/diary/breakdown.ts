import { getWildArtLabelSingle } from '@/lib/wildArt'
import type { WildArt } from '@/lib/species-config'

/**
 * "3× Frischling · 1× Rehwild" — pro wild_art aggregiert, absteigend
 * nach Anzahl. Reine Funktion, auch in Phase 6 (AnblickDetail) genutzt.
 */
export function buildBreakdown(kills: { wild_art: string }[]): string {
  const counts = new Map<string, number>()
  for (const k of kills) {
    counts.set(k.wild_art, (counts.get(k.wild_art) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([art, n]) => `${n}× ${getWildArtLabelSingle(art)}`)
    .join(' · ')
}

/**
 * Aggregiert Kills pro wild_art zu strukturierten {species, count}-Items.
 * Reihenfolge: Insertion-Order (Caller sortiert bei Bedarf, siehe
 * timeline.ts vs. StreckeDetail).
 *
 * In 60.5a aus timeline.ts gehoisted, damit StreckeDetail-Loader denselben
 * Helper verwendet (Liste ↔ Detail dieselbe Aggregations-Granularität).
 */
export function aggregateBySpecies(
  rows: { wild_art: string }[],
): { species: WildArt; count: number }[] {
  const map = new Map<WildArt, number>()
  for (const r of rows) {
    const wa = r.wild_art as WildArt
    map.set(wa, (map.get(wa) ?? 0) + 1)
  }
  return Array.from(map.entries()).map(([species, count]) => ({ species, count }))
}
