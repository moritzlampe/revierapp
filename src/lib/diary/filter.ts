// src/lib/diary/filter.ts
//
// Single source of truth for the Jagdtagebuch filter chip values.
// Used by DiaryChipRow (URL writer + chip highlight) and
// DiaryTimelineList (data filter + empty state).
//
// Filter sind ORTHOGONAL, nicht exklusiv: ein Card kann unter mehreren
// Filtern auftauchen (z.B. Gesell-Hunt mit eigener Erlegung → Gesell UND
// Erlegungen). Sie filtern auf User-Intent, nicht auf Card-Type — ein
// Überläufer auf einer Drückjagd (≥2 Teilnehmer) rendert als GesellCard,
// muss aber unter "Erlegungen" auftauchen (60.4 Phase 8b).

import type { TimelineItem } from './timeline'

export type DiaryFilter = 'alle' | 'solo' | 'gesell' | 'erlegungen' | 'anblicke'

export const VALID_FILTERS: readonly DiaryFilter[] = [
  'alle',
  'solo',
  'gesell',
  'erlegungen',
  'anblicke',
] as const

/**
 * Parses a raw URL param value into a valid DiaryFilter.
 * Unknown / missing values fall back to 'alle'. Deckt damit auch die
 * Legacy-Migration ab: 'jagdtage' und alte/unbekannte Werte → 'alle';
 * 'erlegungen' | 'anblicke' | 'gesell' behalten ihr Label (Logik in
 * matchesFilter geändert); 'solo' ist neu gültig.
 */
export function parseFilter(raw: string | null | undefined): DiaryFilter {
  if (!raw) return 'alle'
  return (VALID_FILTERS as readonly string[]).includes(raw)
    ? (raw as DiaryFilter)
    : 'alle'
}

/**
 * Entscheidet, ob ein Timeline-Card unter dem gegebenen Filter sichtbar ist.
 *
 *  - solo       → Solo-Charakter: Erlegung, Strecke, Anblick ohne Hunt
 *  - gesell     → Gemeinschafts-Charakter: Gesell, Anblick mit Hunt
 *  - erlegungen → mind. ein eigener Kill: Erlegung, Strecke,
 *                 Gesell mit deinAnteil.length > 0
 *  - anblicke   → mind. eine Sichtung: Anblick,
 *                 Gesell mit deineAnblicke.length > 0
 */
export function matchesFilter(card: TimelineItem, filter: DiaryFilter): boolean {
  switch (filter) {
    case 'alle':
      return true

    case 'solo':
      if (card.kind === 'erlegung' || card.kind === 'strecke') return true
      if (card.kind === 'anblick') return card.huntId === null
      return false

    case 'gesell':
      if (card.kind === 'gesell') return true
      if (card.kind === 'anblick') return card.huntId !== null
      return false

    case 'erlegungen':
      if (card.kind === 'erlegung' || card.kind === 'strecke') return true
      if (card.kind === 'gesell') return card.deinAnteil.length > 0
      return false

    case 'anblicke':
      if (card.kind === 'anblick') return true
      if (card.kind === 'gesell') return card.deineAnblicke.length > 0
      return false
  }
}
