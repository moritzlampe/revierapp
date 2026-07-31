/**
 * Die Regeln hinter dem Begehungsschein-Formular — ohne React, ohne Netz.
 *
 * Bewusst **ohne jeden Import**, damit die Datei mit
 * `node --experimental-strip-types` prüfbar ist (siehe `scheine.selftest.ts`).
 * Dasselbe Muster wie `schreiben.ts` und `objekte.ts`.
 *
 * **Warum die Statuslogik hier nachgebaut ist und nicht importiert.** Das
 * Gegenstück steht in quickhunt-native (`src/lib/data/licenses.ts`,
 * `effectiveStatus`) — ein anderes Repo, kein gemeinsames Paket. Beide leiten
 * dieselbe Regel aus Migration 077 ab (`current_date between valid_from and
 * valid_until`, beide Enden einschließend). Die Migration ist die Quelle, nicht
 * eine der beiden Kopien; wer sie ändert, muss beide nachziehen.
 */

/** `jes_status` aus Migration 068, plus zwei Werte, die kein Enum kennt. */
export type JesStatus =
  | 'aktiv'
  | 'pausiert'
  | 'entzogen'
  | 'abgelaufen'
  | 'nochnicht'
  | 'unbekannt'

/**
 * Alles Unbekannte wird `unbekannt`, nie `aktiv`.
 *
 * Erweitert eine spätere Migration das Enum, soll diese Ansicht den neuen Wert
 * als „kenne ich nicht" zeigen und nicht als gültigen Schein — sonst stünde ein
 * grünes Abzeichen über einem Revier, das RLS längst zugemacht hat.
 */
export function alsStatus(wert: string | null | undefined): JesStatus {
  switch (wert) {
    case 'aktiv':
    case 'pausiert':
    case 'entzogen':
    case 'abgelaufen':
      return wert
    default:
      return 'unbekannt'
  }
}

/**
 * Der Status, den der Schein HEUTE hat.
 *
 * `status` kippt nicht von selbst — es gibt keinen Job, der abgelaufene Scheine
 * umschreibt, und bewusst keinen: seit Migration 077 ist das Datum selbst die
 * Zugriffsgrenze in den Policies. Die Spalte sagt, was der Aussteller verfügt
 * hat; das Datum sagt, ob es gerade gilt.
 *
 * Eine Sperre schlägt das Datum: wer entzogen wurde, soll das lesen und nicht
 * „abgelaufen". Der Zugriff ist in beiden Fällen zu, aber nur einer der beiden
 * Texte nennt den richtigen Grund.
 *
 * ISO-Datumsstrings vergleichen sich als Text richtig, solange alle gleich lang
 * sind — `date` aus PostgREST ist immer `YYYY-MM-DD`.
 */
export function effektiverStatus(
  roh: JesStatus,
  gueltigVon: string,
  gueltigBis: string,
  heute: string,
): JesStatus {
  if (roh !== 'aktiv') return roh
  if (heute > gueltigBis) return 'abgelaufen'
  if (heute < gueltigVon) return 'nochnicht'
  return 'aktiv'
}

export const STATUS_LABEL: Record<JesStatus, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  entzogen: 'Entzogen',
  abgelaufen: 'Abgelaufen',
  nochnicht: 'Ab später',
  unbekannt: 'Unbekannt',
}

/**
 * Heute als `YYYY-MM-DD` in **UTC**.
 *
 * Nicht die lokale Zeitzone: die DB läuft auf UTC, und 077 zieht die Grenze mit
 * `current_date`. Im Berliner Sommer (UTC+2) läge das lokale Datum zwischen
 * Mitternacht und 02:00 einen Tag vor dem der DB — die Liste meldete
 * „Abgelaufen" über einem Schein, der noch zwei Stunden gilt.
 */
export function heuteUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Das Ende des laufenden Jagdjahres (31. März) als Vorbelegung.
 *
 * Ein Begehungsschein läuft üblicherweise auf das Jagdjahr, und das geht vom
 * 1. April bis zum 31. März. Nur eine Vorbelegung — das Feld bleibt frei
 * änderbar, denn Scheine über mehrere Jahre gibt es auch.
 */
export function jagdjahrEnde(heute: string): string {
  const jahr = Number(heute.slice(0, 4))
  const monat = Number(heute.slice(5, 7))
  return `${monat >= 4 ? jahr + 1 : jahr}-03-31`
}

/**
 * Welche der drei Arten ein Schein zuteilt (Begehungsschein-Konzept §5).
 *
 * Zonen schlagen Stände, wenn beides gesetzt ist — zeichengleich mit
 * `areaKindOf` in der nativen App. Das Konzept kennt die Mischung nicht, die
 * Spalten schließen sie aber nicht aus, und eine Ansicht darf nicht davon
 * abhängen, dass niemand etwas Unvorgesehenes einträgt.
 */
export function zuteilungsArt(
  zoneIds: readonly string[] | null,
  standIds: readonly string[] | null,
): 'revier' | 'zonen' | 'staende' {
  if ((zoneIds?.length ?? 0) > 0) return 'zonen'
  if ((standIds?.length ?? 0) > 0) return 'staende'
  return 'revier'
}

export type Entwurf = {
  name: string
  email: string
  von: string
  bis: string
  art: 'revier' | 'staende'
  standIds: readonly string[]
  auflagen: string
}

/**
 * Prüft den Entwurf und gibt den ERSTEN Fehlertext zurück, oder `null`.
 *
 * Die Adressprüfung ist absichtlich lose. Sie kann nicht entscheiden, was hier
 * allein zählt — ob die Adresse die **Anmelde**-Adresse des Nehmers ist. Das
 * weiß nur `meine_einladungen()` (Migration 080), und erst zum Zeitpunkt der
 * Annahme. Eine strenge Regex fängt einen Tippfehler in der Domain nicht und
 * würde nur vortäuschen, hier werde etwas garantiert. Der abgetippte Code
 * bleibt der Rückfallweg für genau diesen Fall.
 */
export function pruefeEntwurf(e: Entwurf): string | null {
  if (!e.name.trim()) return 'Der Name des Inhabers fehlt.'
  const email = e.email.trim()
  if (!email) return 'Die Anmelde-Adresse fehlt — ohne sie sieht der Nehmer die Einladung nicht.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Die Adresse sieht nicht wie eine E-Mail-Adresse aus.'
  if (!e.von || !e.bis) return 'Gültig von und bis müssen beide gesetzt sein.'
  // Beide Enden sind einschließend (077), ein Tagesschein ist also gültig.
  if (e.bis < e.von) return 'Das Ende liegt vor dem Beginn.'
  if (e.art === 'staende' && e.standIds.length === 0) return 'Kein Stand ausgewählt.'
  return null
}

/**
 * Der Entwurf als INSERT-Zeile.
 *
 * Nicht gesetzt und mit Absicht: `holder_id` (setzt erst `schein_einloesen()`),
 * `invite_code` (erzeugt die Spalten-Vorgabe), `status` (Vorgabe `aktiv`).
 *
 * **Die Adresse wird nur außen getrimmt, nicht kleingeschrieben.** Der
 * Vergleich in `meine_einladungen()` macht `lower(trim(...))` auf beiden Seiten;
 * hier zu normalisieren brächte nichts und nähme dem Revierinhaber die
 * Schreibweise, an der er die Person wiedererkennt.
 */
export function alsSpalten(e: Entwurf, revierId: string, ausstellerId: string) {
  return {
    district_id: revierId,
    issuer_id: ausstellerId,
    holder_name: e.name.trim(),
    holder_email: e.email.trim(),
    valid_from: e.von,
    valid_until: e.bis,
    zone_ids: [] as string[],
    stand_ids: e.art === 'staende' ? [...e.standIds] : [],
    auflagen: e.auflagen.trim() || null,
  }
}

/** Die Ergebnisse von `schein_einloesen()` (Migration 068), plus Auffangfall. */
export type EinloeseErgebnis =
  | 'ok'
  | 'bereits_deiner'
  | 'schon_eingeloest'
  | 'gesperrt'
  | 'abgelaufen'
  | 'unbekannt'
  | 'nicht_angemeldet'
  | 'fehler'

/**
 * **Alles Unbekannte wird `fehler`, nie `ok`** — dieselbe Richtung wie
 * `alsStatus` und wie `toRedeemOutcome` in der nativen App. Ein falsches „hat
 * geklappt" schickt den Nutzer in ein Revier, das die DB ihm gleich darauf
 * verweigert.
 */
export function alsEinloeseErgebnis(wert: string | null | undefined): EinloeseErgebnis {
  switch (wert) {
    case 'ok':
    case 'bereits_deiner':
    case 'schon_eingeloest':
    case 'gesperrt':
    case 'abgelaufen':
    case 'unbekannt':
    case 'nicht_angemeldet':
      return wert
    default:
      return 'fehler'
  }
}

export function einloeseText(ergebnis: EinloeseErgebnis, revierName: string | null): string {
  const revier = revierName ?? 'das Revier'
  switch (ergebnis) {
    case 'ok':
      return `Angenommen — ${revier} ist jetzt freigeschaltet.`
    case 'bereits_deiner':
      return `Dieser Schein gehört dir bereits (${revier}).`
    case 'schon_eingeloest':
      return 'Dieser Code wurde bereits von jemand anderem eingelöst.'
    case 'gesperrt':
      return 'Dieser Schein ist pausiert oder entzogen. Frag den Revierinhaber.'
    case 'abgelaufen':
      return 'Dieser Schein ist abgelaufen.'
    case 'unbekannt':
      return 'Diesen Code gibt es nicht. Groß- und Kleinschreibung zählt.'
    case 'nicht_angemeldet':
      return 'Dafür musst du angemeldet sein.'
    case 'fehler':
      return 'Das hat nicht geklappt. Prüf die Verbindung und versuch es erneut.'
  }
}
