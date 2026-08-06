// Zentrale Status-Helper für Hunts. Wenn weitere "beendet"-Status-Werte
// dazukommen (z.B. cancelled), nur hier ergänzen — alle Lese-Stellen
// nutzen isHuntEnded() statt direktem Vergleich.

export const HUNT_STATUS_ENDED = ['completed', 'auto_completed'] as const
export type HuntEndedStatus = (typeof HUNT_STATUS_ENDED)[number]

export function isHuntEnded(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'auto_completed'
}

export function isHuntAutoCompleted(status: string | null | undefined): boolean {
  return status === 'auto_completed'
}

// Geplante Jagd (Sprint C): wartet auf scheduled_for, geht erst dann live.
// scheduled ist NICHT "live" — Karte/Strecke/Nachsuche/GPS sind gesperrt.
export function isHuntScheduled(status: string | null | undefined): boolean {
  return status === 'scheduled'
}

/**
 * Wie lange eine Jagd höchstens dauern darf, in Tagen — die Obergrenze für
 * `hunts.scheduled_until` gegen `hunts.scheduled_for`.
 *
 * **Die Zahl ist gemessen, nicht geraten** (Moritz, 04.08.2026): 95 % der
 * Jagden sind eintägig, 4 % gehen bis zu einer Woche, 1 % bis zu zwei. Der
 * Deckel sitzt am oberen Rand des Bestands.
 *
 * Gelesen vom mobilen PWA-Formular (`app/app/hunt/create/page.tsx`). **Der Kopf
 * dieser Datei sagt „Status-Helper", nicht „Hunt-Helfer" — hier stand das
 * Zweite und war eine Berufung auf etwas, das dort nicht steht**
 * (Fremdprüfung 06.08.2026). Die Konstante liegt trotzdem richtig: sie
 * beschreibt eine Eigenschaft des GEPLANTEN Zustands, und `isHuntScheduled`
 * direkt darüber tut dasselbe.
 *
 * **Weitere Fassungen stehen anderswo, und keine ist Nachlässigkeit:**
 * `app/zentrale/jagden/jagden.ts` trägt dieselbe 14 (das Modul darf nichts
 * importieren — sein Selbsttest läuft unter blankem `node` ohne `@/`-Alias,
 * dort steht die Begründung ausführlich); `create.tsx` der nativen App ebenso,
 * für ihren Picker.
 *
 * **Der Cron trägt eine ANDERE Zahl, und das ist wichtig:** Migration 108
 * deckelt bei 16 Tagen, weil 14 KALENDERTAGE im schlechtesten Fall 15 Tage
 * 00:59 Stunden belegen. Hier stand „wer eine ändert, muss alle vier
 * nachziehen" — als wären es vier gleiche Werte (Fremdprüfung 06.08.2026).
 * Wer diese 14 ändert, muss den Cron-Deckel NEU AUSRECHNEN, nicht abschreiben.
 */
export const MAX_JAGD_TAGE = 14

/**
 * Wann eine Jagd beginnt und endet, wenn niemand die Uhrzeit anfasst.
 *
 * **Moritz, 06.08.2026:** *„eine jagd geht immer morgens um 7 los und endet den
 * ausgewählten tag um 20 uhr. zeit dann änderbar, aber das wäre der
 * voreingestellte standart"*.
 *
 * Dieselben zwei Werte stehen im Portal (`app/zentrale/jagden/jagden.ts`) —
 * aus demselben Grund wie `MAX_JAGD_TAGE`: jenes Modul darf nichts importieren,
 * weil sein Selbsttest unter blankem `node` ohne `@/`-Alias läuft.
 */
export const STANDARD_BEGINN = '07:00'
export const STANDARD_ENDE = '20:00'

/** Datumsteil eines `datetime-local`-Werts (`2026-08-15T18:30` → `2026-08-15`). */
export function datumTeil(wert: string): string {
  return wert.slice(0, 10)
}

/** Uhrzeitteil, oder `''` wenn keiner da ist. */
export function zeitTeil(wert: string): string {
  return wert.slice(11, 16)
}

/**
 * Setzt Datum und Uhrzeit zu einem `datetime-local`-Wert zusammen.
 *
 * **Ohne Datum ist der ganze Wert leer** — eine Uhrzeit ohne Tag ist kein
 * Termin. Ohne Uhrzeit greift die Voreinstellung, damit ein geleertes Zeitfeld
 * nicht stillschweigend Mitternacht bedeutet.
 */
export function alsTerminwert(datum: string, zeit: string, standardZeit: string): string {
  if (!datum) return ''
  return `${datum}T${zeit || standardZeit}`
}

/**
 * `tag` (`YYYY-MM-DD`) plus `n` Kalendertage. Mittags in UTC gerechnet, damit
 * keine Zeitumstellung den Tagessprung verschluckt oder verdoppelt.
 */
export function tagPlus(tag: string, n: number): string {
  const d = tag ? new Date(`${tag}T12:00:00Z`) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  // **Normalisierung ist kein gueltiges Datum.** `new Date('2026-02-30T12:00:00Z')`
  // wirft nicht, es rutscht auf den 2. Maerz — der Deckel laege dann still einen
  // Tag daneben. Wer nicht zu sich selbst zurueckkommt, war nie ein Kalendertag
  // (Fremdpruefung 06.08.2026).
  if (d.toISOString().slice(0, 10) !== tag) return ''
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Der späteste wählbare End**tag** für das mobile Formular, als `max` eines
 * Datumsfelds — oder `''` ohne brauchbaren Starttag.
 *
 * **Gezählt werden KALENDERTAGE, nicht 24-Stunden-Blöcke.** Die erste Fassung
 * rechnete die Zeitspanne, weil Migration 102 das tat — mit den
 * Voreinstellungen 07:00/20:00 sind „Starttag + 14 Tage" aber 14 Tage und
 * 13 Stunden, der Picker klemmte also einen Tag zu früh. Moritz, 06.08.2026:
 * *„14 tage + die 13 stunden sind korrekt geplant"*. Der Cron trägt das seit
 * Migration 108. **Deren Deckel steht bei 16 Tagen, nicht bei 15** — 15 reichten
 * nicht, weil die Herbstumstellung dem schlechtesten Fall eine Stunde zulegt:
 * 18.10. 00:00 bis 01.11. 23:59 sind 15 Tage 00:59, an der Datenbank gemessen
 * (Fremdprüfung 06.08.2026, `[high]`, vor dem Applizieren gefunden).
 * Die Endzeit spielt hier keine Rolle mehr.
 *
 * **Rein auf dem Datumsteil gerechnet, ohne `new Date` auf den ganzen Wert** —
 * damit entfällt die Zonenfrage, die die Zeitspannen-Fassung noch hatte. Ein
 * `datetime-local`-Wert trägt keine Zone; sein Datumsteil ist das Kalenderdatum,
 * das der Nutzer tippt.
 *
 * **Diese Funktion ist damit zeichengleich zu `spaetestesEndeDatum` des
 * Portals** (`app/zentrale/jagden/jagden.ts`), und die frühere Begründung
 * „hier Gerätezone, dort Berlin" gilt für sie nicht mehr — sie galt für die
 * Zeitspannen-Rechnung, die es nicht mehr gibt. Zwei Namen für dieselben zwei
 * Zeilen bleiben nur, weil jenes Modul nichts importieren darf (Backlog E-Z1).
 */
export function spaetesterEndtag(startWert: string): string {
  return tagPlus(datumTeil(startWert), MAX_JAGD_TAGE)
}
