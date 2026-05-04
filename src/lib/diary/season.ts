/**
 * Jagdjahr-Helpers.
 * Jagdjahr (DE-Konvention): 1. April bis 31. März.
 * Hegering-Statistiken und Schonzeiten richten sich danach.
 */

export interface Jagdjahr {
  /** 4-stelliger Start-Year als String, z. B. "2026" für Jagdjahr 2026/27 */
  key: string
  /** Anfang des Jagdjahrs, immer 1. April 00:00:00 lokal */
  start: Date
  /** Ende des Jagdjahrs (exklusiv), immer 1. April 00:00:00 des Folgejahres */
  end: Date
  /** Display-Label im Kompakt-Format "Jagdjahr 26/27" */
  label: string
}

/**
 * Liefert das Jagdjahr-Objekt für ein Datum oder den heutigen Tag.
 * Datum >= 1.4. -> aktuelles Kalenderjahr
 * Datum <  1.4. -> Vorjahr
 */
export function getJagdjahr(date: Date = new Date()): Jagdjahr {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return jagdjahrFromStartYear(year)
}

/**
 * Liefert das Jagdjahr-Objekt für einen 4-stelligen Start-Year-String,
 * wie er in der URL bzw. im DB-Format verwendet wird.
 * Wirft, wenn key nicht /^\d{4}$/ ist.
 */
export function jagdjahrFromKey(key: string): Jagdjahr {
  if (!/^\d{4}$/.test(key)) {
    throw new Error(`Invalid Jagdjahr key: "${key}". Expected 4-digit year string.`)
  }
  return jagdjahrFromStartYear(parseInt(key, 10))
}

/**
 * Nächstes Jagdjahr (key+1).
 */
export function nextJagdjahr(jj: Jagdjahr): Jagdjahr {
  return jagdjahrFromStartYear(parseInt(jj.key, 10) + 1)
}

/**
 * Vorheriges Jagdjahr (key-1).
 */
export function prevJagdjahr(jj: Jagdjahr): Jagdjahr {
  return jagdjahrFromStartYear(parseInt(jj.key, 10) - 1)
}

/**
 * True, wenn ein Datum innerhalb des Jagdjahrs liegt.
 */
export function isWithinJagdjahr(date: Date, jj: Jagdjahr): boolean {
  return date >= jj.start && date < jj.end
}

// --- internal ---

function jagdjahrFromStartYear(startYear: number): Jagdjahr {
  const start = new Date(startYear, 3, 1, 0, 0, 0, 0) // April = month 3
  const end = new Date(startYear + 1, 3, 1, 0, 0, 0, 0)
  const yyShort = String(startYear).slice(2)
  const yyShortNext = String(startYear + 1).slice(2)
  return {
    key: String(startYear),
    start,
    end,
    label: `Jagdjahr ${yyShort}/${yyShortNext}`,
  }
}
