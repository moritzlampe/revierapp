import { getWildArtLabelSingle } from '@/lib/wildArt'

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
