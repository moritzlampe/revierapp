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

// Geplante Jagd (Sprint C): wartet auf scheduled_for, geht erst dann live.
// scheduled ist NICHT "live" — Karte/Strecke/Nachsuche/GPS sind gesperrt.
export function isHuntScheduled(status: string | null | undefined): boolean {
  return status === 'scheduled'
}

/**
 * Wie lange eine Jagd höchstens dauern darf, in Tagen — die Obergrenze für
 * `hunts.scheduled_until` gegen `hunts.scheduled_for`.
 *
 * **Die Zahl ist gemessen, nicht geraten** (Moritz, 04.08.2026): 95 % der
 * Jagden sind eintägig, 4 % gehen bis zu einer Woche, 1 % bis zu zwei. Der
 * Deckel sitzt am oberen Rand des Bestands.
 *
 * Gelesen vom mobilen PWA-Formular (`app/app/hunt/create/page.tsx`). **Der Kopf
 * dieser Datei sagt „Status-Helper", nicht „Hunt-Helfer" — hier stand das
 * Zweite und war eine Berufung auf etwas, das dort nicht steht**
 * (Fremdprüfung 06.08.2026). Die Konstante liegt trotzdem richtig: sie
 * beschreibt eine Eigenschaft des GEPLANTEN Zustands, und `isHuntScheduled`
 * direkt darüber tut dasselbe.
 *
 * **Drei weitere Kopien bleiben, und keine davon ist Nachlässigkeit:**
 * `app/zentrale/jagden/jagden.ts` darf nichts importieren (sein Selbsttest
 * läuft unter blankem `node`, ohne `@/`-Alias — dort steht die Begründung
 * ausführlich); Migration 102 deckelt den Cron (zwei Deckel, einer absolut
 * gegen `now()`); `create.tsx` der nativen App ihren Picker. Zwischen den
 * letzten beiden liegt eine Repo- und eine Sprachgrenze. Wer eine ändert,
 * muss alle vier nachziehen.
 */
export const MAX_JAGD_TAGE = 14
