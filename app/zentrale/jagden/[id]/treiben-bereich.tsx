'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Ort } from '../../objekte'
import type { Punkt } from '../../revierkarte-map'
import { imRechteck, type Standgruppe } from '../../revier/standgruppen'
import { schreibe, schreibeViele } from '../../schreiben'
import { sichtbarerName } from '../../namen'
import { vorbereitbar } from '../jagden'
import {
  bearbeitbar,
  markierungAus,
  naechsteSequenz,
  standDiff,
  type Treiben,
} from './treiben'

/**
 * Treiben & Stände — Portal-Phase 4b, Schnitt 1.
 *
 * Was hier geht: Treiben anlegen, umbenennen, löschen und ihre **Standmenge**
 * auf der Karte festlegen. Was NICHT geht: Schützen auf Stände verteilen
 * (Schnitt 2), ein Treiben starten oder beenden (Konzept §3 — der Jagdtag
 * gehört der App), und das Treiben-Polygon zeichnen.
 *
 * **Die Karte ist `revierkarte-map` selbst, nicht eine zweite.** Sie hält keinen
 * eigenen Zustand („sie stellt ihn nur dar"), deshalb kostet eine zweite
 * Betriebsart dort genau eine optionale Prop (`markiert`). Der Container der
 * Revierkarte (`revierkarte.tsx`, 1126 Zeilen mit Objektbearbeitung,
 * Grenzeditor, Papierkorb und Suche) wird bewusst NICHT wiederverwendet — davon
 * braucht ein Treiben nichts, und ihn umzubauen hieße, den live genutzten
 * Revier-Editor für eine neue Seite anzufassen.
 */

/** Eine Rückfrage steht offen — kein Fehler, nichts geschrieben, nichts neu laden. */
class Rueckfrage extends Error {}

/** Wer in einem Treiben eingeteilt ist: Namen für die Rückfrage, Schlüssel (Zeile:Schütze) für den Vergleich. */
interface Belegung {
  namen: string[]
  schluessel: string
}

function gleicheMenge(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}

/** Abgewählte Standzeilen, so wie sie frisch gelesen und bestätigt wurden (B12). */
interface Abwahl {
  /**
   * Die abgewählten Zeilen-IDs, so wie sie ANGEFRAGT wurden. Gegen sie — nicht
   * gegen die gefundenen — prüft der nächste Klick, ob die Bestätigung noch zur
   * Auswahl passt: eine seither verschwundene Zeile ist keine Abweichung, sie
   * wird nur nicht gelöscht (Schlusslesung F1, sonst endlose Rückfrage).
   */
  angefragt: string[]
  /** Zeilen ohne Schützen — gelöscht nur, solange sie leer sind. */
  leer: string[]
  /** Belegte Zeilen samt dem bestätigten Schützen — gelöscht nur mit genau ihm. */
  belegt: { id: string; teilnahmeId: string; text: string }[]
}

// react-leaflet fasst beim Import `window` an — `ssr:false` ist Pflicht, und
// `next/dynamic` mit `ssr:false` geht nur aus einer Client-Komponente heraus.
const Karte = dynamic(() => import('../../revierkarte-map'), {
  ssr: false,
  loading: () => <div className="jagd-treiben-karte-platzhalter">Karte wird geladen …</div>,
})

export default function TreibenBereich({
  jagdId,
  treiben,
  punkte,
  gruppen,
  grenze,
  namen,
}: {
  jagdId: string
  treiben: Treiben[]
  /** Nur Stände: alle 204 Standzeilen im Bestand zeigen auf genau diese drei Typen. */
  punkte: Punkt[]
  /**
   * Standgruppen des Reviers (P2b, Bauplan Verteilen §12 E16) — `null` heisst
   * „nicht ladbar", nie „keine" (S4).
   */
  gruppen: Standgruppe[] | null
  grenze: [number, number][][] | null
  /** teilnahmeId → Anzeigename, für die Rückfragen mit Namen (Bauplan Verteilen B12). */
  namen: Record<string, string>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [offenId, setOffenId] = useState<string | null>(null)
  const [markiert, setMarkiert] = useState<ReadonlySet<string>>(() => new Set())
  const [name, setName] = useState('')
  const [neu, setNeu] = useState('')
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null)
  /** Wer im zu löschenden Treiben eingeteilt ist — frisch gelesen; `null` = liest noch, Text = Fehler. */
  const [loeschBelegung, setLoeschBelegung] = useState<Belegung | string | null>(null)
  /** Belegte Stände in der Abwahl, die bestätigt werden müssen (B12). */
  const [abwahlFrage, setAbwahlFrage] = useState<Abwahl | null>(null)
  /**
   * Ein Zähler je Öffnen der Löschfrage: eine späte Antwort einer früheren
   * Öffnung — auch desselben Treibens — fällt weg, statt die angezeigte
   * Belegung nachträglich zu ersetzen (Codex Delta C1).
   */
  const loeschVersuch = useRef(0)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  /**
   * Der Doppelklick-Riegel ist ein **Ref**, kein State (S5). Zwei schnelle Tipps
   * kommen beide durch, bevor React neu gerendert hat — `laeuft` allein sperrt
   * nur die Anzeige, nicht den zweiten Aufruf.
   */
  const laeuftRef = useRef(false)

  /**
   * Kinomodus und Vollbild — dieselbe Bedienung wie an der Revierkarte
   * (Moritz, 10.08.2026: „kino und vollbildmodus fehlt noch").
   *
   * **Der `fullscreenchange`-Listener ist der Teil, den man vergisst:** der
   * Browser verlässt das Vollbild auch per ESC oder Geste, ohne unseren Knopf zu
   * fragen. Ohne ihn stünde `voll` danach auf `true`, der Knopf hieße „Vollbild
   * beenden" und täte nichts. Die Wahrheit ist `document.fullscreenElement`,
   * nicht unser State — deshalb wird er daraus abgeleitet.
   */
  const kasten = useRef<HTMLDivElement>(null)
  const [voll, setVoll] = useState(false)
  const [kino, setKino] = useState(false)

  useEffect(() => {
    const wechsel = () =>
      // **`kasten.current !== null` ist der Riegel, und ohne ihn entsteht ein
      // Phantomzustand** (Fremdprüfung 10.08.2026, K2): der Editor wird per
      // `offenId` bedingt gerendert, nach dem Speichern räumt `schliessen()` ihn
      // weg. Dann ist `kasten.current` null — und ohne aktives Vollbild ist
      // `document.fullscreenElement` es auch. **`null === null` ist wahr**,
      // `voll` stünde also auf `true`, obwohl kein Vollbild läuft: der
      // Kino-Knopf verschwände (er hängt an `!voll`), und „Vollbild beenden"
      // riefe `exitFullscreen()` ins Leere, dessen Ablehnung hier verschluckt
      // wird. Nur ein Neuladen hülfe.
      setVoll(kasten.current !== null && document.fullscreenElement === kasten.current)
    document.addEventListener('fullscreenchange', wechsel)
    return () => document.removeEventListener('fullscreenchange', wechsel)
  }, [])

  /**
   * **ESC verlässt den Kinomodus** (Fremdprüfung 10.08.2026, O6). Seit er ein
   * Fenster-Overlay ist, verdeckt er die ganze Seite — und eine Fläche, die
   * alles verdeckt, muss auf die Taste hören, mit der man Überlagerungen
   * schließt. Das Vollbild bekommt seine ESC-Behandlung vom Browser; der
   * Kinomodus ist unser eigener Zustand und hätte sonst nur den Mausweg.
   *
   * `capture: false` und die Prüfung auf `kino` sind Absicht: solange kein
   * Kinomodus läuft, fängt hier nichts ab, was ein Formular sonst bekäme.
   */
  useEffect(() => {
    if (!kino) return
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setKino(false)
    }
    document.addEventListener('keydown', taste)
    return () => document.removeEventListener('keydown', taste)
  }, [kino])

  const vollUmschalten = () => {
    if (voll) {
      document.exitFullscreen().catch(() => {})
    } else {
      // Kann vom Browser abgelehnt werden (Berechtigung, iframe) — dann bleibt
      // es beim eingebetteten Kasten, ohne unbehandelte Rejection.
      kasten.current?.requestFullscreen().catch(() => {})
    }
  }

  const offen = treiben.find((t) => t.id === offenId) ?? null

  /**
   * Die Menge, die der Nutzer überhaupt abwählen KANN. Geht so in `standDiff`
   * und ist dort der Riegel, der Ad-hoc-Sitze und Stände auf gelöschten
   * Objekten überleben lässt — beide stehen nicht auf dieser Karte.
   */
  const sichtbar = new Set(punkte.map((p) => p.id))

  const diff = offen ? standDiff(offen.stands, markiert, sichtbar) : { loeschen: [], legen: [] }
  const nameNeu = sichtbarerName(name)
  /**
   * **Bereinigter Entwurf gegen ROHEN DB-Wert — asymmetrisch mit Absicht**
   * (CP-66). Trüge ein Treiben `"Buchenkamp "`, wäre das beim blossen ÖFFNEN
   * schon true und ein Klick schriebe ein ungefragtes Namens-UPDATE.
   *
   * **Nicht hier reparieren:** `offen.name` ebenfalls durch `sichtbarerName`
   * zu ziehen macht so einen Namen UNBEREINIGBAR — man tippt die saubere
   * Fassung, der Knopf bleibt tot, das Leerzeichen für immer drin. Der Riegel
   * sitzt deshalb in Migration 114; dort steht auch, was er nicht fängt.
   */
  const nameGeaendert = offen !== null && nameNeu.length > 0 && nameNeu !== offen.name

  /**
   * **Ein geleertes Namensfeld sperrt das Formular, statt still übergangen zu
   * werden** (C-41, Fremdprüfung 17.08.2026 Nr. 6, `[medium]`).
   *
   * `nameGeaendert` wird bei leerem Namen absichtlich `false`, damit niemand ein
   * Treiben namenlos macht. **Das allein genügt nicht, sobald es einen ZWEITEN
   * Änderungsweg gibt:** hat der Nutzer gleichzeitig einen Stand angetippt, ist
   * `nichtsZuTun` trotzdem `false`. `speichern()` lief, übersprang das
   * Namens-UPDATE stillschweigend, schrieb die Standmenge und **schloss den
   * Editor** — Erfolg gemeldet für ein Formular, dessen geleertes Feld niemand
   * übernommen hat. S4: ein Fehler, der sich als gültige Auskunft liest.
   *
   * **Der Zuschnitt weicht bewusst vom Vorbild ab.** Bei den Standgruppen
   * (`revier/arbeitsbereich.tsx`) ist Umbenennen ein EIGENER Modus, dort gilt je
   * Modus genau eine Bedingung. Hier sind Name und Standmenge EIN Formular mit
   * EINEM Speichern-Knopf — genau daraus entsteht der Fehler. Folge, benannt und
   * gewollt: ein leerer Name sperrt auch das Speichern einer reinen
   * Standänderung. Das ist die Semantik eines leeren Pflichtfelds, und
   * `revier-name.tsx` hält sie seit jeher; ein Speichern, das nur die Hälfte
   * tut, wäre wieder S4.
   *
   * **`nameNeu`, nicht `name`**: `sichtbarerName` räumt unsichtbare Zeichen weg,
   * ein eingefügtes ZWSP ergäbe sonst ein optisch leeres Feld ohne Erklärung bei
   * totem Knopf — dieselbe Begründung wie an `revier-name.tsx`.
   */
  const nameLeer = offen !== null && nameNeu.length === 0
  const speicherbar =
    !nameLeer && (diff.loeschen.length > 0 || diff.legen.length > 0 || nameGeaendert)

  function oeffnen(t: Treiben) {
    setOffenId(t.id)
    setMarkiert(markierungAus(t))
    setName(t.name)
    setFehler(null)
    setLoeschFrage(null)
    setAbwahlFrage(null)
  }

  function schliessen() {
    // **Vollbild verlassen, BEVOR der Kasten aus dem Baum fällt**
    // (Fremdprüfung 10.08.2026, K2). Sonst räumt der Browser es selbst ab, das
    // `fullscreenchange`-Ereignis trifft auf einen bereits entfernten Kasten,
    // und die Größenzustände blieben auf dem Stand von eben stehen — beim
    // nächsten Öffnen wäre die Karte im Kinomodus, ohne dass jemand ihn gewählt
    // hat. Der Riegel im Listener fängt den falschen `voll`-Wert; hier wird der
    // Zustand ordentlich beendet statt nur repariert.
    if (kasten.current && document.fullscreenElement === kasten.current) {
      document.exitFullscreen().catch(() => {})
    }
    setVoll(false)
    setKino(false)
    setOffenId(null)
    setMarkiert(new Set())
    setName('')
    setFehler(null)
    setAbwahlFrage(null)
  }

  function umschalten(standId: string) {
    // **Der Riegel sitzt HIER, nicht an der Prop** (Schlusslesung 10.08.2026,
    // Punkt 11 — der offene Suchauftrag). Vorher stand am Kartenaufruf
    // `aufAuswahl={busy ? undefined : umschalten}`. Das sperrte zwar korrekt,
    // kippte aber bei jedem Speichervorgang den Marker-`key` von „waehlbar" auf
    // „starr" und zurück — und `revierkarte-map` baut die Marker bei einem
    // `key`-Wechsel bewusst neu auf (Leaflet wertet `interactive` nur beim
    // Anlegen aus). Bei Söder sind das ~190 CircleMarker samt Tooltips, zweimal
    // je Speichern: sichtbares Flackern für einen Riegel, den ein früher
    // `return` billiger hat.
    if (laeuftRef.current) return
    // Eine bestätigte Abwahl gilt nur für die Auswahl, zu der sie gestellt wurde.
    setAbwahlFrage(null)
    setMarkiert((vorher) => {
      const nachher = new Set(vorher)
      if (!nachher.delete(standId)) nachher.add(standId)
      return nachher
    })
  }

  /**
   * Eine Standgruppe ins Treiben übernehmen (Konzept Standgruppen §6.2,
   * gelockt): **nur hinzufügen, nie entfernen**, und nur, was auf dieser Karte
   * steht — `sichtbar` hält Nicht-Stände und Objekte im Papierkorb fern, die
   * eine Gruppe tragen darf (112). Eine KOPIE: gespeichert wird über
   * `standDiff` wie jeder Klick, das Treiben zeigt danach nicht auf die Gruppe.
   */
  function hinzufuegen(ids: readonly string[]) {
    if (laeuftRef.current || ids.length === 0) return
    setAbwahlFrage(null)
    setMarkiert((vorher) => new Set([...vorher, ...ids]))
  }
  const gruppeUebernehmen = (gruppe: Standgruppe) => hinzufuegen(gruppe.staende.filter((id) => sichtbar.has(id)))

  /**
   * Rechteckauswahl, additiv wie auf der Revierseite (`arbeitsbereich.tsx`):
   * ein Zug ist dieselbe Handlung wie ein Tipp, nur für mehrere Stände — er
   * steht unter demselben Riegel.
   */
  const rechteck = (a: Ort, b: Ort) => hinzufuegen(imRechteck(punkte, sichtbar, a, b))

  /**
   * Ein Schreibvorgang, ein Riegel, eine Fehlerzeile.
   *
   * `startTransition` um `router.refresh()`, aus demselben Grund wie beim
   * Reviernamen: ohne es ist `laeuft` sofort wieder false, während der Refresh
   * noch unterwegs ist — die Props tragen dann kurz den ALTEN Stand, der Knopf
   * lebt auf, und ein zweiter Klick liefe gegen veraltete Zeilen-Ids.
   */
  async function fuehreAus(was: string, arbeit: () => Promise<void>, danach?: () => void) {
    if (laeuftRef.current) return
    laeuftRef.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await arbeit()
      danach?.()
      startTransition(() => router.refresh())
    } catch (e) {
      if (e instanceof Rueckfrage) return
      // **Der Fehler wird ausgewiesen, nicht verschluckt.** Häufigste Ursache ist
      // ein veralteter Stand: parallel gelöschte Standzeilen (0 statt 1 betroffen)
      // oder ein parallel hinzugefügter Stand (23505 am UNIQUE).
      setFehler(`${was} fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)

      /**
       * **Auch der Fehlschlag lädt neu** (Fremdprüfung 10.08.2026, B5).
       *
       * `speichern()` macht drei Writes; scheitert der zweite, ist der erste
       * bereits geschrieben. Ohne diesen Refresh zeigte die Seite bis zum
       * manuellen Neuladen einen Stand, den es in der DB nicht mehr gibt — und
       * die Fehlerzeile bäte um genau das Neuladen, das der Code selbst tun
       * kann.
       *
       * Der Editor bleibt dabei bewusst OFFEN und `markiert` unangetastet: die
       * Auswahl ist die Absicht des Nutzers, und `diff` rechnet sie nach dem
       * Refresh gegen den frischen Stand neu. Ein zweiter Klick auf Speichern
       * schreibt danach genau das, was noch fehlt, statt in dieselben veralteten
       * Zeilen-Ids zu laufen.
       */
      startTransition(() => router.refresh())
    } finally {
      laeuftRef.current = false
      setLaeuft(false)
    }
  }

  const busy = laeuft || pending

  /**
   * **Die Gates aus Bauplan Verteilen B9, frisch vor einem Write, der Belegung
   * berührt** — Standmenge speichern, Treiben löschen. Die Jagd muss
   * vorbereitbar sein, kein Treiben darf laufen (sonst verschöbe sich der
   * Rückfall im laufenden Treiben), das eigene muss noch geplant sein. RLS
   * prüft keinen Status. Anlegen und Umbenennen berühren weder Belegung noch
   * Rückfall und bleiben deshalb frei (Fable R3-10).
   */
  async function pruefeTreiben(client: ReturnType<typeof createClient>, treibenId: string) {
    const [jagd, alle] = await Promise.all([
      client.from('hunts').select('status').eq('id', jagdId).maybeSingle(),
      client.from('hunt_drives').select('id, name, status').eq('hunt_id', jagdId),
    ])
    if (jagd.error || alle.error) throw new Error(`Der Zustand war nicht zu prüfen: ${(jagd.error ?? alle.error)?.message}`)
    if (!jagd.data || !vorbereitbar(jagd.data.status))
      throw new Error('Diese Jagd ist nicht mehr in Vorbereitung (gestartet, beendet oder nicht erreichbar).')
    const laufend = (alle.data ?? []).find((d) => d.status === 'active')
    if (laufend) throw new Error(`${laufend.name} läuft in der App — erst wieder, wenn es beendet ist.`)
    if ((alle.data ?? []).find((d) => d.id === treibenId)?.status !== 'pending')
      throw new Error('Dieses Treiben ist nicht mehr geplant.')
  }

  function anlegen() {
    const sauber = sichtbarerName(neu)
    if (sauber.length === 0) return
    void fuehreAus(
      'Das Treiben anlegen',
      async () => {
        const client = createClient()
        await schreibe('Das Treiben', () =>
          client
            .from('hunt_drives')
            .insert({
              hunt_id: jagdId,
              name: sauber,
              sequence: naechsteSequenz(treiben),
            })
            .select('id'),
        )
      },
      () => setNeu(''),
    )
  }

  /**
   * Speichern, zweistufig, sobald belegte Stände abgewählt sind (Bauplan
   * Verteilen B12). **Eine Bestätigung aus dem geladenen Bild genügt nicht:**
   * `diff` rechnet aus Props, eine Belegung, die die App seit dem Laden gesetzt
   * hat, ginge still mit. Deshalb werden die abgewählten Zeilen frisch gelesen;
   * stehen Schützen darauf, fragt die Seite mit Namen, und das DELETE ist an
   * genau die bestätigte Belegung gebunden — eine Abweichung meldet
   * `schreibeViele` bzw. `schreibe` laut, statt sie still mitzunehmen.
   */
  function speichern(bestaetigt?: Abwahl) {
    if (!offen || !speicherbar) return
    void fuehreAus(
      'Das Speichern',
      async () => {
        const client = createClient()
        const standmenge = diff.legen.length > 0 || diff.loeschen.length > 0
        if (standmenge) await pruefeTreiben(client, offen.id)

        let abwahl = bestaetigt
        // Eine Bestätigung gilt für genau einen Versuch: scheitert er (eine
        // Belegung hat sich geändert), liest der nächste Klick frisch und fragt
        // mit den neuen Namen, statt dieselbe veraltete Bestätigung zu wiederholen.
        setAbwahlFrage(null)
        // Und nur für genau die Abwahl, zu der sie gestellt wurde: hat ein Refresh
        // `diff` seither verändert, wird frisch gelesen und neu gefragt (Codex C2).
        if (abwahl && !gleicheMenge(abwahl.angefragt, diff.loeschen)) {
          abwahl = undefined
        }
        if (!abwahl && diff.loeschen.length > 0) {
          const { data, error } = await client
            .from('hunt_drive_stands')
            .select('id, participant_id, map_objects ( name )')
            .in('id', diff.loeschen)
          if (error) throw new Error(`Die Belegung war nicht zu prüfen: ${error.message}`)
          const zeilen = (data ?? []) as unknown as { id: string; participant_id: string | null; map_objects: { name: string } | null }[]
          abwahl = {
            angefragt: [...diff.loeschen],
            leer: zeilen.filter((z) => !z.participant_id).map((z) => z.id),
            belegt: zeilen
              .filter((z) => z.participant_id)
              .map((z) => ({
                id: z.id,
                teilnahmeId: z.participant_id as string,
                text: `${namen[z.participant_id as string] ?? 'Unbekannt'} (${z.map_objects?.name ?? 'Stand'})`,
              })),
          }
          if (abwahl.belegt.length > 0) {
            setAbwahlFrage(abwahl)
            throw new Rueckfrage()
          }
        }

        if (nameGeaendert) {
          await schreibe('Der Name des Treibens', () =>
            client.from('hunt_drives').update({ name: nameNeu }).eq('id', offen.id).select('id'),
          )
        }

        /**
         * **Erst LEGEN, dann löschen — und die erste Fassung hatte es umgekehrt**
         * (Fremdprüfung 10.08.2026, B4).
         *
         * Die drei Writes sind drei Transaktionen; PostgREST kennt keine Klammer
         * darum. Bricht der zweite ab, bleibt ein Zwischenzustand stehen — die
         * Frage ist also nicht OB, sondern WELCHER.
         *
         * - erst löschen: Stände sind weg, die neuen fehlen. **Datenverlust**,
         *   samt `participant_id` der gelöschten Zeilen.
         * - erst legen: das Treiben trägt kurz zu VIELE Stände. Sichtbar auf der
         *   Karte, mit einem zweiten Speichern behoben, nichts verloren.
         *
         * Die beiden Mengen sind disjunkt (`loeschen` sind Zeilen-Ids abgewählter
         * Stände, `legen` sind Stand-Ids ohne Zeile) — die Reihenfolge kann also
         * nicht in UNIQUE (drive_id, map_object_id) laufen. Genau das behauptete
         * der Kommentar, der hier stand, und er war der Grund für die schlechtere
         * Reihenfolge.
         *
         * ponytail: eine transaktionale RPC wäre die vollständige Antwort und ist
         * eine Migration (Anker 2, Moritz' Freigabe). Fällig, wenn dieser
         * Zwischenzustand einmal wirklich auftritt — bis dahin kostet die
         * Reihenfolge nichts und nimmt ihm den Schaden.
         */
        if (diff.legen.length > 0) {
          await schreibeViele('Die neuen Stände', diff.legen.length, () =>
            client
              .from('hunt_drive_stands')
              .insert(
                diff.legen.map((mapObjectId) => ({
                  drive_id: offen.id,
                  map_object_id: mapObjectId,
                })),
              )
              .select('id'),
          )
        }
        if (abwahl && abwahl.leer.length > 0) {
          const leer = abwahl.leer
          await schreibeViele('Die abgewählten Stände', leer.length, () =>
            client.from('hunt_drive_stands').delete().in('id', leer).is('participant_id', null).select('id'),
          )
        }
        for (const b of abwahl?.belegt ?? []) {
          await schreibe(`Der Stand von ${b.text}`, () =>
            client
              .from('hunt_drive_stands')
              .delete()
              .eq('id', b.id)
              .eq('participant_id', b.teilnahmeId)
              .select('id'),
          )
        }
      },
      schliessen,
    )
  }

  /**
   * Wer in einem Treiben eingeteilt ist: Namen für die Rückfrage und ein
   * Schlüssel (Zeile + Schütze), gegen den das Löschen nach der Bestätigung
   * frisch vergleicht.
   */
  async function leseBelegung(treibenId: string): Promise<Belegung> {
    const { data, error } = await createClient()
      .from('hunt_drive_stands')
      .select('id, participant_id, map_objects ( name ), hunt_seat_assignments ( seat_name )')
      .eq('drive_id', treibenId)
      .not('participant_id', 'is', null)
    if (error) throw new Error(`Wer eingeteilt ist, ließ sich nicht lesen: ${error.message}`)
    const zeilen = (data ?? []) as unknown as {
      id: string
      participant_id: string
      map_objects: { name: string } | null
      hunt_seat_assignments: { seat_name: string | null } | null
    }[]
    return {
      schluessel: zeilen.map((z) => `${z.id}:${z.participant_id}`).sort().join(','),
      namen: zeilen.map(
        (z) =>
          `${namen[z.participant_id] ?? 'Unbekannt'} (${z.map_objects?.name ?? z.hunt_seat_assignments?.seat_name ?? 'Stand'})`,
      ),
    }
  }

  /** Die Rückfrage zum Treiben-Löschen nennt die Eingeteilten — aus einer frischen Lesung (B12). */
  async function loeschenFragen(t: Treiben) {
    const meins = ++loeschVersuch.current
    setLoeschFrage(t.id)
    setLoeschBelegung(null)
    try {
      const b = await leseBelegung(t.id)
      if (loeschVersuch.current !== meins) return
      setLoeschBelegung(b)
    } catch (e) {
      if (loeschVersuch.current !== meins) return
      setLoeschBelegung(`${e instanceof Error ? e.message : String(e)} — Löschen erst nach erneutem Versuch.`)
    }
  }

  /**
   * `angezeigt` ist der Schlüssel der Belegung, die die Rückfrage GENANNT hat —
   * als Wert übergeben, nicht aus einem Ref gelesen, damit keine späte Antwort
   * ihn zwischen Klick und Vergleich ändern kann (Codex Delta C1).
   */
  function loeschen(t: Treiben, angezeigt: string | null) {
    void fuehreAus(
      'Das Löschen',
      async () => {
        const client = createClient()
        await pruefeTreiben(client, t.id)
        // **Die Belegung nach der Bestätigung noch einmal** (Codex C1): wer
        // seit der Rückfrage eingeteilt wurde, ginge sonst per CASCADE mit, ohne
        // je genannt worden zu sein. Abweichung → neue Rückfrage mit den Namen.
        //
        // Offen bleibt, benannt wie in Bauplan E10 („Was bleibt"): das Fenster
        // zwischen dieser Lesung und dem DELETE. Ganz zu wäre es nur mit einer
        // transaktionalen RPC (Migration, Anker 2).
        const jetzt = await leseBelegung(t.id)
        if (angezeigt === null || jetzt.schluessel !== angezeigt) {
          loeschVersuch.current++
          setLoeschBelegung(jetzt)
          // Ohne angezeigte Belegung (die erste Lesung war gescheitert) hat sich
          // nichts „geändert" — dann sagt der Satz, was wirklich los ist.
          setFehler(
            angezeigt === null
              ? 'Wer eingeteilt ist, ist jetzt gelesen — bitte die Liste bestätigen.'
              : 'Die Belegung hat sich seit der Rückfrage geändert — bitte die neue Liste bestätigen.',
          )
          throw new Rueckfrage()
        }
        // `.eq('status', 'pending')` macht das Gate für DIESES Treiben atomar
        // (Bauplan Verteilen B12, Fable R3-8): startet die App es eine
        // Millisekunde nach der Prüfung, trifft das DELETE 0 Zeilen und
        // `schreibe` meldet es — statt die Belegung eines LAUFENDEN Treibens
        // per Kaskade mitzunehmen.
        await schreibe('Das Treiben', () =>
          client.from('hunt_drives').delete().eq('id', t.id).eq('status', 'pending').select('id'),
        )
      },
      () => {
        setLoeschFrage(null)
        if (offenId === t.id) schliessen()
      },
    )
  }

  return (
    <section className="jagd-treiben" aria-labelledby="jagd-treiben-titel">
      {/* `jagden-abschnitt` ist die Abschnittsüberschrift DIESER Seite — `detail.tsx`
          benutzt sie dreimal, `liste.tsx` einmal, und dieses h2 war die einzige
          Ausnahme (C-40): ohne Klasse greift keine Regel, weder aus `jagden.css`
          noch aus `globals.css`, und sie fiel auf den Browser-Default zurück.
          **Nicht `zentrale-block`**, obwohl die Standgruppen diesen Weg gegangen
          sind: dessen h2 ist versal, gesperrt und sekundär — hier stünde es neben
          drei normalen Abschnittsüberschriften und wäre die zweite Ausnahme
          statt einer Korrektur. */}
      <h2 id="jagd-treiben-titel" className="jagden-abschnitt">
        Treiben &amp; Stände
      </h2>

      {fehler && (
        <p className="zentrale-fehler" role="alert">
          {fehler}
        </p>
      )}

      {treiben.length === 0 ? (
        <p className="zentrale-sub">
          Noch kein Treiben angelegt. Ein Treiben ist eine benannte Auswahl von Ständen — wer sie
          besetzt, kommt später dazu.
        </p>
      ) : (
        <ul className="jagd-treiben-liste" role="list">
          {treiben.map((t) => {
            const adhoc = t.stands.filter((s) => !s.fest).length
            const aenderbar = bearbeitbar(t.status)
            return (
              <li key={t.id} className="jagd-treiben-zeile">
                <div className="jagd-treiben-kopf">
                  <span className="jagd-treiben-nummer">{t.sequence}</span>
                  <span className="jagd-treiben-name">{t.name}</span>
                  <span className="zentrale-pill">
                    {t.stands.length} {t.stands.length === 1 ? 'Stand' : 'Stände'}
                    {/* Ad-hoc-Sitze zählen mit, sind aber nicht auf dieser Karte
                        wählbar — das gehört ausgewiesen, sonst sucht der
                        Jagdleiter einen Stand, den er nie findet. */}
                    {adhoc > 0 ? ` (${adhoc} aus der App)` : ''}
                  </span>
                  {!aenderbar && <span className="zentrale-pill">{t.status}</span>}
                </div>

                <div className="jagd-treiben-knoepfe">
                  {aenderbar ? (
                    <button
                      type="button"
                      className="zentrale-knopf"
                      onClick={() => (offenId === t.id ? schliessen() : oeffnen(t))}
                      disabled={busy}
                    >
                      {offenId === t.id ? 'Schließen' : 'Stände wählen'}
                    </button>
                  ) : (
                    // Ein gelaufenes Treiben ist ein Protokoll des Jagdtags. Der
                    // Knopf fehlt, statt zu erscheinen und abgewiesen zu werden.
                    <span className="zentrale-sub">gelaufen — nicht mehr änderbar</span>
                  )}

                  {/**
                   * **Auch das LÖSCHEN hängt an `aenderbar`, und in der ersten
                   * Fassung tat es das nicht** (Fremdprüfung 10.08.2026, B6,
                   * `[high]`). Der Statuszweig darüber sperrte nur den Editor —
                   * der Löschknopf stand unverändert an einem `active` oder
                   * `completed` Treiben. Ein Klick hätte per `ON DELETE CASCADE`
                   * die Standzeilen samt `participant_id` mitgenommen, also das
                   * Protokoll eines gelaufenen Jagdtags.
                   *
                   * Das ist ein UI-Gate. **RLS kennt den Status nicht** — sie
                   * fragt nur nach Jagdleiterschaft. **Für das Treiben selbst
                   * ist das Rennen seit P2a zu** (Bauplan Verteilen B12): das
                   * DELETE trägt `.eq('status', 'pending')`, und davor prüft
                   * `pruefeTreiben` frisch. Offen bleibt es für die
                   * STANDZEILEN beim Speichern einer Standmenge — dort bräuchte
                   * eine atomare Statusprüfung eine Policy oder RPC, also eine
                   * Migration (Anker 2); gebunden ist dort die Belegung.
                   */}
                  {!aenderbar ? null : loeschFrage === t.id ? (
                    <>
                      <span className="jagd-treiben-frage">
                        Löschen? Die {t.stands.length} zugeordneten Stände gehen mit
                        {loeschBelegung === null
                          ? ' — Belegung wird gelesen …'
                          : typeof loeschBelegung === 'string'
                            ? `. ${loeschBelegung}`
                            : loeschBelegung.namen.length === 0
                              ? '; niemand ist eingeteilt.'
                              : `, eingeteilt sind: ${loeschBelegung.namen.join(', ')}.`}
                      </span>
                      <button
                        type="button"
                        className="zentrale-knopf"
                        onClick={() =>
                          loeschen(t, typeof loeschBelegung === 'object' && loeschBelegung ? loeschBelegung.schluessel : null)
                        }
                        disabled={busy || loeschBelegung === null}
                      >
                        Ja, löschen
                      </button>
                      <button
                        type="button"
                        className="zentrale-abbrechen"
                        onClick={() => {
                          loeschVersuch.current++
                          setLoeschFrage(null)
                        }}
                        disabled={busy}
                      >
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="zentrale-knopf"
                      onClick={() => void loeschenFragen(t)}
                      disabled={busy}
                    >
                      Löschen
                    </button>
                  )}
                </div>

                {offenId === t.id && (
                  <div className="jagd-treiben-editor">
                    <label className="jagd-treiben-feld">
                      <span>Name</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={busy}
                        // Kein `maxLength`: hier stand 120, eine erfundene
                        // Zahl, an der der Browser eingefügten Text still
                        // abschnitt — gespeichert wurde der gekürzte Name, und
                        // gemeldet wurde Erfolg (CP-65, dieselbe S4-Familie wie
                        // C-41, nur leiser). Grenzen gehören in die DB, wo sie
                        // für beide Clients gelten; eine LÄNGE hat dort keine
                        // Textspalte dieses Projekts (111). Wie `revier-name.tsx`.
                        //
                        // Beides aus dem Vorbild `revier-name.tsx` (dort aus der
                        // Fremdprüfung R8): ohne die Verbindung gehört die
                        // Meldung zu gar nichts, ein Screenreader liest das Feld
                        // vor und den Satz darunter nie.
                        //
                        // **Was sie NICHT leistet, damit es niemand annimmt**
                        // (Schlusslesung 19.08.2026): ein `aria-describedby`,
                        // das gesetzt wird, während der Fokus schon im Feld
                        // steht, wird von den gängigen Screenreadern nicht
                        // sofort angesagt, sondern erst beim nächsten Fokus auf
                        // das Feld. Für eine sofortige Ansage bräuchte das `<p>`
                        // zusätzlich `role="status"`. Bewusst nicht gemacht —
                        // derselbe abgenommene Zuschnitt wie im Vorbild.
                        aria-invalid={nameLeer}
                        aria-describedby={nameLeer ? 'jagd-treiben-namenshinweis' : undefined}
                      />
                    </label>
                    {/* Die Meldung steht UNTER dem Feld, nicht im Band der Karte:
                        sie gehört zum Formular. Feste ID: `offenId` ist ein
                        einzelner Wert, es kann nie ein zweiter Editor offen sein. */}
                    {nameLeer && (
                      <p className="zentrale-hinweis" id="jagd-treiben-namenshinweis">
                        Ein Treiben braucht einen Namen.
                      </p>
                    )}

                    {/* Gruppen übernehmen (E16). Die Zahl zählt nur, was noch
                        hinzukommt — eine Gruppe, die schon ganz drin ist, hat 0. */}
                    {gruppen === null ? (
                      <p className="zentrale-hinweis">
                        Die Standgruppen ließen sich nicht laden — Stände einzeln wählen geht weiter.
                      </p>
                    ) : gruppen.length === 0 ? (
                      <p className="zentrale-sub">Keine Standgruppen — anlegen lassen sie sich unter „Revier“.</p>
                    ) : (
                      <div className="jagd-treiben-knoepfe" role="group" aria-label="Standgruppen übernehmen">
                        {gruppen.map((g) => {
                          const neu = g.staende.filter((id) => sichtbar.has(id) && !markiert.has(id)).length
                          return (
                            <button
                              key={g.id}
                              type="button"
                              className="zentrale-abbrechen"
                              disabled={busy || neu === 0}
                              onClick={() => gruppeUebernehmen(g)}
                            >
                              + {g.name} ({neu})
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* **`zentrale-karte-kasten` ist die vorhandene Klasse der
                        Revierkarte, keine zweite.** Sie bringt 420 px Standard,
                        `.kino` mit 78vh und `:fullscreen` mit 100vh/100vw schon
                        mit — und damit ist die Karte hier exakt so groß wie
                        dort, in allen drei Zuständen. Eine eigene Höhe wäre eine
                        zweite Wahrheit über dieselbe Geste. */}
                    <div
                      ref={kasten}
                      className={`zentrale-karte-kasten${kino ? ' kino' : ''}`}
                    >
                      {/**
                       * **Die Leiste liegt IM Kasten, und in der ersten Fassung
                       * lag sie darüber** (Fremdprüfung 10.08.2026, K1).
                       *
                       * `requestFullscreen()` läuft auf `kasten` — im Vollbild
                       * ist deshalb nur sichtbar, was ein Nachkomme davon ist.
                       * Ein Geschwister-Knopf „Vollbild beenden" wird gerendert
                       * und ist unbedienbar; wer die ESC-Geste nicht kennt,
                       * sitzt fest. Die Revierkarte macht es seit jeher richtig,
                       * ihre `.zentrale-karte-knoepfe` hängen am Kasten.
                       *
                       * Der Zähler wandert mit: im Vollbild ist er die einzige
                       * Rückmeldung darüber, was ein Klick gerade bewirkt hat.
                       * **Speichern und Abbrechen bleiben dagegen unten** — sie
                       * gehören zum Formular, nicht zur Karte, und ein
                       * Schreibpfad im Vollbild wäre ein zweiter Bedienweg für
                       * dieselbe Sache. Der Weg ist: wählen, Vollbild beenden,
                       * speichern.
                       */}
                      <div className="zentrale-karte-knoepfe">
                        {/* Die vorhandene Klasse aus `zentrale.css`, nicht die
                            eigene — Begründung im Grabstein in `jagden.css`. */}
                        <span className="zentrale-karte-zaehler">
                          {markiert.size} gewählt
                          {diff.legen.length > 0 ? ` · +${diff.legen.length}` : ''}
                          {diff.loeschen.length > 0 ? ` · −${diff.loeschen.length}` : ''}
                        </span>
                        {/* Im Vollbild sinnlos — die Zwischengröße ist dort keine
                            Größe mehr. Wortgleich zur Revierkarte, damit dieselbe
                            Geste hier nicht anders heißt. */}
                        {!voll && (
                          <button type="button" onClick={() => setKino((k) => !k)} disabled={busy}>
                            {kino ? 'Kleiner' : 'Kinomodus'}
                          </button>
                        )}
                        <button type="button" onClick={vollUmschalten} disabled={busy}>
                          {voll ? 'Vollbild beenden' : 'Vollbild'}
                        </button>
                      </div>
                      <div className="zentrale-karte-buehne">
                        <Karte
                          grenze={grenze}
                          punkte={punkte}
                          markiert={markiert}
                          aufAuswahl={umschalten}
                          aufRechteck={rechteck}
                        />
                      </div>
                      {/* **Pflicht, nicht Komfort** (C-45, Fable F4): solange der
                          Editor offen ist, zieht die Maus ein Auswahlrechteck statt
                          der Karte — `RechteckWahl` schaltet das Kartenziehen ab.
                          Wie auf der Revierseite im Stände-Modus, und **im Kasten**,
                          damit der Satz auch im Vollbild steht (Codex D6). */}
                      <p className="zentrale-karte-hinweis">
                        In die Karte tippen nimmt einen Stand ins Treiben auf oder heraus · ein Rechteck
                        ziehen nimmt alle darin auf · zum Verschieben der Karte am Rad zoomen
                      </p>
                    </div>

                    {abwahlFrage && (
                      <p className="jagd-treiben-frage" role="alert">
                        Abgewählt sind belegte Stände: {abwahlFrage.belegt.map((b) => b.text).join(', ')}.
                        Beim Speichern verlieren sie dort ihren Stand in diesem Treiben.
                      </p>
                    )}
                    <div className="jagd-treiben-knoepfe">
                      <button
                        type="button"
                        className="zentrale-knopf"
                        onClick={() => speichern(abwahlFrage ?? undefined)}
                        disabled={busy || !speicherbar}
                      >
                        {busy ? 'Speichert …' : abwahlFrage ? 'Ja, trotzdem speichern' : 'Speichern'}
                      </button>
                      <button
                        type="button"
                        className="zentrale-abbrechen"
                        onClick={schliessen}
                        disabled={busy}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="jagd-treiben-neu">
        <label className="jagd-treiben-feld">
          <span>Neues Treiben</span>
          <input
            type="text"
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            placeholder="z. B. Buchenkamp"
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="zentrale-knopf"
          onClick={anlegen}
          // `sichtbarerName`, nicht `neu.trim()`: ein eingefügtes ZWSP ergäbe
          // sonst `length === 1` und ein sichtbar leeres Treiben.
          disabled={busy || sichtbarerName(neu).length === 0}
        >
          Anlegen
        </button>
      </div>
    </section>
  )
}
