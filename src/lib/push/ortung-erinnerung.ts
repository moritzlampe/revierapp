/**
 * Die Erinnerung „Ortung noch aus" — Nachrichten bauen und die Antwort von
 * Expo je Anspruch auswerten (CN-416, Bauplan
 * `quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Ortung_Erinnerung_V1.md`,
 * E4, E5, E9).
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

/** Eine Zeile aus `ortung_erinnerungen_beanspruchen()` (Migration 144). */
export type Anspruch = {
  user_id: string
  hunt_id: string
  jagdname: string
  /** timestamptz, wie PostgREST ihn liefert (z. B. `2026-10-27T06:00:00+00:00`). */
  fensterbeginn: string
}

/** Eine Zeile aus `push_subscriptions` mit `kind = 'expo'`. */
export type Anmeldung = { id: string; user_id: string; subscription: unknown }

export type Nachricht = {
  to: string
  sound: 'default'
  title: string
  body: string
  data: { type: 'ortung'; huntId: string }
  /** Unix-Sekunden: Fensterbeginn + 30 min (E4, F-C11). */
  expiration: number
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

const FENSTER_MS = 30 * 60 * 1000

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
        nachricht: {
          to: token,
          sound: 'default',
          title: 'Ortung noch aus',
          body: `Deine Ortung für ‚${a.jagdname}‘ ist noch aus. Wieder einschalten?`,
          data: { type: 'ortung', huntId: a.hunt_id },
          expiration: Math.floor((Date.parse(a.fensterbeginn) + FENSTER_MS) / 1000),
        },
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
 * S9): verglichen wird gegen genau den beanspruchten Fensterbeginn, gesetzt
 * wird `B − 1 ms` — NICHT `null`. Mit `null` käme ein früheres, schon
 * zugestelltes Fenster ein zweites Mal, wenn der Jagdleiter `B` zwischen zwei
 * Versuchen löscht. Beide als ISO in UTC, damit PostgREST sie in der URL
 * eindeutig liest (ein `+00:00` müsste kodiert werden).
 */
export function casWerte(fensterbeginn: string): { alt: string; neu: string } {
  const ms = Date.parse(fensterbeginn)
  if (Number.isNaN(ms)) throw new Error(`Fensterbeginn nicht lesbar: ${fensterbeginn}`)
  return { alt: new Date(ms).toISOString(), neu: new Date(ms - 1).toISOString() }
}
