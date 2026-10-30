/**
 * Die Grenze der Stände in der PWA (CP-116, Migration 146) — Bauplan
 * `quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Sichtgrenze_Staende_V1.md`, E8.
 *
 * Der Server zeigt Schützen ihre Stände erst, wenn EINES gilt: Freigabe
 * (`hunts.map_open`), Jagd läuft oder lief, ein Treiben ist gestartet, oder es
 * ist eine Stunde vor `scheduled_for`. Die PWA kennt davon nur die Freigabe und
 * T−1h — sie lädt keine Treiben (E8, Punkt 1, hingenommen) —, und sie rechnet
 * nur in ihrem `scheduled`-Zweig. **Die Sperre sitzt in der DB**; hier wird nur
 * entschieden, was die Seite zeigt und wann sie nachlädt.
 *
 * ⚠ **Spiegel der App:** `quickhunt-native/src/lib/hunt/sicht.ts`
 * (`staendeGrenze`, `freigabeStreifen`). Die Sätze sind dieselben.
 */

/** Eine Stunde vor dem Termin öffnen die Stände von selbst (Bauplan §0). */
export const STAENDE_VORLAUF_MS = 3_600_000

/**
 * Puffer gegen eine vorgehende Geräteuhr (E8, Punkt 5, V1.4): T−1h zählt in der
 * PWA erst eine Minute später. Sonst löste eine vorgehende Uhr die einzige
 * Nachladung VOR der Serveröffnung aus, und die Seite bliebe leer. Eine Minute
 * ist ein Takt; mehr Versatz ist hingenommen.
 */
export const UHR_PUFFER_MS = 60_000

/** `scheduled_for − 1 h` als Zahl; `null` ohne (lesbaren) Termin. */
export function staendeAb(scheduledFor: string | null | undefined): number | null {
  if (!scheduledFor) return null
  const t = Date.parse(scheduledFor)
  return Number.isFinite(t) ? t - STAENDE_VORLAUF_MS : null
}

/**
 * Ist T−1h erreicht (mit Puffer)? `nowMs === 0` heißt: die Seite hat die Uhr
 * noch nicht gelesen (`Date.now()` gehört nicht in den Render) — dann nein.
 */
export function staendeAbErreicht(scheduledFor: string | null | undefined, nowMs: number): boolean {
  const ab = staendeAb(scheduledFor)
  return ab !== null && nowMs > 0 && nowMs >= ab + UHR_PUFFER_MS
}

/** Offen für Schützen, soweit die PWA es weiß: Freigabe oder T−1h. */
export function staendeOffen(mapOpen: boolean, scheduledFor: string | null | undefined, nowMs: number): boolean {
  return mapOpen || staendeAbErreicht(scheduledFor, nowMs)
}

const BERLIN_TAG = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
/** Mit Jahr — nur für „heute?" (Codex PWA 3: derselbe Tag im Folgejahr ist nicht heute). */
const BERLIN_DATUM = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
const BERLIN_UHR = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

/**
 * „am 01.12. um 06:00" bzw. „heute um 06:00" — in **Berliner Zeit**, nicht in
 * der Gerätezone (E8, Punkt 3, Schlusslesung Delta F2: `formatPlanDateTime`
 * rechnet ohne `timeZone`). `null` ohne Termin.
 */
export function wannAutomatisch(scheduledFor: string | null | undefined, nowMs: number): string | null {
  const ab = staendeAb(scheduledFor)
  if (ab === null) return null
  const tag = BERLIN_TAG.format(new Date(ab))
  const heute = nowMs > 0 && BERLIN_DATUM.format(new Date(nowMs)) === BERLIN_DATUM.format(new Date(ab))
  return `${heute ? 'heute' : `am ${tag}`} um ${BERLIN_UHR.format(new Date(ab))}`
}

/** Der Satz unter dem Karten-Schalter (E8, Punkt 3). */
export function freigabeHinweis(scheduledFor: string | null | undefined, nowMs: number): string {
  const wann = wannAutomatisch(scheduledFor, nowMs)
  return wann ? `Ohne Freigabe automatisch ${wann}.` : 'Ohne Freigabe automatisch beim Jagdstart.'
}

/**
 * Die Rückfrage vor dem Freigeben — wörtlich wie in der App (E3): der erste
 * Satz folgt der Sichtstufe, der zweite nennt den Zeitpunkt.
 */
export function freigabeRueckfrage(
  schuetzenSicht: string | null | undefined,
  scheduledFor: string | null | undefined,
  nowMs: number,
): string {
  const was =
    schuetzenSicht === 'alles'
      ? 'Alle zugesagten Schützen sehen dann ihren Stand und die Sitzordnung.'
      : 'Alle zugesagten Schützen sehen dann ihren Stand.'
  const wann = wannAutomatisch(scheduledFor, nowMs)
  return `${was} ${wann ? `Ohne Freigabe geschieht das automatisch ${wann}.` : 'Ohne Freigabe geschieht das automatisch beim Jagdstart.'}`
}
