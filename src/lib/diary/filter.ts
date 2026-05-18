// src/lib/diary/filter.ts
//
// Single source of truth for the Jagdtagebuch filter chips.
//
// Zwei ORTHOGONALE Filter-Dimensionen, beide single-select (60.4 Phase 8c):
//
//   Jagdart:  Alle · Solo · Gesell   (?jagdart=)
//   Inhalt:   Alle · Erlegungen · Anblicke   (?inhalt=)
//
// Eine Card ist sichtbar, wenn sie BEIDE Filter passiert (AND).
// Sie filtern auf User-Intent, nicht auf Card-Type — ein Überläufer auf
// einer Drückjagd (≥2 Teilnehmer) rendert als GesellCard, muss aber unter
// "Erlegungen" auftauchen.
//
// Legacy: Phase-8b nutzte einen einzigen ?filter=-Param mit 5 Werten.
// parseJagdart/parseInhalt nehmen optional den alten Wert entgegen und
// mappen ihn still auf das neue Schema (stille Migration zur Render-Zeit;
// die URL wird erst beim ersten Chip-Klick neu geschrieben).

import type { TimelineItem } from './timeline'

export type JagdartFilter = 'alle' | 'solo' | 'gesell'
export type InhaltFilter = 'alle' | 'erlegungen' | 'anblicke'

export const JAGDART_FILTERS: { value: JagdartFilter; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'solo', label: 'Solo' },
  { value: 'gesell', label: 'Gesell' },
]

export const INHALT_FILTERS: { value: InhaltFilter; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'erlegungen', label: 'Erlegungen' },
  { value: 'anblicke', label: 'Anblicke' },
]

const JAGDART_VALUES = new Set<JagdartFilter>(['alle', 'solo', 'gesell'])
const INHALT_VALUES = new Set<InhaltFilter>(['alle', 'erlegungen', 'anblicke'])

/**
 * Liest ?jagdart=. Fällt auf 'alle' zurück. `legacy` ist der alte
 * ?filter=-Wert aus Phase 8b — 'solo'/'gesell' werden auf diese Dimension
 * gemappt, alles andere ignoriert.
 */
export function parseJagdart(
  raw: string | null | undefined,
  legacy?: string | null,
): JagdartFilter {
  if (raw && JAGDART_VALUES.has(raw as JagdartFilter)) return raw as JagdartFilter
  if (legacy === 'solo') return 'solo'
  if (legacy === 'gesell') return 'gesell'
  return 'alle'
}

/**
 * Liest ?inhalt=. Fällt auf 'alle' zurück. `legacy` ist der alte
 * ?filter=-Wert aus Phase 8b — 'erlegungen'/'anblicke' werden auf diese
 * Dimension gemappt; 'jagdtage' und Unbekanntes → 'alle'.
 */
export function parseInhalt(
  raw: string | null | undefined,
  legacy?: string | null,
): InhaltFilter {
  if (raw && INHALT_VALUES.has(raw as InhaltFilter)) return raw as InhaltFilter
  if (legacy === 'erlegungen') return 'erlegungen'
  if (legacy === 'anblicke') return 'anblicke'
  return 'alle'
}

/**
 * Jagdart-Dimension:
 *  - solo   → Solo-Charakter: Erlegung, Strecke, Anblick ohne Hunt
 *  - gesell → Gemeinschafts-Charakter: Gesell, Anblick mit Hunt
 */
function matchesJagdart(card: TimelineItem, filter: JagdartFilter): boolean {
  if (filter === 'alle') return true
  if (filter === 'solo') {
    if (card.kind === 'erlegung' || card.kind === 'strecke') return true
    if (card.kind === 'anblick') return card.huntId === null
    return false
  }
  // gesell
  if (card.kind === 'gesell') return true
  if (card.kind === 'anblick') return card.huntId !== null
  return false
}

/**
 * Inhalt-Dimension:
 *  - erlegungen → mind. ein eigener Kill: Erlegung, Strecke,
 *                 Gesell mit deinAnteil.length > 0
 *  - anblicke   → mind. eine eigene Sichtung: Anblick,
 *                 Gesell mit deineAnblicke.length > 0
 */
function matchesInhalt(card: TimelineItem, filter: InhaltFilter): boolean {
  if (filter === 'alle') return true
  if (filter === 'erlegungen') {
    if (card.kind === 'erlegung' || card.kind === 'strecke') return true
    if (card.kind === 'gesell') return card.deinAnteil.length > 0
    return false
  }
  // anblicke
  if (card.kind === 'anblick') return true
  if (card.kind === 'gesell') return card.deineAnblicke.length > 0
  return false
}

/**
 * Eine Card ist sichtbar, wenn sie BEIDE Dimensionen passiert (AND).
 */
export function matchesFilters(
  card: TimelineItem,
  jagdart: JagdartFilter,
  inhalt: InhaltFilter,
): boolean {
  return matchesJagdart(card, jagdart) && matchesInhalt(card, inhalt)
}

/**
 * Filter-spezifischer Empty-State-Text. 'alle'/'alle' wird vom Aufrufer
 * an den Container-Empty-State delegiert (nicht hier).
 */
export function buildEmptyText(
  jagdart: JagdartFilter,
  inhalt: InhaltFilter,
): string {
  if (jagdart === 'alle' && inhalt === 'alle') {
    return 'Noch keine Einträge im Tagebuch.'
  }
  if (jagdart === 'solo' && inhalt === 'erlegungen') {
    return 'Keine Solo-Erlegungen eingetragen.'
  }
  if (jagdart === 'solo' && inhalt === 'anblicke') {
    return 'Keine Solo-Anblicke eingetragen.'
  }
  if (jagdart === 'solo') {
    return 'Keine Solo-Einträge eingetragen.'
  }
  if (jagdart === 'gesell' && inhalt === 'erlegungen') {
    return 'Keine Erlegungen während Gesellschaftsjagden eingetragen.'
  }
  if (jagdart === 'gesell' && inhalt === 'anblicke') {
    return 'Keine Sichtungen während Gesellschaftsjagden eingetragen.'
  }
  if (jagdart === 'gesell') {
    return 'Keine Gesellschaftsjagden eingetragen.'
  }
  if (inhalt === 'erlegungen') {
    return 'Keine Erlegungen eingetragen.'
  }
  if (inhalt === 'anblicke') {
    return 'Keine Anblicke eingetragen.'
  }
  return 'Keine Einträge für diese Filterkombination.'
}
