import type { Kill } from '@/lib/types/kill'

// Kontext des aktuellen Betrachters für Maskier-Entscheidungen.
// V1 nutzt user_id, role, anonymize_kills.
// tags + shf_qualified sind strukturell vorgesehen für spätere Erweiterung
// (Gruppenleiter, Schweißhundführer), in V1 ungenutzt.
export interface ViewerContext {
  user_id: string | null
  role: 'jagdleiter' | 'schuetze'
  anonymize_kills: boolean
  tags: ReadonlyArray<'gruppenleiter' | 'hundefuehrer'>
  shf_qualified: boolean
}

// Profil-Slice eines Kill-Reporters, soweit für Maskierung relevant.
export interface KillerProfile {
  user_id: string
  display_name: string
  anonymize_kills: boolean
}

// Display-Repräsentation eines Kills nach Maskier-Entscheidung.
// display_name ist immer gesetzt — Klartext oder "Jäger".
export interface DisplayKill extends Kill {
  display_name: string
  is_anonymized: boolean
}

// Anonymer Anzeigename — exakt "Jäger", keine Nummerierung.
export const ANONYMOUS_NAME = 'Jäger' as const

// Fallback-Kaskade für den Reporter-Namen:
//   1. display_name, sofern gesetzt und keine E-Mail-Adresse
//   2. Teil vor "@", wenn display_name eine E-Mail ist (z.B. "moritz.lampe")
//   3. "Unbekannt"
// Altdaten-Schutz: Profile aus der Registrierungs-Frühphase haben display_name
// = E-Mail. Hier wird die Mail-Darstellung im Strecke-Tab unterdrückt.
export function resolveReporterName(raw: string | null | undefined): string {
  const trimmed = raw?.trim()
  if (!trimmed) return 'Unbekannt'
  if (trimmed.includes('@')) {
    const prefix = trimmed.split('@')[0].trim()
    return prefix || 'Unbekannt'
  }
  return trimmed
}

// Privilegierte Rolle = darf alles sehen (Klartext + Krank).
// V1: nur Jagdleiter. Erweiterbar ohne Helper-Aufrufer-Änderung.
function isPrivileged(viewer: ViewerContext): boolean {
  if (viewer.role === 'jagdleiter') return true
  // TODO: wenn Gruppenleiter-Privileg kommt:
  //   if (viewer.tags.includes('gruppenleiter')) return true
  // TODO: wenn SHF-Privileg kommt:
  //   if (viewer.tags.includes('hundefuehrer') && viewer.shf_qualified) return true
  return false
}

// Liefert DisplayKill oder null (= komplett verbergen).
//
// Regeln (Reihenfolge wichtig):
//   1. Eigener Kill (reporter_id = viewer.user_id) → immer Klartext + Krank-Icon.
//   2. Privilegiert (Jagdleiter) → Klartext + sieht Krank.
//   3. Krank + nicht privilegiert → null (komplett verbergen).
//   4. Nicht privilegiert + (Killer anonym ODER Viewer anonym) → "Jäger".
//   5. Sonst → Klartext.
//
// Blue-Tick-Prinzip ist in (4) abgebildet: Reziprozität.
export function maskKillForViewer(
  kill: Kill,
  killer: KillerProfile | undefined,
  viewer: ViewerContext,
): DisplayKill | null {
  const killerName = resolveReporterName(killer?.display_name)
  const killerAnonymous = killer?.anonymize_kills ?? false

  // (1) Eigener Kill → immer voll anzeigen
  const isOwnKill = viewer.user_id !== null && kill.reporter_id === viewer.user_id
  if (isOwnKill) {
    return { ...kill, display_name: killerName, is_anonymized: false }
  }

  const privileged = isPrivileged(viewer)

  // (2) Privilegiert → alles sehen, Klartext
  if (privileged) {
    return { ...kill, display_name: killerName, is_anonymized: false }
  }

  // (3) Krank + nicht privilegiert → komplett verbergen
  if (kill.status === 'wounded') {
    return null
  }

  // (4) Blue-Tick: Anonymisierung greift bei beiden Richtungen
  if (killerAnonymous || viewer.anonymize_kills) {
    return { ...kill, display_name: ANONYMOUS_NAME, is_anonymized: true }
  }

  // (5) Klartext
  return { ...kill, display_name: killerName, is_anonymized: false }
}
