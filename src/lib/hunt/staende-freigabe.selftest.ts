/**
 * Selbsttest für `staende-freigabe.ts` (CP-116, E8). Ausführen:
 *
 *   node --experimental-strip-types src/lib/hunt/staende-freigabe.selftest.ts
 *
 * Relativer Import MIT `.ts` — der `@/`-Alias existiert unter blankem `node`
 * nicht. `tsconfig.json` schließt `**​/*.selftest.ts` aus.
 */
import assert from 'node:assert/strict'
import {
  STAENDE_VORLAUF_MS,
  UHR_PUFFER_MS,
  freigabeHinweis,
  freigabeRueckfrage,
  staendeAb,
  staendeAbErreicht,
  staendeOffen,
  wannAutomatisch,
} from './staende-freigabe.ts'

const ms = (iso: string) => Date.parse(iso)

// 01.12.2026, 07:00 in Berlin (MEZ) — T−1h ist 06:00 Berliner Zeit.
const TERMIN = '2026-12-01T06:00:00Z'
const AB = ms('2026-12-01T05:00:00Z')
const VORHER = ms('2026-11-28T12:00:00Z')

// --- T−1h, absolut und mit Puffer ------------------------------------------

assert.equal(staendeAb(TERMIN), ms(TERMIN) - STAENDE_VORLAUF_MS)
assert.equal(staendeAb(null), null)
assert.equal(staendeAb('kaputt'), null)
assert.equal(staendeAbErreicht(TERMIN, VORHER), false)
// Eine vorgehende Uhr öffnet nicht vor dem Server: erst T−1h + 60 s.
assert.equal(staendeAbErreicht(TERMIN, AB), false)
assert.equal(staendeAbErreicht(TERMIN, AB + UHR_PUFFER_MS - 1), false)
assert.equal(staendeAbErreicht(TERMIN, AB + UHR_PUFFER_MS), true)
// Uhr noch nicht gelesen: nie offen durch die Zeit.
assert.equal(staendeAbErreicht(TERMIN, 0), false)
assert.equal(staendeAbErreicht(null, AB + UHR_PUFFER_MS), false)

assert.equal(staendeOffen(true, TERMIN, VORHER), true)
assert.equal(staendeOffen(false, TERMIN, VORHER), false)
assert.equal(staendeOffen(false, TERMIN, AB + UHR_PUFFER_MS), true)
assert.equal(staendeOffen(false, null, VORHER), false)

// --- Sätze in Berliner Zeit -------------------------------------------------

assert.equal(wannAutomatisch(TERMIN, VORHER), 'am 01.12. um 06:00')
assert.equal(wannAutomatisch(TERMIN, ms('2026-12-01T03:00:00Z')), 'heute um 06:00')
// Jagd um 00:30 → T−1h am Vortag, 23:30.
assert.equal(wannAutomatisch('2026-11-30T23:30:00Z', VORHER), 'am 30.11. um 23:30')
// Zeitumstellung 25.10.2026: 07:00 MEZ = 06:00 UTC → T−1h 06:00 MEZ.
assert.equal(wannAutomatisch('2026-10-25T06:00:00Z', ms('2026-10-24T23:30:00Z')), 'heute um 06:00')
assert.equal(wannAutomatisch(null, VORHER), null)
// Derselbe Kalendertag ein Jahr vorher ist nicht „heute" (Codex PWA 3).
assert.equal(wannAutomatisch(TERMIN, ms('2025-12-01T03:00:00Z')), 'am 01.12. um 06:00')

assert.equal(freigabeHinweis(TERMIN, VORHER), 'Ohne Freigabe automatisch am 01.12. um 06:00.')
assert.equal(freigabeHinweis(null, VORHER), 'Ohne Freigabe automatisch beim Jagdstart.')

assert.equal(
  freigabeRueckfrage('alles', TERMIN, VORHER),
  'Alle zugesagten Schützen sehen dann ihren Stand und die Sitzordnung. Ohne Freigabe geschieht das automatisch am 01.12. um 06:00.',
)
assert.equal(
  freigabeRueckfrage('eigener', null, VORHER),
  'Alle zugesagten Schützen sehen dann ihren Stand. Ohne Freigabe geschieht das automatisch beim Jagdstart.',
)
assert.equal(
  freigabeRueckfrage(undefined, TERMIN, ms('2026-12-01T03:00:00Z')),
  'Alle zugesagten Schützen sehen dann ihren Stand. Ohne Freigabe geschieht das automatisch heute um 06:00.',
)

console.log('staende-freigabe: alle Proben grün')
