// Beschriftungs-Helfer fuer Stand-Marker (Zoom-abhaengige Labels)

const PARTICLES = new Set(['v.', 'von', 'zu', 'van', 'de', 'la'])

/**
 * Initialen aus einem Namen bilden.
 *
 * Regeln:
 *  - Aufteilen nach Whitespace in Wörter
 *  - Bindestrich-Wörter liefern beide Teile (Hans-Gerd → "HG")
 *  - Partikel "v.", "von", "zu", "van", "de", "la" → Kleinbuchstabe
 *  - Einzelnes Wort ohne Bindestrich → erste zwei Buchstaben, zweiter klein
 *
 * Beispiele:
 *  "Peter Braun"                    → "PB"
 *  "Heinrich"                       → "He"
 *  "Hans-Gerd v. Alten-Weddelmann"  → "HGvAW"
 *  "Hans-Gerd Müller"               → "HGM"
 *  "Karl von Hohenstein"            → "KvH"
 *  "Maria de la Cruz"               → "MdlC"
 *  "" / null / undefined            → "?"
 */
export function buildInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?'

  const words = name.trim().split(/\s+/)

  // Einzelnes Wort ohne Bindestrich → erste zwei Buchstaben
  if (words.length === 1 && !words[0].includes('-')) {
    const w = words[0]
    if (w.length < 2) return w[0].toUpperCase()
    return w[0].toUpperCase() + w[1].toLowerCase()
  }

  let initials = ''
  for (const word of words) {
    if (PARTICLES.has(word.toLowerCase()) || PARTICLES.has(word)) {
      initials += word[0].toLowerCase()
    } else if (word.includes('-')) {
      for (const part of word.split('-')) {
        if (part.length > 0) {
          if (PARTICLES.has(part.toLowerCase())) {
            initials += part[0].toLowerCase()
          } else {
            initials += part[0].toUpperCase()
          }
        }
      }
    } else {
      initials += word[0].toUpperCase()
    }
  }

  return initials || '?'
}

/**
 * Distanz formatieren fuer Marker-Label.
 *  < 1000m  → "320m"
 *  >= 1000m → "1,2 km"
 */
export function formatDistanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}
