/**
 * Die Erinnerungen zur Ortung — Nachrichten bauen und die Antwort von Expo je
 * Anspruch auswerten. Morgens „Ortung noch aus" (CN-416, Migration 144, Bauplan
 * `quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Ortung_Erinnerung_V1.md`,
 * E4, E5, E9), seit CN-427 abends „Jagdzeit vorbei — Ortung noch an"
 * (Migration 145, Bauplan `…/QuickHunt_Bauplan_Ortung_Tagesende_V1.md`, E5).
 * Die Auswertung ist für beide Arten dieselbe; Text, Daten, `ttl` und die
 * Spalte des Compare-and-Swap hängen an der Art.
 *
 * **Warum das eine eigene Datei ist und nicht in der Route steht:** die
 * Auswertung entscheidet, welche beanspruchten Fenster zurückgegeben werden
 * (dann kommt die Push im nächsten Takt noch einmal) und welche nicht (dann
 * kommt sie für dieses Fenster nie). Beide Fehler sind stumm. Der Selbsttest
 * daneben hält die Regel fest; die Route füllt sie nur.
 *
 * **Die Regel je Anspruch** (`hunt_id`, `user_id`, Fensterbeginn):
 * - erfolgreich, sobald EIN Ticket seiner Geräte `ok` ist — ein Nutzer mit
 *   zwei Geräten, von denen eines zustellt, ist erinnert;
 * - zurückgegeben nur ohne jeden Erfolg UND mit einem Transportfehler
 *   (Chunk gescheitert oder nie gesendet);
 * - `DeviceNotRegistered` räumt die Anmeldung auf, gibt aber nicht zurück —
 *   ein abgemeldetes Gerät wird durch Wiederholen nicht wieder erreichbar;
 * - andere Ticket-Fehler werden gezählt, die Marke bleibt;
 * - ein Anspruch ohne gültiges Gerät bleibt beansprucht (es gibt niemanden,
 *   dem ein zweiter Versuch etwas zustellen könnte).
 *
 * Ohne Importe, damit der Selbsttest ohne Bundler läuft
 * (`node --experimental-strip-types`).
 */

/** Welche Erinnerung: morgens für Abgemeldete, abends für wer noch ortet. */
export type Art = 'noch_aus' | 'noch_an'

/**
 * Je Art: die RPC, die beansprucht, das Feld ihrer Zeile mit dem Zeitpunkt
 * und die Spalte der Marke, gegen die zurückgegeben wird.
 */
export const ARTEN = {
  noch_aus: { rpc: 'ortung_erinnerungen_beanspruchen', feld: 'fensterbeginn', spalte: 'ortung_erinnert_fuer' },
  noch_an: { rpc: 'ortung_tagesende_beanspruchen', feld: 'tagesende', spalte: 'ortung_tagesende_erinnert_fuer' },
} as const

/**
 * Eine Zeile aus `ortung_erinnerungen_beanspruchen()` (144) bzw.
 * `ortung_tagesende_beanspruchen()` (145), mit ihrer Art.
 */
export type Anspruch = {
  art: Art
  user_id: string
  hunt_id: string
  jagdname: string
  /**
   * Fensterbeginn `B` (`noch_aus`) bzw. Tagesende `E` (`noch_an`) — die
   * beanspruchte Marke, timestamptz wie PostgREST ihn liefert (z. B.
   * `2026-10-27T06:00:00+00:00`).
   */
  zeitpunkt: string
}

/**
 * Eine RPC-Zeile in einen Anspruch der Art übersetzen. Wirft mit dem
 * Feldnamen, wenn ein Feld fehlt oder der Zeitpunkt nicht lesbar ist
 * (Schlusslesung Route F1): sonst ginge morgens `ttl: null` an Expo, und
 * abends scheiterten Nachricht und Zurückgeben erst nach dem Beanspruchen.
 * Heute unerreichbar — beide RPCs liefern alle vier Felder nicht-null; die
 * Prüfung fängt einen umbenannten Feldnamen. Die Route meldet den Wurf als
 * „Beanspruchen fehlgeschlagen" (500).
 */
export function alsAnspruch(art: Art, zeile: Record<string, unknown>): Anspruch {
  const { rpc, feld } = ARTEN[art]
  for (const f of ['user_id', 'hunt_id', 'jagdname', feld]) {
    if (typeof zeile[f] !== 'string') throw new Error(`${rpc}: Feld ${f} fehlt oder ist kein Text`)
  }
  if (Number.isNaN(Date.parse(zeile[feld] as string))) throw new Error(`${rpc}: ${feld} nicht lesbar: ${zeile[feld]}`)
  return {
    art,
    user_id: zeile.user_id as string,
    hunt_id: zeile.hunt_id as string,
    jagdname: zeile.jagdname as string,
    zeitpunkt: zeile[feld] as string,
  }
}

/** Eine Zeile aus `push_subscriptions` mit `kind = 'expo'`. */
export type Anmeldung = { id: string; user_id: string; subscription: unknown }

export type Nachricht = {
  to: string
  sound: 'default'
  title: string
  body: string
  /**
   * ⛔ **Der Typ bleibt `ortung`, auch abends** (Bauplan CN-427 E7): ein eigener
   * Typ würde von jedem älteren Build abgewiesen, der Tipp öffnete die App
   * ohne Sprung. Die Art steht daneben; morgens bleiben die Daten wie vor
   * CN-427.
   */
  data: { type: 'ortung'; huntId: string } | { type: 'ortung'; huntId: string; art: 'noch_an'; tagesende: string }
  /**
   * Sekunden, die Expo die Nachricht zustellbar hält (CN-426: `ttl` statt
   * `expiration`, `ttl` hat bei Expo Vorrang). Berechnet unmittelbar vor dem
   * Versand, mindestens 1.
   */
  ttl: number
}

export type Ziel = { nachricht: Nachricht; anspruch: number; anmeldungId: string }

export type Ticket =
  | { status: 'ok' }
  | { status: 'error'; message?: string; details?: { error?: string } }

/** Je Chunk: die Tickets in Reihenfolge, oder der Transport scheiterte. */
export type ChunkErgebnis = { offset: number; tickets: Ticket[] | null }

export type Auswertung = {
  /** je Anspruch: mindestens ein Ticket `ok` */
  erfolg: boolean[]
  /** Indizes der Ansprüche, deren Marke zurückgesetzt werden muss */
  zuruecksetzen: number[]
  /** Anmeldungen mit `DeviceNotRegistered` */
  abgemeldet: string[]
  gesendet: number
  /** Meldungen der übrigen Ticket-Fehler, fürs Protokoll */
  ticketFehler: string[]
}

/**
 * Bis wann eine Nachricht zustellbar bleibt (Bauplan CN-427 E5): morgens bis
 * `B + 30 min` (das Fenster des Versands, wie vorher `expiration`), abends bis
 * `E + 3 h 30 min` — 3 h ab dem regulären Sendezeitpunkt, damit ein Gerät ohne
 * Netz am Stand sie auf dem Heimweg noch bekommt. Eine Nachtruhe ist das
 * nicht: bei `E = 22:00` ist sie bis 01:30 zustellbar.
 *
 * ⚠ **Preis, benannt (M14):** eine Wiederholung kurz vor dem Ende des
 * 30-min-Fensters schickt morgens nur wenige Sekunden `ttl`; Android (Doze)
 * stellt sie dann womöglich nie zu — nicht neu gegenüber `expiration`.
 */
const ZUSTELLBAR_MS: Record<Art, number> = {
  noch_aus: 30 * 60 * 1000,
  noch_an: (3 * 60 + 30) * 60 * 1000,
}

function ttl(a: Anspruch, jetzt: number): number {
  return Math.max(1, Math.ceil((Date.parse(a.zeitpunkt) + ZUSTELLBAR_MS[a.art] - jetzt) / 1000))
}

function inhalt(a: Anspruch): Pick<Nachricht, 'title' | 'body' | 'data'> {
  if (a.art === 'noch_an') {
    return {
      title: 'Jagdzeit vorbei',
      body: `Deine Ortung für ‚${a.jagdname}‘ ist noch an. Für heute abmelden?`,
      data: { type: 'ortung', huntId: a.hunt_id, art: 'noch_an', tagesende: new Date(Date.parse(a.zeitpunkt)).toISOString() },
    }
  }
  return {
    title: 'Ortung noch aus',
    body: `Deine Ortung für ‚${a.jagdname}‘ ist noch aus. Wieder einschalten?`,
    data: { type: 'ortung', huntId: a.hunt_id },
  }
}

/**
 * Eine Nachricht je gültigem Expo-Token. `istToken` ist
 * `Expo.isExpoPushToken` (übergeben, damit diese Datei importfrei bleibt):
 * ein fehlgeformter Token liesse sonst die ganze Anfrage scheitern und nach
 * der Regel oben alle Marken zurücksetzen — sechs Takte lang am selben Token
 * (E9, F-C4).
 */
export function baueNachrichten(
  ansprueche: Anspruch[],
  anmeldungen: Anmeldung[],
  istToken: (t: unknown) => boolean,
  jetzt: number = Date.now(),
): Ziel[] {
  const ziele: Ziel[] = []
  ansprueche.forEach((a, i) => {
    for (const an of anmeldungen) {
      if (an.user_id !== a.user_id) continue
      const token = (an.subscription as { expoPushToken?: unknown } | null)?.expoPushToken
      if (typeof token !== 'string' || !istToken(token)) continue
      ziele.push({
        anspruch: i,
        anmeldungId: an.id,
        nachricht: { to: token, sound: 'default', ...inhalt(a), ttl: ttl(a, jetzt) },
      })
    }
  })
  return ziele
}

/**
 * Ordnet die Tickets über den Offset ihres Chunks den Zielen zu
 * (`chunkPushNotifications` erhält die Reihenfolge) und entscheidet je
 * Anspruch. Ein Ziel, dessen Chunk fehlt, gilt als nicht gesendet — also als
 * Transportfehler.
 */
export function werteAus(ziele: Ziel[], chunks: ChunkErgebnis[], anzahlAnsprueche: number): Auswertung {
  const erfolg = new Array<boolean>(anzahlAnsprueche).fill(false)
  const transportFehler = new Array<boolean>(anzahlAnsprueche).fill(false)
  const ticketJeZiel = new Array<Ticket | null>(ziele.length).fill(null)
  // Ein Chunk mit zu vielen oder zu wenigen Tickets kommt hier nicht an:
  // `sendeChunk` in der Route wirft dann (Ticketzahl ≠ Chunklänge).
  for (const c of chunks) c.tickets?.forEach((t, i) => (ticketJeZiel[c.offset + i] = t))

  const abgemeldet: string[] = []
  let gesendet = 0
  const ticketFehler: string[] = []
  ziele.forEach((z, i) => {
    const t = ticketJeZiel[i]
    if (t === null) {
      transportFehler[z.anspruch] = true
    } else if (t.status === 'ok') {
      erfolg[z.anspruch] = true
      gesendet++
    } else if (t.details?.error === 'DeviceNotRegistered') {
      abgemeldet.push(z.anmeldungId)
    } else {
      ticketFehler.push(`${t.details?.error ?? '?'}: ${t.message ?? ''}`)
    }
  })

  const zuruecksetzen: number[] = []
  for (let i = 0; i < anzahlAnsprueche; i++) {
    if (!erfolg[i] && transportFehler[i]) zuruecksetzen.push(i)
  }
  return { erfolg, zuruecksetzen, abgemeldet, gesendet, ticketFehler }
}

/**
 * Die zwei Werte des Compare-and-Swap beim Zurückgeben (E4, Gesamtprüfung
 * S9; für beide Arten gleich, CN-427 E4): verglichen wird gegen genau den
 * beanspruchten Zeitpunkt, gesetzt wird `Zeitpunkt − 1 ms` — NICHT `null`.
 * Mit `null` käme ein früheres, schon zugestelltes Fenster bzw. Tagesende ein
 * zweites Mal, wenn der Jagdleiter es zwischen zwei Versuchen verlegt. Beide
 * als ISO in UTC, damit PostgREST sie in der URL eindeutig liest (ein
 * `+00:00` müsste kodiert werden).
 */
export function casWerte(zeitpunkt: string): { alt: string; neu: string } {
  const ms = Date.parse(zeitpunkt)
  if (Number.isNaN(ms)) throw new Error(`Zeitpunkt nicht lesbar: ${zeitpunkt}`)
  return { alt: new Date(ms).toISOString(), neu: new Date(ms - 1).toISOString() }
}
