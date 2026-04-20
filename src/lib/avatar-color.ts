/**
 * Deterministische Avatar-Farbzuweisung (Design-System §9).
 *
 * 12 entsättigte Töne, harmonisch zum Theme, Kontrast zu weißem Text ≥AA.
 * Muted Red und Bordeaux fehlen bewusst, damit sie nicht mit `--alert-text`
 * (Nachsuche-Rot) kollidieren.
 *
 * Primär-Input: `user.id`. Fallback: `display_name`. Lowercase + trim, damit
 * kleine Tipp-Unterschiede ("Moritz " vs. "moritz") dieselbe Farbe ergeben.
 *
 * Diese Utility wird in Sprint 58.1h.c die vier parallelen Paletten
 * (`.av-1…6`, `AVATAR_COLORS`, `SEAT_AVATAR_COLORS`, `AVATAR_HEX`,
 * `SENDER_COLORS`) ablösen. In 58.1h.b existiert sie nur als Foundation.
 */

export const AVATAR_COLORS = [
  '#4F6D7A', // Forest Blue
  '#5A6FA8', // Slate Blue
  '#5E7A3A', // Moss Green
  '#6B7A2E', // Deep Olive
  '#7A5C3A', // Earth Brown
  '#6A4E3B', // Walnut
  '#8A6E2E', // Dark Gold
  '#465E7A', // Deep Slate Blue
  '#6A5A7A', // Dusty Purple
  '#7A6A8F', // Heather Violet
  '#6B6F5A', // Stone Grey
  '#3F6B6A', // Dark Teal
] as const

/**
 * djb2-Hash-Variante. Gute Verteilung über kurze ASCII-Strings.
 *
 * Verifiziert mit drei bekannten Eingaben (Stand 2026-04-20):
 *   getAvatarColor('Moritz')       → '#8A6E2E' (idx 6, Dark Gold)
 *   getAvatarColor('Andreas Berg') → '#7A6A8F' (idx 9, Heather Violet)
 *   getAvatarColor('Jagdleiter')   → '#6B6F5A' (idx 10, Stone Grey)
 *
 * Wenn diese Zuordnungen sich bei Code-Änderungen verschieben, ist der
 * Algorithmus oder die Palette versehentlich gedreht worden.
 */
export function getAvatarColor(input: string): string {
  const str = input.toLowerCase().trim()
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
