import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Expo } from 'expo-server-sdk'
import {
  baueNachrichten,
  casWerte,
  werteAus,
  type Anmeldung,
  type Anspruch,
  type ChunkErgebnis,
  type Ticket,
} from '@/lib/push/ortung-erinnerung'

/**
 * Erinnerung „Ortung noch aus" (CN-416, Migration 144). Bauplan:
 * `quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Ortung_Erinnerung_V1.md`,
 * E4 und E9.
 *
 * **Wer ruft:** ein Coolify-Zeitplan alle 5 min im PWA-Container, per
 * `curl -sS --fail-with-body -m 50 -X POST -H @- http://localhost:3000/api/push/ortung` mit
 * dem Header `x-cron-secret` über die Standardeingabe (der Befehlstext steht
 * in quickhunt-native `AGENTS.md`, Infrastruktur). **Kein Nutzer-JWT** — die
 * Route ist über quickhunt.de aus dem Internet erreichbar und allein durch
 * den Geheimwert geschützt.
 *
 * **Ablauf:** `ortung_erinnerungen_beanspruchen()` setzt je fälligem Fenster
 * die Marke und liefert die Empfänger → alle Expo-Token dieser Nutzer →
 * Versand → Auswertung je Anspruch (`src/lib/push/ortung-erinnerung.ts`) →
 * tote Token aufräumen → gescheiterte Ansprüche per Compare-and-Swap
 * zurückgeben; der nächste Takt im 30-min-Fenster versucht es erneut.
 *
 * **Bewusst NICHT aus `send/route.ts` umgebaut:** die live Push-Route bleibt
 * unberührt. Übernommen sind Token-Filter, `chunkPushNotifications`, das
 * Offset-Mapping und `Promise.allSettled`-Denken je Chunk; das Aufräumen
 * toter Token steht damit zweimal. **Nicht übernommen:** das ungeprüfte
 * DELETE der Vorlage (`send/route.ts:859`) — hier zählt jedes Schreiben.
 *
 * **Gesendet wird per `fetch`, NICHT über `sendPushNotificationsAsync`**
 * (Codex R1, Punkt 4): das SDK reiht Chunks in eine eigene Warteschlange und
 * wiederholt 429 selbst — ohne Abbruchsignal. Nach der Frist sendete es also
 * womöglich noch, während die Route den Anspruch schon zurückgegeben hat:
 * eine Doppel-Push, die über die hingenommene (Expo nahm an, die Antwort
 * kam zu spät) hinausgeht. Ein abgebrochenes `fetch` sendet nichts mehr; ein
 * 429 geht als Transportfehler zurück, der nächste Takt versucht es erneut.
 *
 * **Hingenommen (Bauplan E4):** Doppel-Push, wenn die Frist abläuft, nachdem
 * Expo schon angenommen hat; keine Push für ein Fenster, wenn das
 * Beanspruchen committet und die Antwort verloren geht. Expo-Receipts holt
 * niemand ab (CN-420).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// EINE Frist für den ganzen Lauf (Gesamtprüfung 8b), aufgeteilt: bis 30 s
// Beanspruchen, Token lesen und Versand; bis 40 s Zurückgeben und Aufräumen.
// Beides vor den 50 s von `curl` — sonst liefe die Route weiter, nachdem
// curl aufgegeben hat, und Coolify-Status und Ausgang fielen auseinander.
const VERSAND_FRIST_MS = 30_000
const GESAMT_FRIST_MS = 40_000
// PostgREST kappt Antworten bei `max-rows` (Supabase-Vorgabe 1000).
const MAX_ROWS = 1000
const EXPO_SENDEN = 'https://exp.host/--/api/v2/push/send'

function geheimStimmt(gegeben: string | null, geheim: string): boolean {
  if (gegeben === null) return false
  const a = Buffer.from(gegeben)
  const b = Buffer.from(geheim)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Eine DB-Anfrage mit Frist, doppelt gesichert (Codex R1, Punkt 4): das
 * Signal bricht die Anfrage ab; das Rennen beendet das WARTEN auch dann, wenn
 * ein Signal einmal nicht greift. Läuft die Frist ab, wirft es.
 */
function mitFrist<T>(anfrage: { abortSignal(signal: AbortSignal): PromiseLike<T> }, ms: number): Promise<T> {
  let uhr: ReturnType<typeof setTimeout> | undefined
  const ablauf = new Promise<never>((_, nein) => {
    uhr = setTimeout(() => nein(new Error(`Frist abgelaufen (${ms} ms)`)), ms)
  })
  return Promise.race([Promise.resolve(anfrage.abortSignal(AbortSignal.timeout(ms))), ablauf]).finally(() =>
    clearTimeout(uhr),
  )
}

/** Ein Chunk an Expo — mit echtem Abbruch. Wirft bei jedem Fehler (dann: Transportfehler). */
async function sendeChunk(chunk: unknown[], ms: number): Promise<Ticket[]> {
  const antwort = await fetch(EXPO_SENDEN, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(chunk),
    signal: AbortSignal.timeout(ms),
  })
  // Den Fehlerkörper mitnehmen (Codex DR1): Expo sagt in `errors`, WARUM —
  // ohne ihn stünde im Protokoll nur die Zahl. Gekürzt, er geht ins Log.
  if (!antwort.ok) throw new Error(`Expo antwortet ${antwort.status}: ${(await antwort.text()).slice(0, 500)}`)
  const roh = (await antwort.json()) as { data?: unknown }
  // Wie das SDK: eine Antwort mit anderer Ticketzahl taugt nicht zur Zuordnung.
  if (!Array.isArray(roh.data) || roh.data.length !== chunk.length) {
    throw new Error('Expo: Ticketzahl passt nicht zum Chunk')
  }
  return roh.data as Ticket[]
}

type Zaehler = {
  beansprucht: number
  gesendet: number
  zurueckgegeben: number
  nichtZurueckgegeben: number
  aufgeraeumt: number
  ticketFehler: number
  /** Warum ein Lauf trotz `gesendet` 500 meldet (Codex Rest, Punkt 3). */
  aufraeumenGescheitert: boolean
  vielleichtGekappt: boolean
}

// Liest KEINEN Body (F-D7): der Zeitplan schickt `POST` ohne Rumpf.
export async function POST(request: Request) {
  const geheim = process.env.CRON_SECRET
  // Nie offen, wenn die Konfiguration fehlt.
  if (!geheim) {
    return NextResponse.json({ error: 'CRON_SECRET fehlt' }, { status: 503 })
  }
  if (!geheimStimmt(request.headers.get('x-cron-secret'), geheim)) {
    return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 401 })
  }

  const start = Date.now()
  const rest = (frist: number) => Math.max(1, start + frist - Date.now())
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const z: Zaehler = {
    beansprucht: 0, gesendet: 0, zurueckgegeben: 0, nichtZurueckgegeben: 0, aufgeraeumt: 0, ticketFehler: 0,
    aufraeumenGescheitert: false, vielleichtGekappt: false,
  }

  let ansprueche: Anspruch[]
  try {
    const { data, error } = await mitFrist(supabase.rpc('ortung_erinnerungen_beanspruchen'), rest(VERSAND_FRIST_MS))
    if (error) throw error
    ansprueche = (data ?? []) as Anspruch[]
  } catch (err) {
    // Nichts beansprucht — oder committet und die Antwort verloren (E4, hingenommen).
    console.error('Ortung-Erinnerung: Beanspruchen fehlgeschlagen:', err)
    return NextResponse.json({ error: 'Beanspruchen fehlgeschlagen', ...z }, { status: 500 })
  }
  z.beansprucht = ansprueche.length
  if (ansprueche.length === 0) return NextResponse.json(z)
  // Kappt PostgREST eine Antwort bei `max-rows`, blieben Fenster ohne Push
  // (Codex M1/S7, R1/S7; CN-422). Bei unserer Grösse theoretisch — der Riegel
  // ist, dass es laut wird statt still.
  let vielleichtGekappt = ansprueche.length >= MAX_ROWS
  z.vielleichtGekappt = vielleichtGekappt

  // Ab hier gilt: jeder Fehler vor einem erfolgreichen Ticket gibt den
  // Anspruch zurück (E4). `erfolg` wächst mit der Auswertung; was bis zu einem
  // Wurf keinen Erfolg hatte, geht zurück.
  let erfolg = new Array<boolean>(ansprueche.length).fill(false)

  const zurueckgeben = async (indizes: number[]) => {
    const frist = rest(GESAMT_FRIST_MS)
    await Promise.all(
      indizes.map(async (i) => {
        const a = ansprueche[i]
        try {
          const { alt, neu } = casWerte(a.fensterbeginn)
          const { data, error } = await mitFrist(
            supabase
              .from('hunt_participants')
              .update({ ortung_erinnert_fuer: neu })
              .eq('hunt_id', a.hunt_id)
              .eq('user_id', a.user_id)
              .eq('ortung_erinnert_fuer', alt)
              .select('id'),
            frist,
          )
          if (error) throw error
          // 0 Zeilen heisst „nicht zurückgegeben", nicht Erfolg (S1).
          if (data?.length === 1) z.zurueckgegeben++
          else z.nichtZurueckgegeben++
        } catch (err) {
          console.error('Ortung-Erinnerung: Zurückgeben fehlgeschlagen:', a.hunt_id, a.user_id, err)
          z.nichtZurueckgegeben++
        }
      }),
    )
  }

  try {
    const userIds = [...new Set(ansprueche.map((a) => a.user_id))]
    const anmeldungen = await mitFrist(
      supabase.from('push_subscriptions').select('id, user_id, subscription').eq('kind', 'expo').in('user_id', userIds),
      rest(VERSAND_FRIST_MS),
    )
    if (anmeldungen.error) throw anmeldungen.error
    const geraete = (anmeldungen.data ?? []) as Anmeldung[]
    if (geraete.length >= MAX_ROWS) vielleichtGekappt = z.vielleichtGekappt = true

    const ziele = baueNachrichten(ansprueche, geraete, Expo.isExpoPushToken)
    // Nur fürs Zerlegen: gesendet wird mit `sendeChunk` (Kopf der Datei).
    const chunks = new Expo().chunkPushNotifications(ziele.map((ziel) => ziel.nachricht))
    // chunkPushNotifications erhält die Reihenfolge → globaler Offset genügt.
    let offset = 0
    const ergebnisse: ChunkErgebnis[] = await Promise.all(
      chunks.map(async (chunk) => {
        const eigenerOffset = offset
        offset += chunk.length
        try {
          const tickets = await sendeChunk(chunk, rest(VERSAND_FRIST_MS))
          return { offset: eigenerOffset, tickets }
        } catch (err) {
          console.error('Ortung-Erinnerung: Expo-Chunk fehlgeschlagen:', err)
          return { offset: eigenerOffset, tickets: null }
        }
      }),
    )

    const auswertung = werteAus(ziele, ergebnisse, ansprueche.length)
    erfolg = auswertung.erfolg
    z.gesendet = auswertung.gesendet
    z.ticketFehler = auswertung.ticketFehler.length
    for (const meldung of auswertung.ticketFehler) console.error('Ortung-Erinnerung: Expo-Ticket-Fehler:', meldung)

    // ⚠ ZUERST zurückgeben, DANN aufräumen (Codex R1, Punkt 3): ein hängendes
    // DELETE frässe sonst die Frist, und die Ansprüche blieben ohne Push.
    await zurueckgeben(auswertung.zuruecksetzen)

    let aufraeumenGescheitert = false
    if (auswertung.abgemeldet.length > 0) {
      try {
        const { data, error } = await mitFrist(
          supabase.from('push_subscriptions').delete().in('id', auswertung.abgemeldet).select('id'),
          rest(GESAMT_FRIST_MS),
        )
        if (error) throw error
        z.aufgeraeumt = data?.length ?? 0
      } catch (err) {
        console.error('Ortung-Erinnerung: Aufräumen fehlgeschlagen:', err)
        aufraeumenGescheitert = true
        z.aufraeumenGescheitert = true
      }
    }
    if (vielleichtGekappt) console.error('Ortung-Erinnerung: Antwort womöglich bei max-rows gekappt', z)
    // Laut scheitern: Coolify zeigt den Lauf dann als `failed` (E9).
    const gescheitert = auswertung.zuruecksetzen.length > 0 || aufraeumenGescheitert || vielleichtGekappt
    return NextResponse.json(z, { status: gescheitert ? 500 : 200 })
  } catch (err) {
    console.error('Ortung-Erinnerung: Lauf abgebrochen:', err)
    await zurueckgeben(erfolg.flatMap((ok, i) => (ok ? [] : [i])))
    return NextResponse.json({ error: 'Lauf abgebrochen', ...z }, { status: 500 })
  }
}
