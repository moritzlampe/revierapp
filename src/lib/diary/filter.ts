// src/lib/diary/filter.ts
//
// Single source of truth for the Jagdtagebuch filter chip values.
// Used by DiaryChipRow (URL writer + chip highlight) and
// DiaryTimelineList (data filter + empty state).

export type DiaryFilter = 'alle' | 'erlegungen' | 'anblicke' | 'gesell'

export const VALID_FILTERS: readonly DiaryFilter[] = [
  'alle',
  'erlegungen',
  'anblicke',
  'gesell',
] as const

/**
 * Parses a raw URL param value into a valid DiaryFilter.
 * Unknown / missing values (incl. legacy 'jagdtage') fall back to 'alle'.
 */
export function parseFilter(raw: string | null | undefined): DiaryFilter {
  if (!raw) return 'alle'
  return (VALID_FILTERS as readonly string[]).includes(raw)
    ? (raw as DiaryFilter)
    : 'alle'
}
