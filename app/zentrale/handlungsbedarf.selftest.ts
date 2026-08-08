// Gegenprobe fuer die Fristen der Uebersicht. Kein Test-Runner im Repo,
// deshalb ein eigenstaendiges Skript (Muster: laden.selftest.ts):
//
//   node --experimental-strip-types app/zentrale/handlungsbedarf.selftest.ts
//
// Laeuft ohne Ausgabe durch, wenn alles stimmt; wirft sonst.
// Wird vom Sammel-Script `npm run selftest` per Glob mitgenommen.
import assert from 'node:assert/strict'
import { FRIST_TAGE, inTagen, laeuftBaldAb } from './handlungsbedarf.ts'

// **Der Wert selbst, nicht nur seine Verwendung** (Fremdprüfung 08.08.2026,
// P7). Die Grenztests unten leiten ihre Erwartung aus `FRIST_TAGE` ab — eine
// Änderung auf 30 hätte sie alle grün gelassen und trotzdem den vereinbarten
// Horizont halbiert. Ein Test, der seine eigene Annahme einsetzt, prüft sie
// nicht, er wiederholt sie.
assert.equal(FRIST_TAGE, 60, 'Der Agenda-Horizont ist auf 60 Tage vereinbart (Konzept §1.3a)')

// --- inTagen(): Kalenderuebergaenge ---
assert.equal(inTagen('2026-08-08', 0), '2026-08-08')
assert.equal(inTagen('2026-08-08', 1), '2026-08-09')
assert.equal(inTagen('2026-08-31', 1), '2026-09-01', 'Monatsende')
assert.equal(inTagen('2026-12-31', 1), '2027-01-01', 'Jahreswechsel')
assert.equal(inTagen('2028-02-28', 1), '2028-02-29', 'Schaltjahr')
assert.equal(inTagen('2027-02-28', 1), '2027-03-01', 'kein Schaltjahr')

// **Die Zeitumstellung, und sie ist der Grund fuer die UTC-Rechnung.**
// In diesem Repo ist eine Frist neben einer Zeitumstellung viermal in vier
// Tagen schiefgegangen (s. Migration 108). Hier kann sie es nicht: UTC kennt
// keine Umstellung, also sind +60 Tage immer genau 60 Kalendertage.
// Der 25.10.2026 ist die Herbstumstellung (25 Stunden), der 29.03.2026 die
// Fruehjahrsumstellung (23 Stunden) — beide liegen in diesen Spannen.
assert.equal(inTagen('2026-10-01', 60), '2026-11-30', 'ueber die Herbstumstellung')
assert.equal(inTagen('2026-03-01', 60), '2026-04-30', 'ueber die Fruehjahrsumstellung')

// Negative Spanne — nicht benutzt, aber die Funktion darf daran nicht
// stillschweigend etwas anderes tun als rechnen.
assert.equal(inTagen('2026-01-01', -1), '2025-12-31')

// --- laeuftBaldAb(): nur ein HEUTE gueltiger Schein ---
const heute = '2026-08-08'

// Positivkontrolle zuerst: ohne sie belegt die Reihe darunter nur, dass die
// Funktion gern `false` sagt.
assert.equal(laeuftBaldAb('aktiv', '2026-09-01', heute), true)

// **Beide Grenzen einschliessend, zeichengleich zu Migration 077.**
// **Literale Daten, nicht aus `inTagen` abgeleitet** — sonst pruefte der Test
// die Funktion gegen sich selbst. 08.08. + 60 Tage = 07.10.2026, von Hand
// nachgerechnet (23 Tage August + 30 September + 7 Oktober).
assert.equal(laeuftBaldAb('aktiv', heute, heute), true, 'letzter Tag ist heute')
assert.equal(laeuftBaldAb('aktiv', '2026-10-07', heute), true, 'Tag 60 — genau die Frist')
assert.equal(laeuftBaldAb('aktiv', '2026-10-08', heute), false, 'Tag 61 — einen zu weit')
assert.equal(laeuftBaldAb('aktiv', '2026-08-07', heute), false, 'gestern vorbei')

// Gegenprobe, dass die beiden Literale oben zur Konstante passen: laeuft
// `FRIST_TAGE` je auseinander, faellt hier auf, statt still durchzugehen.
assert.equal(inTagen(heute, FRIST_TAGE), '2026-10-07')

// Jeder andere Status faellt heraus. Einzeln aufgezaehlt statt in einer
// Schleife: `effektiverStatus` kann genau diese sechs Werte liefern, und eine
// Schleife ueber ein Array haette denselben Tippfehler in Test und Code.
assert.equal(laeuftBaldAb('abgelaufen', '2026-09-01', heute), false)
assert.equal(laeuftBaldAb('pausiert', '2026-09-01', heute), false)
assert.equal(laeuftBaldAb('entzogen', '2026-09-01', heute), false)
assert.equal(laeuftBaldAb('nochnicht', '2026-09-01', heute), false)
assert.equal(laeuftBaldAb('unbekannt', '2026-09-01', heute), false)

// **`brauchtAntwort` ist am 08.08.2026 gestrichen worden** (Ponytail-Lesung) —
// die Abfrage in `page.tsx` garantiert beide Bedingungen bereits, das Praedikat
// konnte an seiner einzigen Aufrufstelle nie `false` liefern. Begruendung im
// Kommentarblock von `handlungsbedarf.ts`, samt dem lexikalischen
// Zeitstempel-Vergleich, der mit ihm weggefallen ist.
