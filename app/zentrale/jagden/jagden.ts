/**
 * Jagden — reine Logik, ohne React und ohne Supabase.
 *
 * Portal-Phase 4a (`QuickHunt_Konzept_Revierzentrale_V1.md` §5). Der Bereich
 * bereitet Jagden VOR; der Jagdtag selbst läuft nativ. Aktive Jagden sind hier
 * ausdrücklich read-only (§3) — "ein offener Browser darf keine laufende
 * Feldsituation umschreiben".
 */

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
  started_at: string | null
  ended_at: string | null
  created_at: string | null
}

/** Eine Teilnehmerzeile, so weit die Liste sie braucht. */
export interface Teilnahme {
  hunt_id: string
  status: string | null
}

export interface Zusagen {
  zugesagt: number
  offen: number
  abgesagt: number
}

export const KEINE_ZUSAGEN: Zusagen = { zugesagt: 0, offen: 0, abgesagt: 0 }

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
  for (const t of teilnahmen) {
    const z = map.get(t.hunt_id) ?? { ...KEINE_ZUSAGEN }
    if (t.status === 'joined') z.zugesagt += 1
    else if (t.status === 'invited') z.offen += 1
    else if (t.status === 'declined') z.abgesagt += 1
    map.set(t.hunt_id, z)
  }
  return map
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

/**
 * Der Anzeigename.
 *
 * `hunt_participants` trägt entweder `user_id` oder `guest_name`
 * (CHECK-Constraint) — Gäste ohne Konto gibt es also im Schema bereits, auch
 * wenn heute keiner darin steht. Der Fallback auf die halbe UUID ist kein
 * Design, sondern eine Notbremse: ein Profil, das RLS nicht durchlässt, soll
 * eine unterscheidbare Zeile ergeben statt einer leeren.
 */
export function teilnehmerName(t: Teilnehmer, namen: Record<string, string>): string {
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
  type: Jagdart
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
  if (Number.isNaN(new Date(e.termin).getTime())) return 'Der Termin ist kein gültiges Datum.'
  if (!JAGDARTEN.includes(e.type)) return 'Unbekannte Jagdart.'
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
 * zweimal) liefert das die frühere der beiden Lesarten; die übersprungene
 * Stunde beim Vorstellen (02:30 existiert nicht) wird nach vorn normalisiert
 * auf 03:30. Beides ist dokumentiert und getestet. Eine Jagd, bei der genau
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

  const neu = alsZeitstempel(e.termin)
  const alt = jagd.scheduled_for
  // Über den Zeitpunkt vergleichen, nicht über die Zeichenkette: die DB liefert
  // `2026-08-15T16:30:00+00:00`, `toISOString()` `2026-08-15T16:30:00.000Z`.
  // Zeichenweise wären die beiden verschieden und jedes Speichern schriebe den
  // Termin neu.
  const zeit = (w: string | null) => (w ? new Date(w).getTime() : null)
  if (zeit(neu) !== zeit(alt)) patch.scheduled_for = neu

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
