/**
 * Selbsttest für die Stummschaltungs-Entscheidung (CN-201).
 *
 * **Was dieser Test festhält:** die vier Eingänge dürfen sich nicht
 * vermischen. Jeder der Fälle unten ist eine eigene Regel; würde jemand sie
 * beim Nachbessern zu einer Bedingung zusammenziehen, fiele mindestens einer
 * um.
 *
 * **Was er NICHT kann:** er prüft die Regel, nicht ihre Einbettung. Ob die
 * Route die vier Eingänge richtig BEFÜLLT — besonders, ob sie die Jagd aus
 * der autorisierten Chatgruppe nimmt und nicht aus dem Request-Body —, kann
 * hier nichts sehen. Genau dort sass der gefährlichste Befund der
 * Bauplan-Prüfung.
 *
 * Läuft ohne Netz und ohne Bundler:
 *   node --experimental-strip-types src/lib/push/stummschaltung.selftest.ts
 */

import assert from 'node:assert/strict'
import { darfPushEmpfangen } from './stummschaltung.ts'

const AUS = {
  istStumm: false,
  empfaengerIstLeiter: false,
  absenderIstLeiter: false,
  empfaengerIstJagdteilnehmer: false,
}

// --- Der Normalfall: nicht stumm, alles kommt an ---
assert.equal(darfPushEmpfangen(AUS), true, 'nicht stumm → Push')
assert.equal(
  darfPushEmpfangen({ ...AUS, absenderIstLeiter: true }),
  true,
  'nicht stumm, Absender Leiter → Push (der Durchstich darf nichts verschlimmern)',
)

// --- Stumm wirkt ---
assert.equal(
  darfPushEmpfangen({ ...AUS, istStumm: true }),
  false,
  'stumm, gewöhnlicher Absender → keine Push',
)
assert.equal(
  darfPushEmpfangen({ ...AUS, istStumm: true, empfaengerIstJagdteilnehmer: true }),
  false,
  'stumm, Empfänger ist Teilnehmer, Absender aber KEIN Leiter → keine Push',
)

// --- Der Durchstich (E3) ---
assert.equal(
  darfPushEmpfangen({
    ...AUS,
    istStumm: true,
    absenderIstLeiter: true,
    empfaengerIstJagdteilnehmer: true,
  }),
  true,
  'stumm, Absender ist Leiter UND Empfänger ist beigetreten → Push',
)

/**
 * **Der Riegel gegen den erschlichenen Titel.** Genau dieser Fall trennt die
 * gebaute Fassung von der, die die Bauplan-Prüfung verworfen hat: dort hätte
 * `absenderIstLeiter` allein genügt, und der Ersteller eines Stammtisch-Chats
 * hätte sich den Titel über eine selbst angelegte leere Jagd verschafft.
 *
 * Wird diese Zusicherung je rot, weil jemand `empfaengerIstJagdteilnehmer`
 * aus der Bedingung nimmt: **das ist kein zu strenger Test, das ist das Loch.**
 */
assert.equal(
  darfPushEmpfangen({
    ...AUS,
    istStumm: true,
    absenderIstLeiter: true,
    empfaengerIstJagdteilnehmer: false,
  }),
  false,
  'stumm, Absender „Leiter" — aber Empfänger ist der Jagd NICHT beigetreten → keine Push',
)

// --- Der Jagdleiter als Empfänger (B8) ---
assert.equal(
  darfPushEmpfangen({ ...AUS, istStumm: true, empfaengerIstLeiter: true }),
  true,
  'stumm, aber Empfänger führt die Jagd → Push (Nachsuche darf nicht liegenbleiben)',
)
assert.equal(
  darfPushEmpfangen({
    ...AUS,
    istStumm: true,
    empfaengerIstLeiter: true,
    empfaengerIstJagdteilnehmer: false,
  }),
  true,
  'Leiter-Empfänger gewinnt auch ohne joined-Flag — die Rolle trägt, nicht die Teilnahme',
)

/**
 * **Die Gegenprobe gegen einen Test, der nichts prüft** (Fremdprüfung
 * 19.09.2026, A12). Ohne die beiden Fälle hier bestünde auch eine kaputte
 * Fassung wie `if (!e.istStumm) return !e.empfaengerIstJagdteilnehmer`
 * sämtliche Zusicherungen oben — der nicht-stumme Teilnehmer kam schlicht
 * nicht vor. Ein Test, der eine falsche Implementierung durchlässt, sieht aus
 * wie ein Test.
 */
assert.equal(
  darfPushEmpfangen({ ...AUS, empfaengerIstJagdteilnehmer: true }),
  true,
  'nicht stumm, Empfänger ist Teilnehmer → Push',
)
assert.equal(
  darfPushEmpfangen({
    ...AUS,
    empfaengerIstJagdteilnehmer: true,
    absenderIstLeiter: true,
    empfaengerIstLeiter: true,
  }),
  true,
  'nicht stumm, alle Flags gesetzt → Push',
)

console.log('stummschaltung: alle Fälle grün')
