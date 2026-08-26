// Beschriftungs-Helfer fuer Stand-Marker (Zoom-abhaengige Labels)


/**
 * Distanz formatieren fuer Marker-Label.
 *  < 1000m  → "320m"
 *  >= 1000m → "1,2 km"
 */
export function formatDistanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}
