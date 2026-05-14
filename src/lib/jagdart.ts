import type { Database } from '@/lib/supabase/database.types'

/**
 * Jagdart (hunt_type enum). DB-Wahrheit aus database.types.ts —
 * kein duplizierter Union-Type.
 */
export type HuntType = Database['public']['Enums']['hunt_type']

/**
 * Anzeige-Label pro Jagdart. Wird in Diary-Cards (AnblickCard,
 * GesellCard) genutzt. Picker-Labels (z.B. "Gemeinschaftsansitz")
 * bleiben absichtlich nicht hier, weil sie kontextspezifisch sind.
 */
export const JAGDART_LABEL: Record<HuntType, string> = {
  ansitz: 'Ansitz',
  pirsch: 'Pirsch',
  drueckjagd: 'Drückjagd',
  erntejagd: 'Erntejagd',
}
