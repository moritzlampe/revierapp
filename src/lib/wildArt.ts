import {
  type WildArt,
  type WildGroup,
  WILD_GROUP_CONFIG,
  WILD_GROUP_DETAILS,
  FLAT_GROUP_TIERE,
} from '@/lib/species-config'

/**
 * Liefert das Anzeige-Label für ein einzelnes Stück Wild.
 * Beispiele: "rehbock" → "Bock", "frischling" → "Frischling",
 * "fuchs" → "Fuchs", "schwarzwild_unspez" → "Schwarzwild".
 *
 * Sucht in dieser Reihenfolge:
 *   1) Altersklassen pro Wildgruppe (WILD_GROUP_DETAILS)
 *   2) Flache Tier-Listen (FLAT_GROUP_TIERE)
 *   3) Unspez-Fallback auf Gruppen-Label (WILD_GROUP_CONFIG.unspezValue)
 * Fällt sonst auf den rohen String zurück.
 */
export function getWildArtLabelSingle(wildArt: WildArt | string): string {
  for (const details of Object.values(WILD_GROUP_DETAILS)) {
    if (!details) continue
    const found = details.altersklassen.find(a => a.value === wildArt)
    if (found) return found.label
  }
  for (const list of Object.values(FLAT_GROUP_TIERE)) {
    const found = list?.find(a => a.value === wildArt)
    if (found) return found.label
  }
  const group = WILD_GROUP_CONFIG.find(g => g.unspezValue === (wildArt as WildArt))
  if (group) return group.label
  return String(wildArt)
}

/**
 * Liefert das deutsche Anzeige-Label für eine Wildgruppe.
 * Beispiel: "rehwild" → "Rehwild".
 */
export function getWildGroupLabel(group: WildGroup): string {
  return WILD_GROUP_CONFIG.find(c => c.group === group)?.label ?? group
}
