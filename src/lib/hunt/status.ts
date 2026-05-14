// Zentrale Status-Helper für Hunts. Wenn weitere "beendet"-Status-Werte
// dazukommen (z.B. cancelled), nur hier ergänzen — alle Lese-Stellen
// nutzen isHuntEnded() statt direktem Vergleich.

export const HUNT_STATUS_ENDED = ['completed', 'auto_completed'] as const
export type HuntEndedStatus = (typeof HUNT_STATUS_ENDED)[number]

export function isHuntEnded(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'auto_completed'
}

export function isHuntAutoCompleted(status: string | null | undefined): boolean {
  return status === 'auto_completed'
}
