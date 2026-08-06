/**
 * Jagden — reine Logik, ohne React und ohne Supabase.
 *
 * Portal-Phase 4a (`QuickHunt_Konzept_Revierzentrale_V1.md` §5). Der Bereich
 * bereitet Jagden VOR; der Jagdtag selbst läuft nativ. Aktive Jagden sind hier
 * ausdrücklich read-only (§3) — "ein offener Browser darf keine laufende
 * Feldsituation umschreiben".
 */

/**
 * **Bewusste Kopie von `MAX_JAGD_TAGE` aus `src/lib/hunt/status.ts`.**
 *
 * Der erste Anlauf importierte sie von dort, und das war falsch: **dieses
 * Modul hat keine Importe, und das ist tragend, nicht Stil.** Der Selbsttest
 * daneben läuft per Hand unter blankem `node --experimental-strip-types`, und
 * das kann den `@/`-Alias nicht auflösen — der Import brach ihn sofort mit
 * `ERR_MODULE_NOT_FOUND`. Eine Zahl zu entdoppeln ist die Lauffähigkeit der
 * Zusicherungen nicht wert.
 *
 * **Die Zahl ist gemessen, nicht geraten** (Moritz, 04.08.2026): 95 % der
 * Jagden sind eintägig, 4 % gehen bis zu einer Woche, 1 % bis zu zwei.
 *
 * Wer sie ändert, ändert VIER Stellen: hier, `src/lib/hunt/status.ts`
 * (mobiles PWA-Formular), Migration 102 (der Cron, zwei Deckel) und
 * `create.tsx` der nativen App.
 */
const MAX_JAGD_TAGE = 14

/** `hunt_type` — vier Werte, in den Daten bisher nur zwei (Konzept §4.3). */
export const JAGDARTEN = ['ansitz', 'pirsch', 'drueckjagd', 'erntejagd'] as const
export type Jagdart = (typeof JAGDARTEN)[number]

/** `hunt_status`. `draft` schreibt nativ niemand — die App kennt nur
 *  `scheduled` und `active` (draft.ts). Der Wert steht trotzdem hier, weil die
 *  DB ihn führt und eine Zeile aus einem anderen Weg ihn tragen könnte. */
export const JAGDSTATUS = [
  'draft',
  'scheduled',
  'active',
  'paused',
  'completed',
  'auto_completed',
] as const
export type Jagdstatus = (typeof JAGDSTATUS)[number]

export interface Jagd {
  id: string
  name: string | null
  type: Jagdart | null
  status: Jagdstatus | null
  scheduled_for: string | null
  /**
   * Geplantes Ende (Migration 095). `null` heißt „kein Ende angegeben".
   *
   * Seit Migration 107 füllt der Trigger `trg_hunts_endtermin` das Ende des
   * Berliner Jagdtags nach — **aber nur, wenn die Zeile auch ein
   * `scheduled_for` trägt.** Eine geplante Jagd OHNE Termin behält `null`;
   * hier stand „kommt nicht mehr vor", und das war zu weit gegriffen
   * (Fremdprüfung 06.08.2026). Folgenlos bleibt sie trotzdem: die
   * Cron-Ausnahme aus 102 verlangt beide Spalten, und der Cron selbst rührt
   * `scheduled` gar nicht erst an.
   * Bei laufenden und beendeten Altzeilen steht weiterhin `null`.
   */
  scheduled_until: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string | null
}

/** Eine Teilnehmerzeile, so weit die Liste sie braucht. */
export interface Teilnahme {
  hunt_id: string
  status: string | null
  user_id: string | null
  guest_name: string | null
  /** Wann zugesagt wurde. 48 von 88 Zeilen tragen es (03.08.2026). */
  joined_at: string | null
  /** Wann abgesagt oder verlassen wurde. */
  left_at: string | null
}

export interface Zusagen {
  zugesagt: number
  offen: number
  abgesagt: number
}

export const KEINE_ZUSAGEN: Zusagen = { zugesagt: 0, offen: 0, abgesagt: 0 }

/** Eine Zeile im Aufklapper hinter der Zusagen-Zahl. */
export interface Antwort {
  name: string
  /** Wann geantwortet wurde — `null`, wenn die Zeile keinen Zeitpunkt trägt. */
  datum: string | null
}

export interface Antworten {
  zugesagt: Antwort[]
  offen: Antwort[]
  abgesagt: Antwort[]
}

export const KEINE_ANTWORTEN: Antworten = { zugesagt: [], offen: [], abgesagt: [] }

// ---------------------------------------------------------------------------
// Beschriftungen
// ---------------------------------------------------------------------------

const ART_LABEL: Record<Jagdart, string> = {
  ansitz: 'Ansitz',
  pirsch: 'Pirsch',
  drueckjagd: 'Drückjagd',
  erntejagd: 'Erntejagd',
}

export function jagdart(type: string | null): string {
  return ART_LABEL[type as Jagdart] ?? 'Unbekannt'
}

/**
 * `auto_completed` und `completed` heißen beide "Beendet".
 *
 * Der Unterschied ist eine Betriebsinnerei — hat der Leiter beendet oder eine
 * Zeitgrenze? — und für den, der die Liste liest, keine Auskunft. Nativ steht
 * an derselben Stelle dieselbe Zusammenfassung (`isHuntEnded`).
 */
const STATUS_LABEL: Record<Jagdstatus, string> = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  active: 'Läuft',
  paused: 'Pause',
  completed: 'Beendet',
  auto_completed: 'Beendet',
}

export function jagdstatus(status: string | null): string {
  return STATUS_LABEL[status as Jagdstatus] ?? 'Unbekannt'
}

/** Läuft gerade — dann ist die Jagd im Portal read-only (Konzept §3). */
export function laeuft(status: string | null): boolean {
  return status === 'active' || status === 'paused'
}

export function beendet(status: string | null): boolean {
  return status === 'completed' || status === 'auto_completed'
}

/**
 * Vorbereitbar — **die Liste, nicht die doppelte Verneinung.**
 *
 * Vorher stand hier `!laeuft(status) && !beendet(status)`. Das ist dasselbe für
 * alle sechs bekannten Werte, aber nicht für `null` und nicht für einen
 * siebten, der später dazukäme: die Verneinung sagte zu beidem „ja, ändere
 * ruhig". Und weil der Statusfilter im UPDATE aus einer *Aufzählung* bestehen
 * muss (`.in(...)` kennt kein „alles außer"), liefen die zwei Fassungen an
 * genau dieser Stelle auseinander — die Schlusslesung vom 03.08.2026 hat es
 * gefunden. Jetzt gibt es eine Wahrheit, und der Filter kommt aus ihr.
 *
 * Ein unbekannter Status heißt damit „nicht anfassen". Das ist die richtige
 * Richtung: wer nicht weiß, in welchem Zustand eine Jagd ist, soll nicht in
 * sie hineinschreiben.
 */
export const VORBEREITBARE_STATUS = ['draft', 'scheduled'] as const

export function vorbereitbar(status: string | null): boolean {
  return VORBEREITBARE_STATUS.includes(status as (typeof VORBEREITBARE_STATUS)[number])
}

// ---------------------------------------------------------------------------
// Termin
// ---------------------------------------------------------------------------

/**
 * Wann die Jagd war oder sein wird — in dieser Reihenfolge.
 *
 * **`scheduled_for` steht bewusst vorn, obwohl es seltener gefüllt ist.**
 * Gemessen am 03.08.2026 über Brockwinel: 4 von 18 Jagden tragen einen Termin,
 * die übrigen haben nur `started_at`. Der Grund ist der native Anlege-Flow —
 * "Sofort starten" schreibt `scheduled_for = null` und startet. Wer die Spalte
 * ignoriert und nur `started_at` läse, verlöre die einzige geplante Jagd im
 * Bestand aus der Sortierung, also genau die, die vorbereitet werden soll.
 */
export function termin(jagd: Jagd): string | null {
  return jagd.scheduled_for ?? jagd.started_at ?? jagd.created_at
}

/**
 * Termin als deutscher Text.
 *
 * **`timeZone` ist gesetzt, und das ist keine Kosmetik.** Die Seite rendert auf
 * dem Server (UTC) und im Browser (Berlin); ohne feste Zone liefern beide
 * verschiedene Zeichen, und React meldet einen Hydration-Mismatch. Dieselbe
 * Falle wie bei `erlegt_am` in Migration 087, nur eine Ebene höher.
 *
 * Ohne Uhrzeit, wenn keine gesetzt ist — eine Jagd "am 15.04.2027 um 00:00"
 * behauptet eine Genauigkeit, die in der Zeile nicht steht.
 */
export function terminText(wert: string | null, mitUhrzeit = true): string {
  if (!wert) return '—'
  const d = new Date(wert)
  if (Number.isNaN(d.getTime())) return '—'
  const datum = d.toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  if (!mitUhrzeit) return datum
  const zeit = d.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  })
  return zeit === '00:00' ? datum : `${datum}, ${zeit}`
}

/**
 * Der Vertrag aus Migration 095: mehrtägig heißt **verschiedene Berliner
 * Kalenderdaten**, nicht schlicht `bis > von`.
 *
 * Der naive Vergleich war der erste Entwurf von 095 und ist von der
 * Fremdprüfung zerlegt worden: beide Spalten sind Zeitpunkte, also erfüllt ihn
 * auch eine Jagd von 08:00 bis 16:00 am selben Tag. Berlin und nicht UTC, weil
 * die Datenbank auf UTC läuft — eine Jagd, die um 23:00 Berliner Zeit endet,
 * liegt in UTC schon am Folgetag.
 *
 * **`alsEingabewert` IST bereits das Berliner Kalenderdatum dieses Moduls**
 * (`sv-SE` + `timeZone: 'Europe/Berlin'`), deshalb wird es hier
 * wiederverwendet statt ein drittes `formatToParts` daneben zu stellen.
 *
 * **Beide Werte werden auf Leere geprüft, und die erste Fassung tat das
 * nicht.** Sie prüfte nur auf `null` und verließ sich darauf, dass ein
 * ungültiger Wert `''` ergibt und `'' > ''` falsch ist. Das stimmt aber nur,
 * wenn BEIDE kaputt sind: `mehrtaegig('kein datum', '2026-11-15T15:00:00Z')`
 * rechnete `'2026-11-15' > ''` und lieferte **`true`** — eine Zeile mit
 * unlesbarem Start galt als mehrtägig. Der Kommentar daneben behauptete das
 * Gegenteil. Fremdprüfung 06.08.2026, nachgemessen statt geglaubt.
 */
export function mehrtaegig(von: string | null, bis: string | null): boolean {
  const tagVon = alsEingabewert(von).slice(0, 10)
  const tagBis = alsEingabewert(bis).slice(0, 10)
  if (!tagVon || !tagBis) return false
  return tagBis > tagVon
}

/**
 * Der Termin als Text — bei einer mehrtägigen Jagd als Zeitraum.
 *
 * „15.08.2026, 07:00 – 17.08.2026". **Die Uhrzeit des Endes fehlt bewusst:**
 * für die ANZEIGE ist `scheduled_until` der letzte Tag eines Termins. Sie
 * auszugeben („07:00 – 23:59") behauptete eine Tagesplanung, die es nicht gibt
 * — die Uhr am Jagdtag wäre `hunts.end_time` (Migration 003), und die liest
 * bis heute niemand. **Dieselbe REGEL wie `formatHuntPeriod` der App, nicht
 * dieselbe Zeichenfolge** — dort entsteht „28. Nov., 08:00 Uhr – 29. Nov.",
 * hier „14.11.2026, 08:00 – 16.11.2026". Hier stand „zeichengleich", und das
 * ist in diesem Projekt das Wort für das Zweite (Schlusslesung 06.08.2026).
 * **Der gespeicherte Wert IST trotzdem ein genauer Zeitpunkt** und steuert als
 * solcher die Schonfrist des Crons aus 102 — hier stand „ist der letzte Tag",
 * und das war über die Anzeige hinaus zu viel behauptet (Fremdprüfung
 * 06.08.2026).
 *
 * **Die Mehrtägigkeit wird an `scheduled_for` entschieden, NICHT an
 * `termin()`.** Dessen Rückfall auf `started_at`/`created_at` ist der
 * tatsächliche Beginn bzw. die Anlagezeit; mit einem geplanten Ende kombiniert
 * ergäbe das einen Zeitraum, den nie jemand geplant hat. 095 definiert
 * mehrtägig ausschließlich aus `scheduled_for` und `scheduled_until`.
 * Unabhängig von zwei Prüfläufen gefunden (06.08.2026).
 */
export function zeitraumText(jagd: Jagd): string {
  const angezeigt = terminText(termin(jagd))
  if (!mehrtaegig(jagd.scheduled_for, jagd.scheduled_until)) return angezeigt
  return `${angezeigt} – ${terminText(jagd.scheduled_until, false)}`
}

/**
 * Sortierschlüssel. Offene und geplante zuerst (aufsteigend: das Nächste
 * oben), beendete danach (absteigend: das Letzte oben).
 *
 * Der Schreibtisch fragt "was ist als Nächstes vorzubereiten" (§1.3), nicht
 * "was war zuletzt". Eine rein chronologische Liste hätte die 17 beendeten
 * Jagden über die eine geplante gelegt.
 */
export function sortiere(jagden: readonly Jagd[]): Jagd[] {
  const zeit = (j: Jagd) => {
    const t = termin(j)
    return t ? new Date(t).getTime() : 0
  }
  const offen = jagden.filter((j) => !beendet(j.status)).sort((a, b) => zeit(a) - zeit(b))
  const alt = jagden.filter((j) => beendet(j.status)).sort((a, b) => zeit(b) - zeit(a))
  return [...offen, ...alt]
}

// ---------------------------------------------------------------------------
// Zusagen
// ---------------------------------------------------------------------------

/**
 * Zählt die Teilnahmen je Jagd.
 *
 * `declined` gibt es erst mit Migration 088 — bis dahin löschte eine Absage
 * die Zeile, und `abgesagt` bleibt hier schlicht 0. Der Zweig steht trotzdem
 * schon da: sobald 088 appliziert ist, zählt er ohne weitere Änderung.
 *
 * `left` zählt NICHT als Absage. Wer erst zusagt und dann geht, hat etwas
 * anderes getan als wer nie zusagt — die Liste würde beides vermischen. Im
 * Bestand steht ohnehin keine einzige Zeile auf `left`.
 */
export function zusagen(teilnahmen: readonly Teilnahme[]): Map<string, Zusagen> {
  const map = new Map<string, Zusagen>()
  // Aus denselben Listen gezählt, die der Aufklapper zeigt. Zwei getrennte
  // Zählungen wären zwei Wahrheiten, die beim nächsten Statuswert auseinander-
  // laufen — die Zahl in der Tabelle muss dieselbe sein wie die Anzahl der
  // Namen dahinter.
  for (const [huntId, a] of antworten(teilnahmen, {})) {
    map.set(huntId, {
      zugesagt: a.zugesagt.length,
      offen: a.offen.length,
      abgesagt: a.abgesagt.length,
    })
  }
  return map
}

/**
 * Wer je Jagd zugesagt, noch nicht geantwortet oder abgesagt hat — mit Namen
 * und Zeitpunkt, für den Aufklapper hinter der Zahl.
 *
 * **`left` fehlt hier wie in `zusagen()`**: wer erst zusagt und dann geht, hat
 * etwas anderes getan als wer absagt. Die Zeile taucht damit in keiner der drei
 * Listen auf — sichtbar wird sie im Detail der Jagd, wo alle vier Zustände
 * stehen.
 *
 * Sortiert wird nach Zeitpunkt (früheste Antwort zuerst), Namenlose ans Ende;
 * bei den Offenen gibt es keinen Zeitpunkt, dort entscheidet der Name.
 */
export function antworten(
  teilnahmen: readonly Teilnahme[],
  namen: Record<string, string>,
): Map<string, Antworten> {
  const map = new Map<string, Antworten>()

  for (const t of teilnahmen) {
    const a = map.get(t.hunt_id) ?? { zugesagt: [], offen: [], abgesagt: [] }
    const name = teilnehmerName(t, namen)
    if (t.status === 'joined') a.zugesagt.push({ name, datum: t.joined_at })
    else if (t.status === 'invited') a.offen.push({ name, datum: null })
    else if (t.status === 'declined') a.abgesagt.push({ name, datum: t.left_at })
    map.set(t.hunt_id, a)
  }

  const sortiere = (liste: Antwort[]) =>
    liste.sort((x, y) => {
      if (x.datum && y.datum) return new Date(x.datum).getTime() - new Date(y.datum).getTime()
      if (x.datum) return -1
      if (y.datum) return 1
      return x.name.localeCompare(y.name, 'de')
    })

  for (const a of map.values()) {
    sortiere(a.zugesagt)
    sortiere(a.offen)
    sortiere(a.abgesagt)
  }
  return map
}

// ---------------------------------------------------------------------------
// Jagdjahr
// ---------------------------------------------------------------------------

/**
 * Das Jagdjahr läuft vom 1. April bis zum 31. März — deutsche Konvention,
 * daran hängen Schonzeiten und Hegering-Statistiken.
 *
 * **Die Regel steht hier nachgebaut, nicht importiert.** Die App hat sie in
 * `src/lib/tagebuch/season.ts`, aber das ist ein anderes Repo; ein gemeinsames
 * Paket gibt es nicht. Wer eine der beiden ändert, muss an die andere denken —
 * die Grenze ist bewusst die einzige Zahl in dieser Datei, damit das auffällt.
 *
 * Der Schlüssel ist das Startjahr als Zeichenkette: `'2026'` heißt 2026/27.
 * Gerechnet wird in **Berliner** Zeit, wie überall hier: eine Jagd am 1. April
 * um 00:30 gehört ins neue Jagdjahr, und `toISOString()` würde sie auf den
 * 31. März zurückwerfen.
 */
const JAGDJAHR_BEGINN_MONAT = 4

export function jagdjahrVon(wert: string | null): string | null {
  const lokal = alsEingabewert(wert)
  if (!lokal) return null
  const jahr = Number(lokal.slice(0, 4))
  const monat = Number(lokal.slice(5, 7))
  return String(monat >= JAGDJAHR_BEGINN_MONAT ? jahr : jahr - 1)
}

/** `'2026'` → `'26/27'`. Kompakt, weil es in einem Auswahlfeld steht. */
export function jagdjahrLabel(key: string): string {
  const start = Number(key)
  if (!Number.isFinite(start)) return key
  return `${String(start % 100).padStart(2, '0')}/${String((start + 1) % 100).padStart(2, '0')}`
}

/**
 * Wie viele Jahre im Menü stehen, auch ohne eine einzige Jagd darin.
 *
 * **Die Zahl kommt von Moritz (04.08.2026): „ich denke dass wir noch alte
 * Statistiken einlesen werden, die gehen dann ca. 30 Jahre zurück."** Sie ist
 * damit keine Schätzung, sondern die Reichweite des Bestands, der noch kommt.
 *
 * **Es sind 30 EINTRÄGE, nicht 30 Jahre Abstand** — das aktuelle mitgezählt,
 * also 2026 bis 1997 und nicht bis 1996. Bei einem „ca." ist der Unterschied
 * belanglos; er steht hier, weil er beim Lesen der Zusicherungen sonst jedes
 * Mal neu ausgerechnet werden muss (Fremdprüfung Codex, 04.08.2026, Punkt 1).
 */
const JAHRE_ZURUECK = 30

/**
 * Die wählbaren Jagdjahre — die letzten {@link JAHRE_ZURUECK} ab heute, plus
 * jedes im Bestand vorkommende, absteigend, das neueste zuerst.
 *
 * **Ein leeres Jahr steht im Menü und sagt es in der Liste** (`liste.tsx`).
 * Ein Klick ohne Treffer ist der Preis dafür, dass die Achse vollständig ist.
 *
 * **Die vorkommenden Jahre bleiben zusätzlich drin, nicht ersatzweise** — eine
 * importierte Jagd von vor 40 Jahren fiele sonst aus ihrer eigenen Liste, und
 * `alsJahr()` schickte einen Link darauf auf „Alle". Der Zeitraum ist eine
 * **Mindestreichweite**, keine Grenze.
 *
 * **Lückenlos ist die Liste nur INNERHALB des Zeitraums** — außerhalb, in beide
 * Richtungen, stehen nur Jahre mit Jagden. Eine Jagd im Jagdjahr 2030 ergibt
 * heute `2030, 2026, 2025, …` mit einem Loch bei 2027–2029, und ein Link auf
 * `?jahr=2028` fällt auf „Alle". Erreichbar ist das, weil `datetime-local` im
 * Anlege-Formular beliebig weit voraus zulässt. Hier stand „oberhalb ist sie
 * lückenlos", was schlicht falsch war (Schlusslesung Fable 5, 04.08.2026).
 *
 * **Das aktuelle Jahr kommt immer mit, und das ist keine Bequemlichkeit, sondern
 * die Bedingung für die Voreinstellung** (Moritz, 04.08.2026: „ja immer das
 * aktuelle Jahr vorauswählen"). `alsJahr()` wählt es ohne Angabe vor; stünde es
 * dann nicht in dieser Liste, hätte das `<select>` einen `value` ohne passende
 * `<option>` — es zeigte das erste Jahr an und filterte nach einem anderen. Genau
 * die Lüge, gegen die die Schranke in `alsJahr()` geschrieben wurde, nur von der
 * anderen Seite. Es ist der erste Eintrag des Zeitraums (`i = 0`) und braucht
 * deshalb keine eigene Zeile — **außer bei unbrauchbarem `heute`, wo es
 * absichtlich gar kein Jahr gibt** (s. den Riegel im Rumpf).
 *
 * **Damit ist die Funktion zeitabhängig.** Jede Zusicherung darauf muss `heute`
 * einspeisen, sonst gilt sie nur an dem Tag, an dem man sie schreibt.
 */
export function jagdjahre(jagden: readonly Jagd[], heute?: string): string[] {
  const gesehen = new Set<string>()
  // **`ALLE_JAHRE` darf hier nicht hinein, und das ist der Grund für den Riegel.**
  // `aktuellesJagdjahr()` liefert bei unbrauchbarer Eingabe `'alle'` — die
  // Abwesenheit eines Filters, kein Jahr. In dieser Liste stünde es als zweite
  // `<option>` neben dem festen „Alle" (`liste.tsx`), und `Number('alle')` ist
  // `NaN` in genau dem Vergleich, der die Sortierung trägt: die ganze Reihenfolge
  // würde unbestimmt. Ein früherer Entwurf legte den Wert ausdrücklich ab und
  // fing nur die Zeitraum-Rechnung ab — die Fremdprüfung hat das gefunden
  // (Codex, 04.08.2026, Punkt 2).
  const start = Number(aktuellesJagdjahr(heute))
  if (Number.isFinite(start)) {
    for (let i = 0; i < JAHRE_ZURUECK; i++) gesehen.add(String(start - i))
  }
  for (const j of jagden) {
    const k = jagdjahrVon(termin(j))
    if (k) gesehen.add(k)
  }
  return [...gesehen].sort((a, b) => Number(b) - Number(a))
}

/** `ALLE_JAHRE` ist kein Jagdjahr, sondern die Abwesenheit des Filters. */
export const ALLE_JAHRE = 'alle'

/**
 * Das Jagdjahr, in dem wir gerade stehen — nach derselben Regel wie jede Jagd.
 *
 * **Geht durch `jagdjahrVon()`, statt die Aprilgrenze ein zweites Mal zu
 * schreiben.** Damit kommt auch die Zeitzone von dort: `alsEingabewert()`
 * formatiert auf `Europe/Berlin`, und die Grenze liegt am 1. April. Auf UTC
 * gerechnet läge sie zwei Stunden falsch — für zwei Stunden im Jahr, in denen
 * das Portal das falsche Jagdjahr vorwählen würde. Dieselbe Wurzel wie der
 * Gültigkeitsvergleich in Migration 087.
 *
 * `heute` ist einspeisbar, weil die Funktion sonst nicht prüfbar wäre: eine
 * Zusicherung gegen `new Date()` gilt nur an dem Tag, an dem man sie schreibt.
 */
export function aktuellesJagdjahr(heute: string = new Date().toISOString()): string {
  return jagdjahrVon(heute) ?? ALLE_JAHRE
}

/**
 * Prüft einen Jahreswert aus der Adresse gegen den Bestand — Gegenstück zu
 * `alsFilter()`.
 *
 * **Ohne Angabe steht das AKTUELLE Jagdjahr da, immer** (Moritz, 04.08.2026:
 * „voreingestellt bitte immer auf das aktuelle Jagdjahr" und auf Rückfrage „ja
 * immer das aktuelle Jahr vorauswählen"). Die Liste beantwortet damit beim Öffnen
 * die Frage, die man beim Öffnen hat — „was ist diese Saison?" —, statt Jahre zu
 * mischen. Auf Brockwinel sind das 18 statt 19 Jagden; die eine für April 2027
 * gehört ins nächste Jagdjahr.
 *
 * **„immer" heißt wörtlich immer, auch wenn in der Saison nichts liegt.** Ein
 * erster Entwurf fiel in diesem Fall auf „Alle" zurück, um eine leere Liste zu
 * vermeiden; Moritz hat das ausdrücklich verworfen. Die leere Liste ist hier
 * keine Sackgasse, weil das Auswahlfeld daneben den Grund nennt — es zeigt „26/27",
 * und „Alle" ist einen Klick entfernt. Voraussetzung dafür ist, dass
 * `jagdjahre()` das aktuelle Jahr immer mitführt; sonst zeigte das Feld einen
 * anderen Wert als den, nach dem gefiltert wird.
 *
 * **Ohne Angabe und mit unbekannter Angabe sind jetzt verschiedene Fälle, und das
 * ist Absicht.** Ohne Angabe → aktuelles Jahr. Unbekanntes Jahr → „Alle", nicht
 * das aktuelle: **ohne diese Schranke wird ein unbekanntes Jahr zu einer Lüge**,
 * es filtert alles heraus, und weil kein `<option>` dazu passt, zeigt das
 * Auswahlfeld etwas anderes an als es filtert. Das trifft nicht nur getippte
 * Adressen — ein gemerkter Link auf `?jahr=2025` verhält sich genauso, sobald aus
 * diesem Jagdjahr die letzte Jagd verschwunden ist. Ihn auf das aktuelle Jahr zu
 * schicken wäre schlimmer als auf „Alle": der Nutzer wollte ausdrücklich ein
 * anderes.
 */
export function alsJahr(
  wert: string | undefined,
  jagden: readonly Jagd[],
  heute?: string,
): string {
  // `jagdjahre()` führt das aktuelle Jahr immer mit — der Rückfall unten kann es
  // also nie treffen, und das ist der Punkt.
  const vorhanden = jagdjahre(jagden, heute)
  if (!wert) return aktuellesJagdjahr(heute)
  if (wert === ALLE_JAHRE) return ALLE_JAHRE
  return vorhanden.includes(wert) ? wert : ALLE_JAHRE
}

export function nachJagdjahr(jagden: readonly Jagd[], key: string): Jagd[] {
  if (key === ALLE_JAHRE) return [...jagden]
  return jagden.filter((j) => jagdjahrVon(termin(j)) === key)
}

// ---------------------------------------------------------------------------
// Filter — Zustand gehört in die URL (Konzept §2.4)
// ---------------------------------------------------------------------------

export const FILTER = ['alle', 'offen', 'geplant', 'beendet'] as const
export type Filter = (typeof FILTER)[number]

export function alsFilter(wert: string | undefined): Filter {
  return FILTER.includes(wert as Filter) ? (wert as Filter) : 'alle'
}

export function filtere(jagden: readonly Jagd[], filter: Filter): Jagd[] {
  switch (filter) {
    case 'offen':
      return jagden.filter((j) => !beendet(j.status))
    case 'geplant':
      return jagden.filter((j) => j.status === 'scheduled' || j.status === 'draft')
    case 'beendet':
      return jagden.filter((j) => beendet(j.status))
    default:
      return [...jagden]
  }
}

/**
 * Next liefert jeden Suchparameter als `string[]`, sobald er mehrfach in der
 * Adresse steht. Gleiche Begründung wie in `gaeste/kontakte.ts`.
 */
export function ersterWert(wert: string | string[] | undefined): string | undefined {
  return Array.isArray(wert) ? wert[0] : wert
}

// ---------------------------------------------------------------------------
// Teilnehmer
// ---------------------------------------------------------------------------

/** `participant_role`. */
export const ROLLEN = ['jagdleiter', 'schuetze', 'treiber'] as const
export type Rolle = (typeof ROLLEN)[number]

/**
 * Was das Portal setzen darf — `jagdleiter` fehlt hier mit Absicht.
 *
 * Die Rolle wirkt an drei Stellen: Strecken-Masking (`fetchViewerContext`),
 * DB-Schreibrechte (`get_my_joined_hunt_ids_as_leader()`, seit 089 auch auf
 * Treiben und Ständen) und die Leiter-Knöpfe der App (`istJagdleiter`). Bis zum
 * 03.08.2026 wirkte sie an zweien **unsichtbar**, weil der Client nur
 * `creator_id` las. Jetzt wirkt sie überall — und genau deshalb ist
 * „Leiter übertragen" ein Feature mit eigener Rückfrage und nicht ein Eintrag
 * in einem Auswahlfeld, den man im Vorbeigehen erwischt.
 */
export const SETZBARE_ROLLEN = ['schuetze', 'treiber'] as const
export type SetzbareRolle = (typeof SETZBARE_ROLLEN)[number]

const ROLLE_LABEL: Record<Rolle, string> = {
  jagdleiter: 'Jagdleiter',
  schuetze: 'Schütze',
  treiber: 'Treiber',
}

export function rolle(wert: string | null): string {
  return ROLLE_LABEL[wert as Rolle] ?? 'Unbekannt'
}

/** `participant_tag` — zwei Werte, additiv zur Rolle. */
export const TAGS = ['gruppenleiter', 'hundefuehrer'] as const
export type Tag = (typeof TAGS)[number]

const TAG_LABEL: Record<Tag, string> = {
  gruppenleiter: 'Gruppenleiter',
  hundefuehrer: 'Hundeführer',
}

export function tag(wert: string): string {
  return TAG_LABEL[wert as Tag] ?? wert
}

/**
 * Der Zustand einer Teilnahme.
 *
 * `declined` gibt es seit Migration 088 — davor löschte eine Absage die Zeile,
 * und der Jagdleiter sah keine Absage, sondern eine Person weniger. Genau
 * dieser Unterschied ist der Grund, warum die Übersicht hier steht.
 */
const TEILNAHME_LABEL: Record<string, string> = {
  invited: 'Eingeladen',
  joined: 'Zugesagt',
  declined: 'Abgesagt',
  left: 'Ausgetreten',
}

export function teilnahme(wert: string | null): string {
  return TEILNAHME_LABEL[wert ?? ''] ?? 'Unbekannt'
}

export interface Teilnehmer {
  id: string
  user_id: string | null
  guest_name: string | null
  role: string | null
  tags: string[] | null
  status: string | null
}

/**
 * Wer wieder eingeladen werden kann.
 *
 * `left` steht bewusst NICHT darin: wer eine Jagd verlassen hat, ist etwas
 * anderes als wer abgesagt hat, und der Weg zurück gehört in die App, wo die
 * Person gerade steht. Was hier passiert, ist eine erneute Einladung an jemanden,
 * der noch gar nicht dabei war.
 */
export function wiederEinladbar(status: string | null): boolean {
  return status === 'declined'
}

/**
 * Sortierung der Teilnehmerliste: Leiter oben, dann nach Zustand, dann nach
 * Name. Wer abgesagt hat, steht unten — er ist die Auskunft „hier fehlt
 * jemand", nicht der erste Blick.
 */
const ZUSTAND_RANG: Record<string, number> = { joined: 0, invited: 1, declined: 2, left: 3 }

export function sortiereTeilnehmer(
  liste: readonly Teilnehmer[],
  namen: Record<string, string>,
): Teilnehmer[] {
  return [...liste].sort((a, b) => {
    const leiter = (t: Teilnehmer) => (t.role === 'jagdleiter' ? 0 : 1)
    if (leiter(a) !== leiter(b)) return leiter(a) - leiter(b)
    const rang = (t: Teilnehmer) => ZUSTAND_RANG[t.status ?? ''] ?? 9
    if (rang(a) !== rang(b)) return rang(a) - rang(b)
    return teilnehmerName(a, namen).localeCompare(teilnehmerName(b, namen), 'de')
  })
}

export interface Teilnehmergruppe {
  status: string
  titel: string
  eintraege: Teilnehmer[]
}

/**
 * Dieselbe Liste, aber in Zustandsgruppen zerlegt: Zugesagt, Eingeladen,
 * Abgesagt, Ausgetreten.
 *
 * **Der Grund ist ein Bedienfehler, nicht Schmuck** (Codex, 03.08.2026):
 * `sortiereTeilnehmer` stellt die Rolle VOR den Zustand, ein abgesagter
 * Jagdleiter stand also über allen zugesagten Schützen. Weil die kleine Pille
 * in der Spalte „Stand" die einzige Zustandsanzeige ist, las sich die oberste
 * Zeile wie „verfügbar". Hier schlägt der Zustand die Rolle; der Leiter steht
 * oben INNERHALB seiner Gruppe — dafür sortiert `sortiereTeilnehmer` weiter,
 * das innerhalb einer Gruppe auf „Leiter, dann Name" zusammenfällt.
 *
 * **Leere Gruppen fallen weg, und das trägt die Skalierung:** eine Jagd mit
 * zwei Zugesagten bekommt eine einzige Gruppe, die Oberfläche zeigt dann gar
 * keine Zwischenzeile (`detail.tsx`). Erst ab zwei Zuständen entsteht eine
 * Gliederung. Die größte Jagd im Bestand hat heute 4 Teilnehmer, im Oktober
 * sollen es 40 sein — beide Größen müssen ohne Umbau tragen.
 *
 * **`declined` und `left` bleiben getrennt.** Nur Abgesagte sind wieder
 * einladbar (`wiederEinladbar`); eine gemeinsame Gruppe „nicht dabei" würde
 * genau diesen Unterschied verwischen.
 */
export function gruppiereTeilnehmer(
  liste: readonly Teilnehmer[],
  namen: Record<string, string>,
): Teilnehmergruppe[] {
  // **Von Hand statt `Map.groupBy`, und das ist eine Rücknahme.** Die
  // Kurzform stand hier schon; die Fremdprüfung hat sie zerlegt: `Map.groupBy`
  // gibt es erst ab Safari 17.4, Next polyfillt es nicht, und der Fehler wäre
  // keine schiefe Sortierung, sondern eine weiße Seite auf jedem älteren Mac.
  // `tsc` sagt dazu nichts, weil `lib` auf `esnext` steht — die Typen sind da,
  // die Laufzeit nicht.
  const koepfe = new Map<string, Teilnehmer[]>()
  for (const t of liste) {
    const s = t.status ?? ''
    const vorhanden = koepfe.get(s)
    if (vorhanden) vorhanden.push(t)
    else koepfe.set(s, [t])
  }
  return [...koepfe.entries()]
    .sort((a, b) => (ZUSTAND_RANG[a[0]] ?? 9) - (ZUSTAND_RANG[b[0]] ?? 9))
    .map(([status, eintraege]) => ({
      status,
      titel: teilnahme(status),
      eintraege: sortiereTeilnehmer(eintraege, namen),
    }))
}

/**
 * Der Anzeigename.
 *
 * `hunt_participants` trägt entweder `user_id` oder `guest_name`
 * (CHECK-Constraint) — Gäste ohne Konto gibt es also im Schema bereits, auch
 * wenn heute keiner darin steht. Der Fallback auf die halbe UUID ist kein
 * Design, sondern eine Notbremse: ein Profil, das RLS nicht durchlässt, soll
 * eine unterscheidbare Zeile ergeben statt einer leeren.
 */
export function teilnehmerName(
  // Nur die zwei Felder, aus denen der Name entsteht — damit dieselbe Funktion
  // die Detailzeile (`Teilnehmer`) und die Listenzeile (`Teilnahme`) bedient,
  // ohne dass eine von beiden Felder mitschleppen muss, die sie nicht lädt.
  t: { user_id: string | null; guest_name: string | null },
  namen: Record<string, string>,
): string {
  if (t.guest_name) return t.guest_name
  if (!t.user_id) return 'Unbekannt'
  return namen[t.user_id] || `Konto ${t.user_id.slice(0, 8)}`
}

// ---------------------------------------------------------------------------
// Anlegen und Bearbeiten
// ---------------------------------------------------------------------------

export interface JagdEntwurf {
  name: string
  /** Wert eines `<input type="datetime-local">`, also `2026-08-15T18:30`. */
  termin: string
  /**
   * Geplantes Ende, gleiches Format. **Leer ist der Normalfall und kein
   * Mangel:** wer nichts wählt, bekommt von Migration 107 das Ende seines
   * Berliner Jagdtags. Das Formular baut die Voreinstellung deshalb NICHT
   * nach — sie steht einmal, in der Datenbank.
   *
   * Folge, die beim Bearbeiten sichtbar wird: nach dem ersten Speichern ist
   * das Feld gefüllt (mit 23:59 des Jagdtags), denn die Spalte trägt jetzt
   * einen Wert. „Kein Ende gewählt" und „Ende = Tagesende" sind ab da nicht
   * mehr zu unterscheiden — dieselbe Lage wie bei nativ angelegten Jagden
   * seit dem 04.08.2026.
   */
  bis: string
  type: Jagdart
}

/**
 * Wann eine Jagd beginnt und endet, wenn niemand die Uhrzeit anfasst.
 *
 * **Moritz, 06.08.2026:** *„eine jagd geht immer morgens um 7 los und endet den
 * ausgewählten tag um 20 uhr. zeit dann änderbar, aber das wäre der
 * voreingestellte standart"*.
 *
 * **Das Ende um 20:00 verkürzt die Schonfrist des Crons aus 102 gegenüber dem
 * Trigger-Standard**, und das gehört benannt: wer KEIN Ende wählt, bekommt von
 * Migration 107 den ganzen Jagdtag (`23:59:59.999999`); wer den Endtag
 * ausdrücklich wählt, bekommt 20:00, danach greift wieder der
 * 12-Stunden-Riegel ab dem letzten Lebenszeichen. Für eine Drückjagd trägt
 * das — das Schüsseltreiben erzeugt Aktivität —, und als Nebenwirkung wird die
 * ausdrückliche Wahl wieder von der Voreinstellung unterscheidbar, was der
 * Kopf von `JagdEntwurf.bis` bisher als Verlust ausweisen musste.
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
 * **Die Zerlegung bleibt in der Oberfläche, `JagdEntwurf` behält seinen einen
 * String** — das ist die eigentliche Entscheidung hier. Zwei getrennte Felder
 * im Entwurf hätten `pruefeJagdEntwurf`, `jagdAenderungen`, `alsZeitstempel`,
 * `namensvorschlag` und den halben Selbsttest mitgezogen, für eine reine
 * Anzeigefrage. Zwei `<input>` schreiben stattdessen in denselben Wert.
 *
 * **Ohne Datum ist der ganze Wert leer** — eine Uhrzeit ohne Tag ist kein
 * Termin, und `pruefeJagdEntwurf` soll sie als fehlend sehen, nicht als kaputt.
 * Ohne Uhrzeit greift die Voreinstellung, damit ein geleertes Zeitfeld nicht
 * stillschweigend Mitternacht bedeutet.
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
 * Der späteste zulässige End**tag** zu einem Starttermin, als Wert für `max`
 * eines Datumsfelds — oder `''` ohne brauchbaren Start (dann bleibt das Feld
 * ungedeckelt, statt auf einem Fantasiewert zu klemmen).
 *
 * **Der Deckel stand zuerst NUR in `pruefeJagdEntwurf`, und die Begründung
 * dafür war zu schwach** — sinngemäß „ein Satz erklärt die Grenze besser als
 * eine Browser-Blase". Das stimmt für die MELDUNG, nicht für den PICKER:
 * nativ deckelt der „Bis"-Wähler bei `MAX_JAGD_TAGE` (Moritz, 06.08.2026),
 * und zwei Clients, die dieselbe Grenze verschieden anfassen, sind für den
 * Nutzer eine Unregelmäßigkeit, keine Feinheit.
 *
 * **Gezählt werden BERLINER KALENDERTAGE, nicht 24-Stunden-Blöcke — und das
 * war zuerst falsch herum.** Die erste Fassung rechnete die Zeitspanne
 * (`start + 14 × 86 400 000 ms`), weil Migration 102 das so tat. Mit den
 * Voreinstellungen 07:00/20:00 sind „Starttag + 14 Tage" aber 14 Tage und
 * 13 Stunden, also mehr als die Spanne — der Picker klemmte deshalb einen Tag
 * zu früh, und die gewählte Endzeit musste in die Rechnung eingehen.
 * Moritz, 06.08.2026: *„jetzt ist es nur mit ende 13 tage nach start möglich.
 * 14 tage + die 13 stunden sind korrekt geplant."*
 *
 * **Der Nutzer wählt Tage, also zählt die Grenze Tage.** Der Cron trägt das
 * seit Migration 108 (Deckel von 14 auf 16 Tage). **16 und nicht 15:** 14
 * Kalendertage belegen im schlechtesten Fall 15 Tage 00:59 Stunden, weil die
 * Herbstumstellung einem Tag 25 Stunden gibt — an der Datenbank gemessen,
 * gefunden von der Fremdprüfung, bevor 108 appliziert wurde. Die
 * Endzeit spielt hier damit keine Rolle mehr, eine Eingabe weniger, die etwas
 * verschieben kann.
 *
 * **Kein Umweg über `alsZeitstempel`/`alsEingabewert`, obwohl er hier stand.**
 * Ein `datetime-local`-Wert trägt keine Zone; sein Datumsteil IST bereits das
 * Kalenderdatum, das der Nutzer sieht und tippt. Der Rundweg lieferte es
 * unverändert zurück — das sichern die Zusicherungen zu `alsZeitstempel`
 * ausdrücklich zu — und verschleierte, dass hier gar keine Zonenfrage offen
 * ist. Ungültige Eingaben fallen weiterhin auf `''`, jetzt in `tagPlus`.
 */
export function spaetestesEndeDatum(termin: string): string {
  return tagPlus(datumTeil(termin), MAX_JAGD_TAGE)
}

/**
 * Prüft einen Entwurf, bevor geschrieben wird. Gibt die Meldung zurück oder
 * `null`, wenn nichts zu beanstanden ist.
 *
 * **Der Termin ist Pflicht, und das ist der Unterschied zur App.** Nativ gibt
 * es „Sofort starten"; das Portal bereitet vor und startet nie (Konzept §3 —
 * „ein offener Browser darf keine laufende Feldsituation umschreiben"). Eine
 * Jagd ohne Termin wäre hier eine, die man nur woanders weiterbringen kann.
 */
export function pruefeJagdEntwurf(e: JagdEntwurf): string | null {
  if (!e.name.trim()) return 'Die Jagd braucht einen Namen.'
  if (!e.termin) return 'Die Jagd braucht einen Termin.'
  /*
   * **Gegen `alsZeitstempel` geprüft, nicht gegen `new Date(e.termin)`** — und
   * das ist ein Fund der Fremdprüfung vom 06.08.2026, kein Feilen.
   *
   * Die beiden parsen VERSCHIEDEN: `alsZeitstempel` hängt ein `Z` an, um den
   * Wert erst als UTC zu lesen. `'2026-11-14T08:00Z'` ist für `new Date` also
   * gültig, für `alsZeitstempel` mit dem zweiten `Z` nicht — die alte Prüfung
   * ließ es durch, und `jagdAnlegen` schrieb daraufhin `scheduled_for: null`.
   * Eine Jagd ohne Termin, still, obwohl das Formular „geprüft" gemeldet hat.
   * Über den Picker unerreichbar; `pruefeJagdEntwurf` ist aber eine exportierte
   * Zusage, kein Formulardetail.
   */
  const von = alsZeitstempel(e.termin)
  if (!von) return 'Der Termin ist kein gültiges Datum.'
  if (!JAGDARTEN.includes(e.type)) return 'Unbekannte Jagdart.'

  /*
   * **Das Ende ist freiwillig, seine Reihenfolge nicht.**
   *
   * Migration 095 hat den Riegel `scheduled_until >= scheduled_for`
   * ausdrücklich NICHT als CHECK gebaut, mit Begründung: „Die Reihenfolge
   * gehört dorthin, wo sie dem Nutzer erklärt werden kann: ins Formular."
   * Das hier ist dieses Formular. Die Datenbank nimmt beide Werte weiterhin
   * an — wer sie per `curl` verdreht, bekommt keine Meldung, sondern eine
   * Jagd, die aus der Cron-Ausnahme von 102 fällt.
   *
   * **Die Reihenfolge prüft ZEITPUNKTE, die Dauer prüft KALENDERTAGE**, und
   * das ist kein Versehen, sondern die Korrektur vom 06.08.2026. „Liegt davor"
   * ist eine Frage an die Uhr — ein Ende um 06:00 am Starttag liegt davor,
   * obwohl der Kalendertag derselbe ist. „Dauert höchstens 14 Tage" ist
   * dagegen eine Frage an den Kalender, weil der Nutzer Tage wählt: mit den
   * Voreinstellungen 07:00/20:00 sind Starttag + 14 Tage in Wahrheit 14 Tage
   * und 13 Stunden, und eine Spannenrechnung hätte sie abgewiesen.
   * Migration 108 hebt den Cron-Deckel entsprechend auf 16 Tage — 15 hätten
   * nicht gereicht, weil die Herbstumstellung dem schlechtesten Fall eine
   * Stunde zulegt (15 Tage 00:59, gemessen).
   */
  if (!e.bis) return null
  const bis = alsZeitstempel(e.bis)
  if (!bis) return 'Das Ende ist kein gültiges Datum.'
  if (new Date(bis).getTime() < new Date(von).getTime()) return 'Das Ende liegt vor dem Termin.'
  // Zeichenvergleich auf `YYYY-MM-DD` ist chronologisch korrekt, und beide
  // Seiten kommen über `alsEingabewert` aus derselben Berliner Rechnung.
  if (datumTeil(alsEingabewert(bis)) > tagPlus(datumTeil(alsEingabewert(von)), MAX_JAGD_TAGE))
    return `Eine Jagd dauert höchstens ${MAX_JAGD_TAGE} Tage. Für längere Zeiträume plane mehrere Jagden.`
  return null
}

/**
 * `datetime-local` → ISO-Zeitstempel, gelesen als **Berliner** Zeit.
 *
 * Die naheliegende Fassung wäre `new Date(lokal).toISOString()` — die liest den
 * Wert in der Zone der Umgebung. Das ist aus zwei Gründen falsch:
 *
 *  1. **Die Anzeige rendert fest in `Europe/Berlin`** (`terminText`,
 *     `alsEingabewert`, aus dem Hydration-Grund). Läse die Eingabe in einer
 *     anderen Zone, wanderte der Termin bei jedem Bearbeiten um den Versatz:
 *     18:30 getippt, 19:30 gelesen, beim nächsten Speichern 20:30.
 *  2. **Die Seite läuft auf dem Server (UTC) und im Browser.** Eine Funktion,
 *     deren Ergebnis von der Prozesszone abhängt, liefert je nach Aufrufort
 *     etwas anderes.
 *
 * Der Weg ohne Bibliothek: den Wert einmal als UTC lesen, nachsehen, was diese
 * Zeit in Berlin anzeigt, und um genau diese Differenz zurückrechnen.
 *
 * **Das muss zweimal laufen, und die erste Fassung tat es nicht** — gefunden
 * von der Fremdprüfung am 03.08.2026, nachgerechnet und bestätigt. Der Versatz
 * wurde am Ausgangspunkt gemessen statt am Ergebnis, und an der Zeitumstellung
 * liegen die beiden auf verschiedenen Seiten der Grenze: `2026-03-29T01:30`
 * landete auf `2026-03-28T23:30Z`, in Berlin also auf **00:30 statt 01:30**.
 * Eine Stunde daneben, lautlos.
 *
 * Der zweite Durchgang misst den Versatz dort, wo das Ergebnis wirklich liegt,
 * und trifft damit beide Grenzen. Mein eigener Selbsttest hatte den Fehler
 * nicht gesehen: er prüfte Juli und November, beide weit von jeder Umstellung.
 * Jetzt stehen die Grenztage selbst darin.
 *
 * ponytail: in der doppelten Stunde beim Rückstellen (02:00–03:00 gibt es
 * zweimal) liefert das die **spätere** der beiden Lesarten — hier stand
 * „frühere", und das war seit jeher falsch: `alsZeitstempel('2026-10-25T02:30')`
 * ergibt `01:30Z` (CET), nicht `00:30Z` (CEST). Nachgemessen am 06.08.2026,
 * nachdem die Fremdprüfung es an zwei Paketen unabhängig angemerkt hatte.
 * **Der Fehler saß im Kommentar, nicht im Code** — der Rundweg bleibt stabil,
 * nur ein bereits gespeicherter Wert aus der früheren Lesart wandert beim
 * ersten Bearbeiten einmalig eine Stunde nach hinten und steht danach fest.
 * Die übersprungene Stunde beim Vorstellen (02:30 existiert nicht) wird nach
 * vorn normalisiert auf 03:30. Beides ist dokumentiert und getestet. Eine Jagd, bei der genau
 * diese Unterscheidung zählt, ist kein Fall, den dieses Produkt kennt — der
 * Ausweg wäre, mehrdeutige Zeiten vom Nutzer bestätigen zu lassen.
 */
export function alsZeitstempel(lokal: string): string | null {
  if (!lokal) return null
  const alsUtc = new Date(`${lokal}Z`)
  if (Number.isNaN(alsUtc.getTime())) return null
  // Erste Näherung, dann den Versatz am ERGEBNIS nachmessen.
  const grob = new Date(alsUtc.getTime() - berlinVersatz(alsUtc))
  return new Date(alsUtc.getTime() - berlinVersatz(grob)).toISOString()
}

/** Wie weit Berlin an diesem Zeitpunkt vor UTC liegt, in Millisekunden. */
function berlinVersatz(zeitpunkt: Date): number {
  return new Date(`${alsEingabewert(zeitpunkt.toISOString())}Z`).getTime() - zeitpunkt.getTime()
}

/** ISO-Zeitstempel → Wert für `datetime-local`, in Berliner Zeit. */
export function alsEingabewert(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // `sv-SE` liefert `2026-08-15 18:30` — die einzige Locale, die von sich aus
  // ISO-nah formatiert. Nur das Leerzeichen muss zum `T` werden.
  return d
    .toLocaleString('sv-SE', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(' ', 'T')
}

/**
 * Was sich gegenüber der geladenen Jagd geändert hat — oder `null`, wenn
 * nichts. Gleiche Bauform wie `aenderungen()` in der Gästeliste: nichts
 * geändert heißt nichts schreiben.
 *
 * **`district_id` ist nicht dabei, und das ist keine Auslassung.** Das Revier
 * einer Jagd zu wechseln ist in 4a keine Handlung — und seit dem Riegel auf
 * `hunts.district_id` wäre es ohnehin nur dort erlaubt, wo Besitz oder ein
 * gültiger Schein vorliegt, und gar nicht mehr, sobald Erlegungen daran hängen.
 */
export function jagdAenderungen(
  e: JagdEntwurf,
  jagd: Jagd,
): Record<string, string | null> | null {
  const patch: Record<string, string | null> = {}
  const name = e.name.trim()
  if (name !== (jagd.name ?? '')) patch.name = name

  if (e.type !== jagd.type) {
    patch.type = e.type
    // **`signal_mode` gehört mit umgestellt, sonst laufen die beiden
    // auseinander.** Der Anlegepfad setzt `loud` genau für die Drückjagd; ein
    // späterer Wechsel von Ansitz auf Drückjagd bliebe ohne diese Zeile still,
    // der Wechsel zurück bliebe laut. Die Feld-App läse dann eine Kombination,
    // die bei einer Neuanlage nie entstünde — und signalisierte am Jagdtag
    // falsch. (Fremdprüfung 03.08.2026.)
    patch.signal_mode = e.type === 'drueckjagd' ? 'loud' : 'silent'
  }

  /*
   * **Verglichen wird im EINGABEFORMAT, nicht als Zeitpunkt — und das ist eine
   * Korrektur, kein Feilen.**
   *
   * Bis zum 06.08.2026 stand hier ein Zeitpunktvergleich, begründet damit, dass
   * die DB `2026-08-15T16:30:00+00:00` liefert und `toISOString()`
   * `…16:30:00.000Z`; zeichenweise wären die verschieden und jedes Speichern
   * schriebe neu. Die Begründung stimmt, die Lösung war zu kurz gegriffen:
   * **`alsEingabewert` kürzt auf MINUTEN, `alsZeitstempel` kann also nie
   * zurückgeben, was unter einer Minute stand.** Ein Wert mit Sekunden ist
   * damit IMMER „geändert", auch wenn niemand etwas angefasst hat.
   *
   * Gemessen am 06.08.2026, und beide Spalten sind betroffen:
   *   `scheduled_until` vom Trigger  `…22:59:59.999999+00:00` → −59,999 s
   *   `scheduled_for` nativ geplant  `…08:58:11.698+00:00`    → −11,698 s
   *
   * Die zweite Zeile ist der ältere Fehler: die native App schreibt
   * `scheduled_for` aus einem Date-Picker, also mit Millisekunde —
   * `defaultPlannedAt()` ist `new Date(Date.now() + 24h)` und geht per
   * `toISOString()` heraus (`quickhunt-native/src/app/(app)/(jagd)/create.tsx`).
   * **Hier stand, die Übergabe vom 04.08.2026 zitiere `08:58:11.698`; das tut
   * sie nicht** — die Zeichenfolge steht in einem Kommentar ebendieser
   * `create.tsx`, in keiner Übergabe (Delta-Durchgang 06.08.2026, nachgesucht).
   * Die Aussage stimmt, der Beleg war falsch adressiert. **„Formular öffnen, nichts
   * ändern, speichern" hat den Starttermin bisher still um Sekunden gekürzt** —
   * vorbestehend, gefunden von der Schlusslesung am Endtermin, hier an der
   * Wurzel behoben statt nur an der neuen Spalte.
   *
   * `alsEingabewert` normalisiert beide Seiten auf `YYYY-MM-DDTHH:mm` und
   * erledigt damit auch das ursprüngliche `+00:00`-gegen-`.000Z`-Problem.
   */
  const unveraendert = (gespeichert: string | null, imFeld: string) =>
    alsEingabewert(gespeichert) === imFeld

  if (!unveraendert(jagd.scheduled_for, e.termin)) patch.scheduled_for = alsZeitstempel(e.termin)

  // Das Ende. **Ein geleertes Feld schreibt bewusst `null`** und nicht etwa das
  // Tagesende: der Trigger aus 107 setzt es wieder, und die Rechnung gehört
  // genau dorthin — hier eine zweite Fassung danebenzulegen wäre die dritte
  // Kopie, gegen die diese Migration überhaupt gebaut wurde.
  //
  // **„setzt es sofort wieder" stand hier unbedingt und stimmt nicht:** der
  // Trigger greift nur bei `draft`/`scheduled` MIT `scheduled_for`. Eine Zeile
  // ohne Termin behält die Leere (Fremdprüfung 06.08.2026). Über dieses
  // Formular ist das unerreichbar — `pruefeJagdEntwurf` verlangt einen Termin
  // —, aber der Patch ist die Zusage der Funktion, nicht des Formulars.
  if (!unveraendert(jagd.scheduled_until, e.bis)) patch.scheduled_until = alsZeitstempel(e.bis)

  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * Ein Einladungscode, wie ihn `hunts.invite_code` verlangt (NOT NULL, kein
 * Default). Zeichengleich zur App (`generateInviteCode`): 13 Zeichen base36 aus
 * dem CSPRNG.
 */
export function einladungscode(): string {
  const roh = new Uint32Array(3)
  crypto.getRandomValues(roh)
  return Array.from(roh, (n) => n.toString(36))
    .join('')
    .slice(0, 13)
}

/**
 * Der Namensvorschlag für eine neue Jagd, nach dem Muster der App
 * („Jagd am 13.6.2026"). Steht als Platzhalter im Formular, nicht als
 * vorbelegter Wert — sonst wäre nicht unterscheidbar, ob jemand den Vorschlag
 * gewollt oder nur nicht gelesen hat.
 */
export function namensvorschlag(termin: string): string {
  // **Der Kalendertag wird aus der Zeichenkette gelesen, nicht über ein
  // Date-Objekt.** `new Date('2026-08-15T23:30')` läse den Wert in der Zone des
  // Prozesses; unter UTC käme dann „Jagd am 16.8.2026" heraus, während der
  // gespeicherte Berliner Termin auf dem 15. liegt. Jagd, Chat-Gruppe und
  // Einladungslink trügen ein Datum, das der Termin nicht hat.
  // (Fremdprüfung 03.08.2026.) Das Feld liefert `YYYY-MM-DDTHH:mm` — der Tag
  // steht schon darin, es gibt nichts umzurechnen.
  const treffer = /^(\d{4})-(\d{2})-(\d{2})T/.exec(termin)
  if (!treffer) return 'Jagd'
  const [, jahr, monat, tag] = treffer
  return `Jagd am ${Number(tag)}.${Number(monat)}.${jahr}`
}

// ===========================================================================
// Einladen — Konten UND Gäste ohne Konto
// ===========================================================================
//
// **Der Anlass ist Moritz' Beobachtung vom 03.08.2026:** beim Anlegen einer
// Jagd standen nur die 9 Personen mit Konto zur Wahl. „wir werden aber ja auch
// jagden anlegen mit leuten die noch keinen haben oder nie haben werden."
//
// **Der Weg dafür war schon vollständig da, nur nicht angeschlossen:**
// `hunt_participants.user_id` ist seit Migration 003 nullable, daneben stehen
// `guest_name` und `guest_token`. Beide Clients zeigen `guest_name` als
// Namensfallback (nativ `participants.ts:76`, PWA `hunt/[id]/page.tsx:160`),
// `teilnehmerName()` hier tut dasselbe, und `/join/<code>` nimmt Gäste ohne
// Anmeldung auf. Gefehlt hat allein die Auswahl.
//
// **Was NICHT gebaut wurde: eine Spalte `hunt_participants.kontakt_id`.** Sie
// wäre der saubere Bezug zwischen Teilnehmerzeile und Adressbuch, und ohne sie
// hängt der Dublettenschutz am NAMEN (`schonDabei`). Sie wäre aber DDL, also
// Migration, also Anker 2 der Review-Kette — für einen Schutz, dessen
// Ausfallschaden eine überzählige Zeile ist, die man entfernt. Fällig, sobald
// etwas an der Zeile HÄNGT statt nur an ihr abzulesen: A-S3 Legitimation will
// einen Nachweis je Person und Jagd, und ein Name trägt den nicht.
// ponytail: Dublettenschutz über den Namen. Auf `kontakt_id` umstellen, sobald
// A-S3 gebaut wird.

/** Ein Adressbuch-Eintrag, so weit das Einladen ihn braucht. */
export interface EinladbarerKontakt {
  id: string
  vorname: string | null
  nachname: string | null
  kategorien: readonly string[] | null
}

/**
 * Ein Konto, so weit Portal-Seiten es brauchen.
 *
 * Stand als `interface Profil` gleichlautend in `[id]/page.tsx` UND
 * `[id]/detail.tsx`; mit dieser Datei wäre es die dritte Kopie geworden
 * (Ponytail-Lesung 03.08.2026). Dieselbe Klasse Befund wie die fünf Kopien der
 * Objekt-Typliste, auf die `FELDER` in `../gaeste/kontakte.ts` verweist.
 */
export interface Profil {
  id: string
  display_name: string | null
}

export interface Kandidat {
  /**
   * **Über beide Quellen eindeutig**, deshalb mit Präfix: eine Kontakt-ID und
   * eine Konto-ID sind beide UUIDs und könnten sich sonst nicht unterscheiden.
   * Die Auswahl ist eine `Map` über genau diese Schlüssel — der Wert darin ist
   * die Rolle, unter der die Person angehakt wurde.
   */
  schluessel: string
  name: string
  /** Gesetzt heißt: die Person hat ein Konto und wird darüber eingeladen. */
  userId: string | null
  kategorien: readonly string[]
  /** Hat abgesagt — wird per UPDATE wieder eingeladen, nicht per INSERT. */
  erneut: boolean
}

export const KONTO_SCHLUESSEL = 'konto:'
export const KONTAKT_SCHLUESSEL = 'kontakt:'

/**
 * Wer noch eingeladen werden kann — Konten und Adressbuch in EINER Liste.
 *
 * Drei Gruppen, in dieser Reihenfolge:
 * 1. Konten ohne Teilnehmerzeile (INSERT mit `user_id`),
 * 2. Konten, die abgesagt haben (UPDATE — seit 088 bleibt die Zeile stehen),
 * 3. Adressbuch-Kontakte, die noch nicht als Gast eingetragen sind.
 *
 * **Der Ersteller fällt raus**, wie bisher: er steht als Jagdleiter schon drin.
 *
 * **Konto und Kontakt derselben Person erscheinen beide**, wenn beides
 * existiert — `kontakte.profil_id` ist bei 0 von 154 Zeilen gesetzt (03.08.2026),
 * es gibt also nichts, woran sich die Verbindung ablesen ließe. Ein
 * Namensvergleich wäre geraten: „Lampe, Moritz" im Adressbuch gegen ein frei
 * gesetztes `display_name`. Der Einladende sieht beide Zeilen und weiß, wer wer
 * ist; ein falsch geratenes Zusammenlegen würde dagegen jemanden verschlucken.
 * ponytail: auflösen, sobald `profil_id` gepflegt wird.
 *
 * **Drei Grenzen des Namens-Dublettenschutzes, alle gemessen und alle heute
 * unerreichbar** (Fremdprüfung 03.08.2026, B1/B2/B5):
 *
 * 1. **Zwei Kontakte mit identischem Vor- UND Nachnamen** (Vater und Sohn ohne
 *    „jun.") — ist einer eingeladen, verschwindet der andere aus der Auswahl.
 *    Im Bestand: **0 solche Paare** von 154. Der Ausfall ist laut, nicht still:
 *    der Jagdleiter sucht die Person und findet sie nicht.
 * 2. **Schreibweise geändert nach der Einladung** — „Hans-Peter" wird zu „Hans
 *    Peter", und der Kontakt wird erneut angeboten. `namensschluessel()`
 *    normalisiert nur Groß-/Kleinschreibung und Leerraum, keine Satzzeichen und
 *    keine Unicode-Zusammensetzung.
 * 3. **Zwei Jagdleiter laden gleichzeitig denselben Gast ein** — `UNIQUE
 *    (hunt_id, user_id)` greift bei `NULL` nicht, beide INSERTs gehen durch.
 *    Danach steht ein Mensch zweimal auf der Liste, zählt doppelt und kann zwei
 *    Stände bekommen.
 *
 * Fall 3 ist der einzige, den Code hier nicht schließen kann: dagegen hilft nur
 * ein partieller Unique-Index (`(hunt_id, lower(guest_name)) where user_id is
 * null`), also DDL, also der native Track (R2) und Anker 2. Notiert, nicht
 * stillschweigend übergangen.
 */
export function kandidaten(
  profile: readonly Profil[],
  kontakte: readonly EinladbarerKontakt[],
  teilnehmer: readonly { user_id: string | null; guest_name: string | null; status: string | null }[],
  eigeneId: string,
  namen: Record<string, string>,
): Kandidat[] {
  const mitZeile = new Set(teilnehmer.map((t) => t.user_id).filter(Boolean) as string[])
  // Gäste erkennt man nur am Namen — s. der ponytail-Hinweis oben. Vergleich
  // über `schonDabei`, damit Groß-/Kleinschreibung und Leerraum nicht zu einer
  // zweiten Zeile für dieselbe Person führen.
  const gaeste = new Set(
    teilnehmer.filter((t) => !t.user_id && t.guest_name).map((t) => namensschluessel(t.guest_name!)),
  )

  const neu: Kandidat[] = profile
    .filter((p) => p.id !== eigeneId && !mitZeile.has(p.id))
    .map((p) => ({
      schluessel: KONTO_SCHLUESSEL + p.id,
      name: p.display_name || `Konto ${p.id.slice(0, 8)}`,
      userId: p.id,
      kategorien: [],
      erneut: false,
    }))

  const abgesagt: Kandidat[] = teilnehmer
    .filter((t) => t.user_id && wiederEinladbar(t.status))
    .map((t) => ({
      schluessel: KONTO_SCHLUESSEL + t.user_id!,
      name: namen[t.user_id!] || `Konto ${t.user_id!.slice(0, 8)}`,
      userId: t.user_id!,
      kategorien: [],
      erneut: true,
    }))

  const ausAdressbuch: Kandidat[] = kontakte
    // **`OHNE_NAMEN` fällt raus** (Fremdprüfung 03.08.2026, B10): der Name wird
    // als `guest_name` gespeichert und ist danach in keiner Oberfläche mehr zu
    // ändern — ein Teilnehmer namens „(ohne Namen)" wäre Datenmüll, den man nur
    // durch Entfernen und Neu-Einladen loswird. Der Check-Constraint
    // `kontakt_braucht_namen` macht den Fall heute unerreichbar (0 von 154);
    // der Riegel steht da, weil eine Ansicht sich nicht darauf verlassen darf,
    // dass eine Datenbankbedingung nie verletzt wird — dieselbe Haltung wie bei
    // `anzeigeName()` in `../gaeste/kontakte.ts`.
    .filter((k) => kontaktName(k) !== OHNE_NAMEN)
    .filter((k) => !gaeste.has(namensschluessel(kontaktName(k))))
    .map((k) => ({
      schluessel: KONTAKT_SCHLUESSEL + k.id,
      name: kontaktName(k),
      userId: null,
      kategorien: k.kategorien ?? [],
      erneut: false,
    }))

  return [...neu, ...abgesagt, ...ausAdressbuch]
}

/**
 * „Ahlwes, Henner" aus Vor- und Nachname — bewusst NICHT `anzeigeName()` aus
 * `../gaeste/kontakte`.
 *
 * Der Name landet als `guest_name` in der Datenbank und ist damit das, was
 * beide Clients und die Papierliste am Jagdtag zeigen. Die
 * Adressbuch-Schreibweise („Alvensleben v., Ferdinand") ist eine
 * SORTIER-Schreibweise; sie ist im Adressbuch richtig und auf einer
 * Teilnehmerliste falsch.
 */
export const OHNE_NAMEN = '(ohne Namen)'

export function kontaktName(k: Pick<EinladbarerKontakt, 'vorname' | 'nachname'>): string {
  return [k.vorname, k.nachname].map((s) => (s ?? '').trim()).filter(Boolean).join(' ') || OHNE_NAMEN
}

/** Namensvergleich ohne Groß-/Kleinschreibung und ohne doppelten Leerraum. */
export function namensschluessel(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Die Filter über der Kandidatenliste.
 *
 * **Filter statt getrennter Tabellen** (Codex, 03.08.2026, auf Moritz' Vorgabe
 * „wenn ich schützen einlade will ich die treiber da nicht sehen"): bei 154
 * Kontakten würden vier Tabellen untereinander die Seite sprengen, und eine
 * Person mit drei Kategorien stünde dreimal da — mit drei Kästchen für eine
 * Einladung.
 *
 * `gewaehlt` ist kein Bequemlichkeits-Filter, sondern **der Riegel des ganzen
 * Entwurfs.** Die Auswahl überlebt den Kategoriewechsel (sonst wäre ein
 * 40-Personen-Durchgang nicht zu schaffen), und damit kann ausgewählt sein, was
 * man gerade nicht sieht. Der Zähler am Knopf sagt, DASS da etwas ist; dieser
 * Filter zeigt, WAS.
 */
export const EINLADE_FILTER = [
  { wert: 'alle', label: 'Alle' },
  { wert: 'schuetze', label: 'Schützen' },
  { wert: 'jaegerei', label: 'Jägerei' },
  { wert: 'treiber', label: 'Treiber' },
  { wert: 'schweisshundfuehrer', label: 'Schweißhundführer' },
  { wert: 'konten', label: 'Mit Konto' },
  { wert: 'ohne', label: 'Ohne Kategorie' },
  { wert: 'gewaehlt', label: 'Ausgewählt' },
] as const satisfies readonly { wert: string; label: string }[]

export type EinladeFilter = (typeof EINLADE_FILTER)[number]['wert']

/**
 * Was dasteht, wenn kein Kandidat übrig ist.
 *
 * **Kein Text sagt, WARUM die Liste leer ist** — und das ist die Lehre aus zwei
 * Runden an derselben Stelle. Erst stand hier „In dieser Kategorie ist niemand
 * eingeordnet" für jeden Filter; das war unter „Mit Konto" falsch (Konten haben
 * keine Kategorie) und unter „Ohne Kategorie" das Gegenteil der Wahrheit
 * (Schlusslesung 03.08.2026). Die Fassung danach benannte je Filter eine
 * Ursache — und log weiterhin, nur seltener: die Liste zeigt **nur
 * Nicht-Eingeladene**, „keine Schützen zur Wahl" kann also auch heißen, dass
 * alle schon eingeladen sind (Delta-Durchgang, D4).
 *
 * Diese Auskunft ist von hier aus nicht zu treffen, und der Ausweg ist nicht
 * eine dritte Verzweigung, sondern der Verzicht: **der Text sagt, was ist
 * („niemand steht mehr zur Wahl"), und nennt die Gästeliste als Ort, an dem man
 * nachsieht — nicht als Diagnose.**
 */
export function leerText(filter: EinladeFilter, suche: string): string {
  if (suche.trim()) return 'Niemand mit diesem Namen in dieser Auswahl.'
  if (filter === 'gewaehlt') return 'Noch niemand ausgewählt.'
  if (filter === 'konten') return 'Kein Konto steht mehr zur Wahl.'
  if (filter === 'alle') return 'Niemand steht mehr zur Wahl.'
  const woher =
    filter === 'ohne' ? 'ohne Kategorie' : `aus der Kategorie „${einladeFilterLabel(filter)}"`
  return `Niemand ${woher} steht noch zur Wahl — entweder ist niemand so eingeordnet, oder alle sind schon eingeladen. Nachsehen und einordnen lässt sich das in der Gästeliste.`
}

/** Die Beschriftung eines Filters — für Meldungen, die ihn benennen. */
export function einladeFilterLabel(filter: EinladeFilter): string {
  return EINLADE_FILTER.find((f) => f.wert === filter)?.label ?? filter
}

/**
 * Eine Auswahl, so weit das Filtern sie braucht.
 *
 * **Nur `has`, weder `Set` noch `Map`** — die Oberfläche führt seit dem
 * Rollen-Fix eine `Map<schluessel, Rolle>`, die Selbsttests reichen ein `Set`
 * herein, und beide Stellen wollen dasselbe wissen: steht dieser Schlüssel
 * drin? Der Typ nennt genau diese Frage, statt eine Bauform vorzuschreiben,
 * die hier niemanden interessiert.
 */
export interface Auswahl {
  has(schluessel: string): boolean
}

/** Gehört der Kandidat in diesen Filter? */
export function imFilter(k: Kandidat, filter: EinladeFilter, gewaehlt: Auswahl): boolean {
  switch (filter) {
    case 'alle':
      return true
    case 'gewaehlt':
      return gewaehlt.has(k.schluessel)
    // Konten tragen keine Kategorien — die hängen am Kontakt, nicht am Konto.
    // Sie deshalb still unter „Ohne Kategorie" zu mischen, verwischte zwei ganz
    // verschiedene Zustände: „hat die App" und „ist noch nicht eingeordnet".
    case 'konten':
      return k.userId !== null
    case 'ohne':
      return k.userId === null && k.kategorien.length === 0
    default:
      return k.kategorien.includes(filter)
  }
}

/**
 * Die sichtbaren Kandidaten. Filter UND Suche, in dieser Reihenfolge — die
 * Suche wirkt INNERHALB des Filters, sie hebt ihn nicht auf.
 *
 * **`normalisiere` ist ein Parameter, und das ist keine Einspeisung auf Vorrat.**
 * Übergeben wird immer `suchtext()` aus der Gästeliste; ein direkter Import
 * wäre kürzer und war nach der Ponytail-Lesung am 03.08.2026 auch kurz drin.
 * **Er bricht die Selbsttests:** diese Datei wird von `jagden.selftest.ts` unter
 * `node --experimental-strip-types` geladen, und node löst nur Importe MIT
 * `.ts`-Endung auf — die wiederum darf in Produktionscode nicht stehen. Der
 * Parameter ist der Preis dafür, dass die Regeln hier ohne Testrahmen prüfbar
 * bleiben (derselbe Grund, aus dem `../gaeste/kontakte.ts` ganz ohne Import
 * auskommt).
 *
 * Gesucht wird damit über dieselbe Normalisierung wie in der Gästeliste:
 * Umlaute fallen weg, die „ue"-Schreibweise ausdrücklich nicht.
 */
export function sichtbareKandidaten(
  alle: readonly Kandidat[],
  filter: EinladeFilter,
  suche: string,
  gewaehlt: Auswahl,
  normalisiere: (s: string) => string,
): Kandidat[] {
  const gesucht = normalisiere(suche).trim()
  return alle.filter(
    (k) => imFilter(k, filter, gewaehlt) && (!gesucht || normalisiere(k.name).includes(gesucht)),
  )
}

/**
 * Die Zahl je Filter — sie steht am Schalter, nicht erst nach dem Klick.
 *
 * Ohne sie muss man jeden Filter durchprobieren, um zu sehen, wo überhaupt
 * jemand steht; mit ihr sieht man, dass „Treiber 0" heißt: dort ist niemand
 * eingeordnet, nicht: dort ist niemand.
 *
 * **Die Suche geht NICHT ein.** Die Zahlen beschreiben den Bestand, nicht die
 * gerade getippte Anfrage — sonst sprängen alle acht bei jedem Tastendruck.
 */
export function filterZaehler(
  alle: readonly Kandidat[],
  gewaehlt: Auswahl,
): Record<EinladeFilter, number> {
  const zahlen = {} as Record<EinladeFilter, number>
  for (const f of EINLADE_FILTER) {
    zahlen[f.wert] = alle.filter((k) => imFilter(k, f.wert, gewaehlt)).length
  }
  return zahlen
}

/**
 * Die Zustände, die ein Jagdleiter für einen GAST setzen darf.
 *
 * `left` fehlt bewusst: es heißt „selbst gegangen" und ist eine Aussage über
 * eine Handlung des Teilnehmers. Ein Gast handelt hier nicht — was der
 * Jagdleiter einträgt, ist entweder eine Zusage oder eine Absage, die er selbst
 * entgegengenommen hat.
 */
export const GAST_ZUSTAENDE = ['invited', 'joined', 'declined'] as const
export type GastZustand = (typeof GAST_ZUSTAENDE)[number]

/**
 * Der Patch für einen Zustandswechsel — **mit den Zeitstempeln, die dazu
 * gehören**.
 *
 * `joined_at` und `left_at` allein stehen zu lassen wäre dieselbe Falle wie im
 * Wiedereinladen-Zweig oben: eine Zeile auf `invited` mit einem Absagedatum
 * daneben behauptet zwei Dinge gleichzeitig. Wer einen Gast von „abgesagt" auf
 * „zugesagt" dreht, muss das `left_at` loswerden, und umgekehrt.
 *
 * Die Wahrheit steht danach in genau einer Spalte je Aussage — der Zustand im
 * `status`, sein Zeitpunkt daneben, und nichts Widersprüchliches dazwischen.
 *
 * **Der Patch muss TOTAL bleiben — daran hängt mehr als Ordnung**
 * (Delta-Durchgang 03.08.2026, D7). Anders als der Wiedereinlade-Zweig für
 * Konten, der sich mit `.eq('status','declined')` gegen eine nebenläufige
 * Änderung schützt, schreibt dieser Pfad ohne Vorzustandsprüfung. Das ist heute
 * gefahrlos, weil alle drei Spalten aus dem ZIELzustand folgen und keinen
 * Vorzustand lesen: zwei gleichzeitige Portal-Sitzungen ergeben schlimmstenfalls
 * den letzten Klick, nie eine widersprüchliche Zeile. Wer hier später einen
 * Teil-Patch einbaut (etwa „nur `status` setzen"), verliert diese Eigenschaft
 * lautlos.
 */
export function gastZustand(wert: string): Record<string, unknown> {
  const zustand: GastZustand = (GAST_ZUSTAENDE as readonly string[]).includes(wert)
    ? (wert as GastZustand)
    : 'invited'
  return {
    status: zustand,
    joined_at: zustand === 'joined' ? new Date().toISOString() : null,
    left_at: zustand === 'declined' ? new Date().toISOString() : null,
  }
}

/**
 * Als welche Rolle wird dieser Kandidat eingeladen?
 *
 * **Der Anlass ist Moritz' eigentliches Ziel, das der Filter allein nicht
 * erreicht** (Fremdprüfung 03.08.2026, offener Punkt B12, von Moritz am selben
 * Tag zum Bauen freigegeben): wer über „Treiber" auswählt, landete trotzdem als
 * Schütze in der Jagd und musste einzeln umgestellt werden — genau die
 * Wiederholung, gegen die Migration 094 gebaut wurde („dann muss das nicht bei
 * jeder jagd neu gemacht werden").
 *
 * **Zwei Quellen, und der Filter schlägt die Kategorie.** Wer ausdrücklich
 * unter „Treiber" auswählt, meint einen Treiber — auch wenn dieselbe Person
 * zusätzlich Schütze ist. Das ist der ganze Sinn des Durchgangs „erst alle
 * Schützen, dann alle Treiber": die Auswahl SAGT etwas, und diese Aussage darf
 * die Stammdaten übersteuern.
 *
 * Steht kein Filter mit einer Rolle an (also unter „Alle", „Mit Konto", „Ohne
 * Kategorie", „Ausgewählt" oder einer Kategorie ohne eigene Rolle), entscheidet
 * die Kategorie des Kontakts — und dort schlägt `schuetze` den `treiber`: wer
 * beides ist, ist an der Jagd ein Schütze, denn ein Schütze schießt und ein
 * Treiber nicht. Die teurere Berechtigung ist der Rückfall, nicht die
 * billigere.
 *
 * **`jaegerei` und `schweisshundfuehrer` haben keine Rolle**, und das ist kein
 * Versehen: `participant_role` kennt nur `jagdleiter | schuetze | treiber`.
 * Migration 094 begründet ausführlich, warum `schweisshundfuehrer` ausdrücklich
 * KEINE Rolle wird — als Rolle zöge er die Streckenmaskierung nach sich, die
 * nicht gebaut ist. Beide werden hier also zu `schuetze`, wie jeder andere
 * Gast auch.
 *
 * **`jagdleiter` kommt hier nie heraus.** Die Leitung wird nicht beim Einladen
 * vergeben; das Portal kann sie überhaupt nicht setzen (`SETZBARE_ROLLEN`).
 */
export function rolleBeimEinladen(k: Kandidat, filter: EinladeFilter): SetzbareRolle {
  if (filter === 'treiber') return 'treiber'
  if (k.kategorien.includes('schuetze')) return 'schuetze'
  if (k.kategorien.includes('treiber')) return 'treiber'
  return 'schuetze'
}

/**
 * Wie viele je Rolle — für die Beschriftung des Einladen-Knopfes.
 *
 * **Bekommt nur die Neuen gereicht, nicht die Wieder-Eingeladenen** — deren
 * Zeile existiert schon, und der UPDATE-Zweig in `einladen()` fasst `role`
 * ausdrücklich nicht an (Delta-Durchgang 03.08.2026, R7).
 *
 * **Ohne diese Zahl wäre die Ableitung eine stille Entscheidung.** Der
 * Jagdleiter soll vor dem Klick sehen, als was er einlädt: „12 einladen" sagt
 * nichts darüber, dass vier davon als Treiber in die Jagd gehen. Dieselbe
 * Überlegung wie beim Zähler „N ausgewählt, nicht alle sichtbar" — wer
 * automatisch entscheidet, muss die Entscheidung zeigen.
 */
export function rollenVerteilung(rollen: readonly SetzbareRolle[]): string {
  const zahl = (r: SetzbareRolle) => rollen.filter((x) => x === r).length
  // **`Schütze 8`, nicht `8 Schütze`** (Delta-Durchgang 03.08.2026, R8): die
  // Zahl vorangestellt verlangt einen Plural, und deutsche Plurale sind
  // unregelmäßig („Schützen", aber „Treiber"). Eine zweite Beschriftungsliste
  // nur dafür wäre eine zweite Wahrheit neben `ROLLE_LABEL`. Nachgestellt ist
  // das Wort eine Bezeichnung und der Singular richtig — und es liest sich wie
  // die Filter-Schalter darüber, die genau so gebaut sind.
  const teile = SETZBARE_ROLLEN.filter((r) => zahl(r) > 0).map((r) => `${rolle(r)} ${zahl(r)}`)
  // Eine einzige Rolle braucht keine Aufschlüsselung — „12 einladen (12
  // Schütze)" ist Lärm. Erst die Mischung ist die Auskunft.
  return teile.length > 1 ? teile.join(' · ') : ''
}
