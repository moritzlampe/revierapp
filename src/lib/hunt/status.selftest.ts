/**
 * Selbsttest für `status.ts`. Ausführen:
 *
 *   node --experimental-strip-types src/lib/hunt/status.selftest.ts
 *
 * Relativer Import MIT `.ts` — der `@/`-Alias existiert unter blankem `node`
 * nicht (dieselbe Falle, an der der Portal-Selbsttest hängt). `tsconfig.json`
 * schließt `**​/*.selftest.ts` aus, deshalb stört die Endung `tsc` nicht.
 */
import assert from 'node:assert/strict'
import {
  MAX_JAGD_TAGE,
  STANDARD_BEGINN,
  STANDARD_ENDE,
  alsTerminwert,
  datumTeil,
  zeitTeil,
  spaetesterEndtag,
  tagPlus,
} from './status.ts'

// --- Zerlegen und Zusammensetzen --------------------------------------------

assert.equal(datumTeil('2026-11-14T08:00'), '2026-11-14')
assert.equal(zeitTeil('2026-11-14T08:00'), '08:00')
assert.equal(datumTeil(''), '')
assert.equal(zeitTeil('2026-11-14'), '') // nur Datum, keine Uhrzeit

// Die Voreinstellungen (Moritz, 06.08.2026: 7 Uhr los, 20 Uhr Schluss).
assert.equal(alsTerminwert('2026-11-14', '', STANDARD_BEGINN), '2026-11-14T07:00')
assert.equal(alsTerminwert('2026-11-16', '', STANDARD_ENDE), '2026-11-16T20:00')
assert.equal(alsTerminwert('2026-11-14', '05:30', STANDARD_BEGINN), '2026-11-14T05:30')

// **Ohne Datum ist der GANZE Wert leer.** Im Formular haengt daran, dass ein
// geleerter Start auch das Ende leert — eine Uhrzeit ohne Tag ist kein Termin.
assert.equal(alsTerminwert('', '07:00', STANDARD_BEGINN), '')

// --- Der Deckel -------------------------------------------------------------

/**
 * **Gezaehlt werden KALENDERTAGE, nicht 24-Stunden-Bloecke** (Korrektur vom
 * 06.08.2026). Die erste Fassung rechnete die Zeitspanne und klemmte deshalb
 * einen Tag zu frueh: mit den Voreinstellungen 07:00/20:00 sind Starttag + 14
 * Tage in Wahrheit 14 Tage und 13 Stunden. Moritz: „14 tage + die 13 stunden
 * sind korrekt geplant." Migration 108 hebt den Cron-Deckel auf 16 Tage.
 *
 * Der Vertrag ist damit einfach und zonenfrei: Datumsteil des Starts plus
 * MAX_JAGD_TAGE. Die Endzeit geht nicht mehr ein.
 */
assert.equal(spaetesterEndtag('2026-11-14T07:00'), '2026-11-28')
assert.equal(spaetesterEndtag('2026-07-15T07:00'), '2026-07-29')

// Ueber beide Zeitumstellungen und ueber Monats-/Jahresgrenze.
assert.equal(spaetesterEndtag('2026-10-18T07:00'), '2026-11-01') // Rueckstellung dazwischen
assert.equal(spaetesterEndtag('2026-03-22T07:00'), '2026-04-05') // Vorstellung dazwischen
assert.equal(spaetesterEndtag('2026-12-28T07:00'), '2027-01-11')

// Die Endzeit darf das Ergebnis NICHT mehr verschieben — die alte Fassung tat
// das, und genau daran hat sich der Deckel vertan.
assert.equal(spaetesterEndtag('2026-11-14T00:00'), spaetesterEndtag('2026-11-14T23:59'))

// `tagPlus` einzeln.
assert.equal(tagPlus('2026-11-14', 14), '2026-11-28')
assert.equal(tagPlus('2026-10-18', 14), '2026-11-01')
assert.equal(tagPlus('', 14), '')
assert.equal(tagPlus('kein datum', 14), '')
// **Ein Datum, das es nicht gibt, wird abgelehnt statt normalisiert.**
// `new Date('2026-02-30T12:00:00Z')` wirft nicht, es rutscht auf den 2. Maerz —
// der Deckel laege dann still einen Tag daneben (Fremdpruefung 06.08.2026).
assert.equal(tagPlus('2026-02-30', 14), '')
assert.equal(tagPlus('2026-13-01', 14), '')

// Ohne brauchbaren Start kein Deckel: das Feld bleibt offen, statt auf einem
// Fantasiewert zu klemmen.
assert.equal(spaetesterEndtag(''), '')
assert.equal(spaetesterEndtag('morgen frueh'), '')
assert.equal(spaetesterEndtag('2026-02-30T07:00'), '')

/**
 * **Der schlechteste vom Formular erlaubte Fall muss unter dem Cron-Deckel aus
 * Migration 108 bleiben** (16 Tage). Faellt eine dieser Zeilen, plant das
 * Formular eine Jagd, die der Cron nicht mehr verschont — sie wird nachts
 * eingesammelt, ohne dass irgendwo etwas meldet.
 *
 * **Die erste Fassung prueffte nur einen Novembertag und war deshalb blind.**
 * Sie belegte `< 15 Tage` und liess mich `interval '15 days'` in die Migration
 * schreiben. Zwischen dem 18.10. und dem 01.11. liegt aber die
 * HERBSTumstellung, und einer der Tage hat dann 25 Stunden: der schlechteste
 * Fall ist dort **15 Tage 00:59**. Gefunden von der Fremdpruefung als `[high]`,
 * an der Datenbank nachgemessen, Migration auf 16 Tage korrigiert — bevor sie
 * appliziert wurde (06.08.2026).
 *
 * Die Zusicherung laeuft deshalb ueber BEIDE Umstellungen und einen
 * Normalfall. Sie rechnet in der Zone des Rechners; damit der Herbstfall
 * ueberhaupt 25 Stunden hat, wird er zusaetzlich fest in UTC-Offsets geprueft.
 */
const CRON_DECKEL_TAGE = 16
// Der Deckel muss ueber MAX_JAGD_TAGE liegen — sonst deckelt der Cron enger als
// das Formular plant, und die Probe unten koennte gar nicht mehr fehlschlagen.
assert.ok(CRON_DECKEL_TAGE > MAX_JAGD_TAGE)
for (const start of ['2026-11-14T00:00', '2026-10-18T00:00', '2026-03-22T00:00']) {
  const ende = `${spaetesterEndtag(start)}T23:59`
  const spanne = new Date(ende).getTime() - new Date(start).getTime()
  assert.ok(
    spanne < CRON_DECKEL_TAGE * 86_400_000,
    `${start}: schlechtester Fall ${(spanne / 86_400_000).toFixed(3)} Tage >= ${CRON_DECKEL_TAGE}`,
  )
}

// Der Herbstfall mit festen Offsets — zonenunabhaengig, und genau die Rechnung,
// die 15 Tage gerissen hat. `15 days` muss hier fallen, `16 days` halten.
{
  const start = new Date('2026-10-17T22:00:00Z') // 18.10. 00:00 CEST
  const ende = new Date('2026-11-01T22:59:00Z') //  1.11. 23:59 CET
  const spanne = ende.getTime() - start.getTime()
  assert.ok(spanne > 15 * 86_400_000, 'Herbstfall sollte 15 Tage reissen — sonst ist die Probe stumpf')
  assert.ok(spanne < CRON_DECKEL_TAGE * 86_400_000, 'Herbstfall reisst auch den 16-Tage-Deckel')
}

console.log('status.selftest: alles gruen')
