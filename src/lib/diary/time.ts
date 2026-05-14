/**
 * Europe/Berlin canonical time helpers.
 *
 * Background: Jagdjahr boundaries (1.4. 00:00) and per-day grouping
 * are defined in German local time. Using JS local-Date constructors
 * or .getMonth()/.getDate() drifts between dev (Mac CEST) and prod
 * (Hetzner UTC). These helpers force Europe/Berlin as the reference,
 * DST-robust via Intl.DateTimeFormat.
 */

const BERLIN_TZ = 'Europe/Berlin'

/**
 * Returns the Berlin-local date fields for a given instant.
 * Example: 2026-03-31T22:30Z → { year: 2026, monthIdx: 3, day: 1 }
 * (because 22:30 UTC on 31.3. = 00:30 CEST on 1.4.)
 */
export function berlinDateFields(date: Date): {
  year: number
  monthIdx: number // 0-indexed, like Date.getMonth()
  day: number
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10)

  return {
    year: get('year'),
    monthIdx: get('month') - 1,
    day: get('day'),
  }
}

/**
 * Returns the UTC instant that corresponds to midnight (00:00:00.000)
 * of the given date in Europe/Berlin.
 *
 * DST-robust: works for both CET (UTC+1) and CEST (UTC+2) days, and
 * handles the spring-forward / fall-back boundaries correctly.
 *
 * Technique: place the Y/M/D at naive UTC, ask Berlin what it sees,
 * compute the offset, subtract.
 */
export function berlinMidnight(
  year: number,
  monthIdx: number,
  day: number,
): Date {
  const naive = new Date(Date.UTC(year, monthIdx, day, 0, 0, 0, 0))
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BERLIN_TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(naive)

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10)

  // Reconstruct what Berlin "thinks" naive UTC is.
  // Some locales render midnight as "24:00" instead of "00:00"; en-GB
  // should give "00", but the fallback is defensive hygiene.
  const asBerlinUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  )
  const offsetMs = asBerlinUTC - naive.getTime()
  return new Date(naive.getTime() - offsetMs)
}

/**
 * Returns a stable YYYY-MM-DD key for the date as seen in Europe/Berlin.
 * Replaces the buggy toLocalDateKey() duplicates in timeline.ts and
 * queries.ts.
 *
 * Example:
 *   toBerlinDateKey(new Date('2026-03-31T22:30:00Z'))
 *   → '2026-04-01' (because 22:30 UTC on 31.3. = 00:30 CEST on 1.4.)
 */
export function toBerlinDateKey(date: Date): string {
  const { year, monthIdx, day } = berlinDateFields(date)
  const m = String(monthIdx + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}
