'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { vollstaendig } from '../../laden'
import { STAND_TYPEN } from '../../objekte'
import type { Punkt } from '../../revierkarte-map'
import { schreibe, SchreibFehler } from '../../schreiben'
import { vorbereitbar } from '../jagden'
import {
  angebote,
  baueMatrix,
  bild,
  gleichesBild,
  JAGDWEIT,
  kartenNamen,
  leerenText,
  umsetzFehler,
  UmsetzenUnbestaetigt,
  zuweisbar,
  type Angebot,
  type Bild,
  type DriveRow,
  type Pruefung,
  type SeatRow,
  type Sperre,
  type Spalte,
  type TeilnehmerRoh,
  type VerteilenDaten,
  type Zeile,
  type Zelle,
} from './verteilen'

/**
 * Schützen verteilen — Portal P2a (Bauplan Verteilen V2.2, E1–E10).
 *
 * Eine Matrix Schützen × (Jagdweit, Treiben 1…n); die Karte zeigt die gewählte
 * Spalte mit Namen. Geschrieben wird nur über die RPCs aus 141
 * (`stand_umsetzen`, `treiben_stand_umsetzen`) — sie setzen um, sie tauschen
 * nicht (D3). Die Rechenregeln stehen in `verteilen.ts`, hier nur Anzeige und
 * Schreibweg.
 */

const Karte = dynamic(() => import('../../revierkarte-map'), {
  ssr: false,
  loading: () => <div className="jagd-treiben-karte-platzhalter">Karte wird geladen …</div>,
})

/**
 * **Ein Write zur Zeit auf der ganzen Seite, nicht je Zelle** (E1). Sonst
 * laufen zwei Zellen auf denselben Stand, und die Kontroll-Lesung der ersten
 * meldet einen gelungenen, aber überschriebenen Write als „nicht bestätigt".
 * Auf Modulebene wie in `vorlage-speichern.tsx`: eine neu gemountete Instanz
 * bekäme sonst einen frischen Riegel, während der alte Write noch läuft.
 */
let schreibtGerade = false

/** Was die Seite serverseitig lädt — serialisierbar, die Maps baut der Client. */
export interface VerteilenProps {
  jagdId: string
  revierId: string
  teilnehmer: TeilnehmerRoh[]
  namen: Record<string, string>
  sitze: SeatRow[]
  treiben: DriveRow[]
  objekte: { id: string; name: string }[]
  /** `null` = der Prüfstand war nicht ladbar (S4). */
  pruefung: Record<string, Pruefung> | null
  punkte: Punkt[]
  grenze: [number, number][][] | null
}

const SITZ_SELECT = 'id, user_id, seat_id, seat_type, seat_name, position_lat, position_lng, map_objects ( name )'
const TREIBEN_SELECT =
  'id, name, sequence, status, hunt_drive_stands ( id, map_object_id, seat_assignment_id, participant_id, map_objects ( name ), hunt_seat_assignments ( seat_name ) )'
const TEILNEHMER_SELECT = 'id, user_id, role, status, entfernt_am'

/** Eine offene Rückfrage — sie hängt an IDs und am Bild, nicht an der Zeilenposition (E1). */
interface Frage {
  teilnahmeId: string
  spalte: string
  standId: string | null
  bild: Bild
}

/** Die Rückfrage gilt nicht mehr — nichts geschrieben (E10). */
class Abweichung extends Error {}

/**
 * Nur „gesperrt" heisst etwas anderes tun (entsperren); ein Prüfstand, der
 * erst bei der frischen Lesung nicht ladbar war, heisst „gleich noch einmal"
 * (Delta-Schlusslesung, S4); alles andere heisst neu wählen.
 */
function abweichungsText(vorher: Bild, nachher: Bild | null): string {
  if (nachher?.zielSperre === 'gesperrt') return 'Der Stand ist inzwischen gesperrt. Nichts geschrieben.'
  const neuUnbekannt = (a: Sperre | undefined, b: Sperre | undefined) => b === 'unbekannt' && a !== 'unbekannt'
  if (
    nachher &&
    (neuUnbekannt(vorher.zielSperre, nachher.zielSperre) ||
      neuUnbekannt(vorher.rueckfall?.sperre, nachher.rueckfall?.sperre))
  )
    return 'Ob der Stand gesperrt ist, ließ sich gerade nicht feststellen. Nichts geschrieben — bitte noch einmal wählen.'
  return 'Die Belegung hat sich inzwischen geändert. Nichts geschrieben — bitte neu wählen.'
}

export default function VerteilenBereich(props: VerteilenProps) {
  const { jagdId, revierId } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [laeuftZelle, setLaeuftZelle] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [frage, setFrage] = useState<Frage | null>(null)
  const [offen, setOffen] = useState<{ teilnahmeId: string; spalte: string; ort: DOMRect } | null>(null)
  const [kartenSpalte, setKartenSpalte] = useState(JAGDWEIT)
  /** Wohin der Fokus nach Escape oder einer abgeschlossenen Auswahl zurückkehrt (E1). */
  const fokusZiel = useRef<string | null>(null)

  const daten: VerteilenDaten = useMemo(
    () => ({
      teilnehmer: props.teilnehmer,
      namen: new Map(Object.entries(props.namen)),
      sitze: props.sitze,
      treiben: props.treiben,
      objekte: props.objekte,
      pruefung: props.pruefung ? new Map(Object.entries(props.pruefung)) : null,
    }),
    [props.teilnehmer, props.namen, props.sitze, props.treiben, props.objekte, props.pruefung],
  )
  const matrix = useMemo(() => baueMatrix(daten), [daten])
  const busy = laeuftZelle !== null || pending

  // Nach jedem Refresh: eine offene Rückfrage, deren Ausgangszustand nicht mehr
  // gilt, schliesst sich mit Hinweis statt zu schreiben (E1, E10). Eine offene
  // Liste schliesst sich immer.
  useEffect(() => {
    if (frage && !gleichesBild(frage.bild, bild(daten, frage.spalte, frage.teilnahmeId, frage.standId))) {
      setFrage(null)
      setFehler('Die Belegung hat sich inzwischen geändert — die Rückfrage ist geschlossen. Bitte neu wählen.')
    }
    // Jede offene Liste schliesst: neue Daten können das Layout verschieben,
    // und die Liste stünde dann über einer fremden Zeile (Codex Delta 2).
    if (offen) setOffen(null)
    // Nur auf neue Daten reagieren, nicht auf das Öffnen selbst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daten])

  // Fokus zurück auf die Zelle — über IDs bestimmt, auch nach einem Refresh (E1).
  useEffect(() => {
    if (busy || offen || frage || !fokusZiel.current) return
    document.querySelector<HTMLElement>(`[data-zelle="${CSS.escape(fokusZiel.current)}"]`)?.focus()
    fokusZiel.current = null
  })

  const spalteVon = (schluessel: string) => matrix.spalten.find((s) => s.schluessel === schluessel)

  /**
   * Auswahl in einer Zelle. Erst die Rückfrage aus dem GELADENEN Bild (E3,
   * E6) — gelesen wird erst nach der Bestätigung (E10), weil eine Rückfrage
   * beliebig lange offen stehen kann.
   */
  function waehlen(teilnahmeId: string, spalte: string, standId: string | null) {
    fokusZiel.current = `${teilnahmeId}|${spalte}`
    setOffen(null)
    setFehler(null)
    const b = bild(daten, spalte, teilnahmeId, standId)
    if (!b) return
    if (b.frage || b.zielSperre === 'unbekannt') {
      setFrage({ teilnahmeId, spalte, standId, bild: b })
      return
    }
    void schreiben({ teilnahmeId, spalte, standId, bild: b })
  }

  async function schreiben(f: Frage) {
    if (schreibtGerade) return
    schreibtGerade = true
    setFrage(null)
    setLaeuftZelle(`${f.teilnahmeId}|${f.spalte}`)
    try {
      const client = createClient()
      const frisch = await frischLesen(client)

      // Gates (B9): Jagd vorbereitbar, kein Treiben läuft, Zieltreiben geplant.
      const laufend = frisch.treiben.find((t) => t.status === 'active')
      if (laufend) throw new Abweichung(`${laufend.name} läuft in der App — verteilen erst wieder, wenn es beendet ist.`)
      if (f.spalte !== JAGDWEIT && frisch.treiben.find((t) => t.id === f.spalte)?.status !== 'pending')
        throw new Abweichung('Dieses Treiben ist nicht mehr geplant (gelöscht, gestartet oder beendet). Nichts geschrieben.')

      const neu = bild(frisch, f.spalte, f.teilnahmeId, f.standId)
      if (!neu || !gleichesBild(f.bild, neu)) throw new Abweichung(abweichungsText(f.bild, neu))
      // Doppelt zum Bildvergleich, mit Absicht: D2 ist der eine harte Riegel
      // („wie die App sperren") und soll nicht davon abhängen, dass Vergleich
      // und Oberfläche fehlerfrei sind.
      if (!neu.empfaengerZuweisbar) throw new Abweichung(abweichungsText(f.bild, neu))
      if (neu.zielSperre === 'gesperrt') throw new Abweichung('Der Stand ist gesperrt. Nichts geschrieben.')

      if (f.spalte === JAGDWEIT) {
        const t = frisch.teilnehmer.find((x) => x.id === f.teilnahmeId)
        const nutzer = f.standId === null ? null : (t?.user_id ?? null)
        const sitzId = neu.zeileId ?? (await sitzAnlegen(client, f.standId as string))
        await umsetzen(client, 'stand_umsetzen', { p_sitz: sitzId, p_nutzer: nutzer as string }, 'hunt_seat_assignments', 'user_id', sitzId, nutzer)
      } else {
        const person = f.standId === null ? null : f.teilnahmeId
        await umsetzen(
          client,
          'treiben_stand_umsetzen',
          { p_stand: neu.zeileId as string, p_teilnahme: person as string },
          'hunt_drive_stands',
          'participant_id',
          neu.zeileId as string,
          person,
        )
      }
    } catch (e) {
      setFehler(e instanceof Abweichung ? e.message : umsetzFehler(e))
    } finally {
      schreibtGerade = false
      setLaeuftZelle(null)
      // Auch nach einem Fehlschlag neu laden: das Bild ist dann ohnehin veraltet.
      startTransition(() => router.refresh())
    }
  }

  /**
   * Alles, wovon die Rückfrage abhing, frisch und unabhängig in EINEM
   * `Promise.all` (E10): Jagdzustand, alle Treiben samt Ständen, Sitzordnung,
   * alle Teilnehmer, Prüfstand — **und die Objektliste**: sie ist die Bindung
   * an das Revier (B6), und ein Stand, der seit dem Laden im Papierkorb liegt,
   * fiele sonst nicht auf (Codex A1/B3). Mit Zähler wie beim Laden der Seite
   * (`vollstaendig`, Codex B1): eine gekappte Liste ist kein Bild.
   */
  async function frischLesen(client: ReturnType<typeof createClient>): Promise<VerteilenDaten> {
    const [jagd, treiben, sitze, teilnehmer, objekte, pruefung] = await Promise.all([
      client.from('hunts').select('status').eq('id', jagdId).maybeSingle(),
      client.from('hunt_drives').select(TREIBEN_SELECT, { count: 'exact' }).eq('hunt_id', jagdId),
      client.from('hunt_seat_assignments').select(SITZ_SELECT, { count: 'exact' }).eq('hunt_id', jagdId),
      client.from('hunt_participants').select(TEILNEHMER_SELECT, { count: 'exact' }).eq('hunt_id', jagdId),
      client.from('map_objects').select('id, name', { count: 'exact' }).eq('district_id', revierId).in('type', STAND_TYPEN),
      client
        .from('map_object_letzte_pruefung')
        .select('map_object_id, status, checked_at', { count: 'exact' })
        .eq('district_id', revierId),
    ])
    if (jagd.error) throw new Error(`Der Zustand der Jagd war nicht zu prüfen: ${jagd.error.message}`)
    if (!jagd.data) throw new Abweichung('Diese Jagd ist nicht mehr erreichbar — gelöscht, oder die Leitung liegt nicht mehr bei dir.')
    if (!vorbereitbar(jagd.data.status))
      throw new Abweichung('Diese Jagd wurde inzwischen gestartet oder beendet. Ab da gehört sie der Feld-App.')
    // Ein Ladefehler oder eine Kappung des Prüfstands ist „unbekannt", nie
    // „nicht gesperrt" (S4) — wie in `page.tsx`. Den Prüfer braucht die
    // Rückfrage nicht, nur den Status.
    let pruefstand: VerteilenDaten['pruefung'] = null
    try {
      pruefstand = new Map(
        vollstaendig<{ map_object_id: string; status: string; checked_at: string }>(pruefung, 'Prüfstand').map((p) => [
          p.map_object_id,
          { status: p.status, checked_at: p.checked_at, pruefer: null },
        ]),
      )
    } catch {
      pruefstand = null
    }
    return {
      ...daten,
      treiben: vollstaendig<DriveRow>(treiben, 'Die Treiben'),
      sitze: vollstaendig<SeatRow>(sitze, 'Die Sitzordnung'),
      teilnehmer: vollstaendig<TeilnehmerRoh>(teilnehmer, 'Die Teilnehmer'),
      objekte: vollstaendig<{ id: string; name: string }>(objekte, 'Die Stände'),
      pruefung: pruefstand,
    }
  }

  /**
   * Die jagdweite Sitzzeile anlegen, wo sie fehlt (E2). `23505` heisst „gibt
   * es schon": dann nur eine `assigned`-Zeile ohne Person weiterbenutzen —
   * einen anderen Typ lehnt das Portal ab (die App ignorierte die Zuteilung),
   * und eine inzwischen besetzte ist eine neue Lage (Fable R3-6).
   */
  async function sitzAnlegen(client: ReturnType<typeof createClient>, standId: string): Promise<string> {
    try {
      const neu = await schreibe('Der Sitz', () =>
        client
          .from('hunt_seat_assignments')
          .insert({ hunt_id: jagdId, seat_id: standId, seat_type: 'assigned' })
          .select('id'),
      )
      return (neu as { id: string }).id
    } catch (e) {
      if (!(e instanceof SchreibFehler) || e.code !== '23505') throw e
      const { data, error } = await client
        .from('hunt_seat_assignments')
        .select('id, seat_type, user_id')
        .eq('hunt_id', jagdId)
        .eq('seat_id', standId)
        .maybeSingle()
      if (error || !data) throw new Abweichung('Der Sitz ließ sich weder anlegen noch lesen. Nichts geschrieben.')
      if (data.seat_type !== 'assigned')
        throw new Abweichung('Auf diesem Stand liegt ein Sitz anderer Art (aus der App) — bitte dort prüfen.')
      if (data.user_id !== null) throw new Abweichung('Auf dem Stand steht inzwischen jemand. Nichts geschrieben — bitte neu wählen.')
      return data.id as string
    }
  }

  /** RPC, dann Kontroll-Lesung — `204` ohne Inhalt bestätigt nichts (S1, wie nativ). */
  async function umsetzen(
    client: ReturnType<typeof createClient>,
    rpc: 'stand_umsetzen' | 'treiben_stand_umsetzen',
    args: Record<string, string>,
    tabelle: 'hunt_seat_assignments' | 'hunt_drive_stands',
    spalte: 'user_id' | 'participant_id',
    zeileId: string,
    erwartet: string | null,
  ) {
    const { error } = await client.rpc(rpc, args)
    // **Nur eine Antwort des Servers ist eine Ablehnung** (SQLSTATE im `code`).
    // Ohne Code — Netz weg, Antwort verloren, Kante der Cloudflare — ist offen,
    // ob die Transaktion lief (Codex B2): dann entscheidet die Kontroll-Lesung,
    // und scheitert auch sie, heisst es „nicht bestätigt", nicht „fehlgeschlagen".
    if (error?.code) throw error
    const { data, error: leseFehler, status } = await client.from(tabelle).select(spalte).eq('id', zeileId).maybeSingle()
    const wert = (data as Record<string, string | null> | null)?.[spalte]
    if (leseFehler || status !== 200 || !data || wert !== erwartet) throw new UmsetzenUnbestaetigt()
  }

  const kartenTitel = spalteVon(kartenSpalte)?.titel ?? 'Jagdweit'
  const belegung = useMemo(() => kartenNamen(daten, kartenSpalte), [daten, kartenSpalte])

  return (
    <section className="jagd-verteilen" aria-labelledby="jagd-verteilen-titel">
      <h2 id="jagd-verteilen-titel" className="jagden-abschnitt">
        Schützen verteilen
      </h2>

      {/* Bis die Sichtgrenze steht (CP-116), sieht ein zugesagter Schütze sofort,
          was hier geplant wird — damit niemand im Glauben plant, es sei
          verborgen (Bauplan §9 D1, ganze Matrix). */}
      <p className="zentrale-hinweis">
        Zugesagte Schützen sehen derzeit sofort: ihren jagdweiten Stand im Banner der App und alle
        ihre Stände (auch aus geplanten Treiben) auf der Karte. Den Stand eines Treibens nennt der
        Banner erst beim Start.
      </p>

      {matrix.laeuft && (
        <p className="zentrale-fehler" role="status">
          {matrix.laeuft} läuft in der App — verteilen erst wieder, wenn es beendet ist.
        </p>
      )}

      {fehler && (
        <p className="zentrale-fehler" role="alert">
          {fehler}
        </p>
      )}

      {frage && (
        <div className="jagd-verteilen-frage" role="alertdialog" aria-labelledby="jagd-verteilen-frage-text">
          <p id="jagd-verteilen-frage-text">
            {frage.bild.zielSperre === 'unbekannt' &&
              'Ob dieser Stand gesperrt ist, lässt sich gerade nicht feststellen. Trotzdem einteilen? '}
            {frage.bild.frage}
          </p>
          <div className="jagd-treiben-knoepfe">
            <button type="button" className="zentrale-knopf" onClick={() => void schreiben(frage)} disabled={busy}>
              {frage.bild.verdraengt ? `${frage.bild.verdraengt.name} umsetzen` : 'Trotzdem einteilen'}
            </button>
            <button type="button" className="zentrale-abbrechen" onClick={() => setFrage(null)} disabled={busy}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {matrix.zeilen.length === 0 ? (
        <p className="zentrale-sub">Noch niemand eingeladen — wer zusagt oder eingeladen ist, steht hier.</p>
      ) : (
        <Tabelle
          zeilen={matrix.zeilen}
          spalten={matrix.spalten}
          laeuftZelle={laeuftZelle}
          gesperrt={busy || frage !== null}
          kartenSpalte={kartenSpalte}
          aufKarte={setKartenSpalte}
          // Die Fehlerzeile bleibt beim Öffnen stehen: verschwände sie, rutschte
          // die Tabelle nach dem Messen von `ort` nach oben, und die Liste stünde
          // über einer fremden Zeile. Geleert wird sie erst beim Wählen.
          aufOeffnen={(teilnahmeId, spalte, ort) => setOffen({ teilnahmeId, spalte, ort })}
        />
      )}

      {matrix.ausgeschiedene.length > 0 && (
        <div className="jagd-verteilen-ausgeschieden">
          <p className="zentrale-sub">
            Ausgeschieden, hält in der App aber noch einen Stand — abgesagt, ausgetreten oder entfernt:
          </p>
          <ul role="list">
            {matrix.ausgeschiedene.map((z) =>
              matrix.spalten.map((s) => {
                const d = z.zellen[s.schluessel].direkt
                if (!d) return null
                return (
                  <li key={`${z.teilnahmeId}|${s.schluessel}`}>
                    ausgeschieden: {z.name} — {s.titel}: {d.stand?.name ?? 'Stand nicht verfügbar'}{' '}
                    <button
                      type="button"
                      className="zentrale-abbrechen"
                      data-zelle={`${z.teilnahmeId}|${s.schluessel}`}
                      disabled={busy || !s.schreibbar}
                      onClick={() => waehlen(z.teilnahmeId, s.schluessel, null)}
                    >
                      entfernen
                    </button>
                  </li>
                )
              }),
            )}
          </ul>
        </div>
      )}

      <p className="zentrale-sub">Karte: {kartenTitel} — Spaltenkopf anklicken, um die Belegung eines Treibens zu sehen.</p>
      <div className="zentrale-karte-kasten">
        <div className="zentrale-karte-buehne">
          <Karte grenze={props.grenze} punkte={props.punkte} belegung={belegung} />
        </div>
      </div>

      {offen && (
        <Liste
          daten={daten}
          zeile={matrix.zeilen.concat(matrix.ausgeschiedene).find((z) => z.teilnahmeId === offen.teilnahmeId) ?? null}
          spalte={spalteVon(offen.spalte) ?? null}
          ort={offen.ort}
          aufWahl={(standId) => waehlen(offen.teilnahmeId, offen.spalte, standId)}
          aufSchliessen={(zurueck) => {
            if (zurueck) fokusZiel.current = `${offen.teilnahmeId}|${offen.spalte}`
            setOffen(null)
          }}
        />
      )}
    </section>
  )
}

function Tabelle({
  zeilen,
  spalten,
  laeuftZelle,
  gesperrt,
  kartenSpalte,
  aufKarte,
  aufOeffnen,
}: {
  zeilen: Zeile[]
  spalten: Spalte[]
  laeuftZelle: string | null
  gesperrt: boolean
  kartenSpalte: string
  aufKarte: (s: string) => void
  aufOeffnen: (teilnahmeId: string, spalte: string, ort: DOMRect) => void
}) {
  return (
    <div className="jagd-verteilen-rahmen">
      <table className="zentrale-tabelle jagd-verteilen-tabelle">
        <thead>
          <tr>
            <th scope="col">Schütze</th>
            {spalten.map((s) => (
              <th key={s.schluessel} scope="col" aria-current={s.schluessel === kartenSpalte ? 'true' : undefined}>
                <button type="button" className="jagd-verteilen-kopf" onClick={() => aufKarte(s.schluessel)}>
                  {s.titel}
                </button>
                <span className="jagd-verteilen-zaehler">
                  {s.ohneStand} ohne Stand · {s.frei} frei
                  {!s.schreibbar && s.treiben && s.treiben.status !== 'pending' ? ` · ${s.treiben.status}` : ''}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.teilnahmeId}>
              <th scope="row">
                {z.name}
                {z.rolle === 'treiber' || z.rolle === 'jagdleiter' ? (
                  <span className="jagd-verteilen-rolle"> · {z.rolle === 'treiber' ? 'Treiber' : 'Jagdleiter'}</span>
                ) : null}
              </th>
              {spalten.map((s) => {
                const schluessel = `${z.teilnahmeId}|${s.schluessel}`
                const ohneKonto = s.schluessel === JAGDWEIT && z.userId === null
                return (
                  <td key={s.schluessel}>
                    <button
                      type="button"
                      className="jagd-verteilen-zelle"
                      data-zelle={schluessel}
                      disabled={gesperrt || !s.schreibbar || ohneKonto}
                      title={ohneKonto ? 'Ohne Konto nur je Treiben' : undefined}
                      aria-haspopup="listbox"
                      onClick={(e) => aufOeffnen(z.teilnahmeId, s.schluessel, e.currentTarget.getBoundingClientRect())}
                    >
                      {laeuftZelle === schluessel ? 'speichert …' : ohneKonto ? 'nur je Treiben' : <Inhalt zelle={z.zellen[s.schluessel]} />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Inhalt({ zelle }: { zelle: Zelle }) {
  const { direkt, geerbt } = zelle
  if (direkt) {
    return (
      <>
        <span>{direkt.verfuegbar && direkt.stand ? direkt.stand.name : 'Stand nicht verfügbar'}</span>
        {direkt.sperre === 'gesperrt' && <span className="jagd-verteilen-rot"> gesperrt</span>}
      </>
    )
  }
  if (geerbt) {
    return (
      <>
        <span className="jagd-verteilen-geerbt">
          ↳ {geerbt.verfuegbar ? geerbt.stand.name : 'Stand nicht verfügbar'} (jagdweit)
        </span>
        {geerbt.belegtVon && <span className="jagd-verteilen-rot"> auch {geerbt.belegtVon}</span>}
        {geerbt.sperre === 'gesperrt' && <span className="jagd-verteilen-rot"> gesperrt</span>}
        {geerbt.ausserhalb && <span className="jagd-verteilen-gelb"> nicht in der Standmenge</span>}
      </>
    )
  }
  return <span className="jagd-verteilen-geerbt">—</span>
}

/**
 * Die Auswahlliste einer Zelle (E1, Eingabe-Vertrag). **Kein natives
 * `<select>`:** dort ändert eine Pfeiltaste in Firefox und Chrome/Windows den
 * Wert, und jede Taste wäre ein Write. Hier bewegen Pfeile nur die Markierung;
 * geschrieben wird erst bei Klick oder Enter auf einen Eintrag. Escape, Tab,
 * Fokusverlust und Klick ausserhalb schliessen ohne Write; der Fokus kehrt nur
 * nach Escape zur Zelle zurück. Gerendert ausserhalb des scrollenden Rahmens
 * (`createPortal` nach `.zentrale`, `position: fixed`), sonst schnitte
 * `overflow` sie ab.
 */
function Liste({
  daten,
  zeile,
  spalte,
  ort,
  aufWahl,
  aufSchliessen,
}: {
  daten: VerteilenDaten
  zeile: Zeile | null
  spalte: Spalte | null
  ort: DOMRect
  aufWahl: (standId: string | null) => void
  aufSchliessen: (fokusZurueck: boolean) => void
}) {
  const liste = useRef<HTMLUListElement>(null)
  // -1: nichts markiert — Enter wählt erst, wenn eine Pfeiltaste oder die Maus markiert hat.
  const [aktiv, setAktiv] = useState(-1)

  const eintraege: { schluessel: string; text: string; standId: string | null; aus: string | null }[] = []
  if (zeile && spalte) {
    const zelle = zeile.zellen[spalte.schluessel]
    if (zelle.direkt) {
      eintraege.push({ schluessel: 'leeren', text: leerenText(daten, spalte.schluessel, zeile.teilnahmeId), standId: null, aus: null })
    }
    // Ausgeschiedene bekommen nichts Neues, nur „entfernen" (E5).
    const t = daten.teilnehmer.find((x) => x.id === zeile.teilnahmeId)
    if (t && zuweisbar(t)) {
      for (const a of angebote(daten, spalte.schluessel, zeile.teilnahmeId)) {
        eintraege.push({ schluessel: a.standId, text: angebotText(a), standId: a.standId, aus: angebotAus(a, daten) })
      }
    }
  }

  useEffect(() => {
    // Ohne `preventScroll` könnte das Fokussieren die Seite bewegen — und das
    // Scrollen schlösse die Liste sofort wieder (s. unten).
    liste.current?.focus({ preventScroll: true })
  }, [])

  // Klick ausserhalb schliesst ohne Write, ohne den Fokus zu verbiegen.
  // **Scrollen ausserhalb ebenso** (Codex Delta 2): die Liste steht fest
  // (`position: fixed`), die Zeile darunter wandert — gewählt würde für die
  // ursprüngliche Person, sichtbar wäre eine andere. Ein Scrollen IN der Liste
  // schliesst nicht. `scroll` blubbert nicht, deshalb in der Capture-Phase.
  useEffect(() => {
    // Bei `resize` ist das Ziel das `window`, kein DOM-Knoten — `contains()`
    // würfe dort (Codex Delta 3). Was kein Knoten ist, gilt als „außerhalb".
    const weg = (e: Event) => {
      const ziel = e.target
      if (!(ziel instanceof Node) || !liste.current?.contains(ziel)) aufSchliessen(false)
    }
    document.addEventListener('mousedown', weg)
    window.addEventListener('scroll', weg, true)
    window.addEventListener('resize', weg)
    return () => {
      document.removeEventListener('mousedown', weg)
      window.removeEventListener('scroll', weg, true)
      window.removeEventListener('resize', weg)
    }
  }, [aufSchliessen])

  if (!zeile || !spalte) return null

  const waehlbar = (i: number) => eintraege[i] && eintraege[i].aus === null
  const bewege = (schritt: number) => {
    if (eintraege.length === 0) return
    let i = aktiv < 0 && schritt < 0 ? 0 : aktiv
    for (let n = 0; n < eintraege.length; n++) {
      i = (i + schritt + eintraege.length) % eintraege.length
      if (waehlbar(i)) break
    }
    setAktiv(i)
  }

  const oben = Math.min(ort.bottom + 2, window.innerHeight - 320)
  return createPortal(
    <ul
      ref={liste}
      role="listbox"
      tabIndex={-1}
      aria-label={`${zeile.name} — ${spalte.titel}`}
      aria-activedescendant={eintraege[aktiv] ? `jagd-verteilen-eintrag-${aktiv}` : undefined}
      className="jagd-verteilen-liste"
      style={{ position: 'fixed', top: Math.max(8, oben), left: Math.min(ort.left, window.innerWidth - 340) }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          bewege(1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          bewege(-1)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          // `repeat`: ein gehaltenes Enter — oder das, das die Liste geöffnet hat
          // und weiterläuft — darf nicht als Auswahl durchfallen (Fable Delta 7).
          if (!e.repeat && waehlbar(aktiv)) aufWahl(eintraege[aktiv].standId)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          aufSchliessen(true)
        } else if (e.key === 'Tab') {
          aufSchliessen(false)
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) aufSchliessen(false)
      }}
    >
      {/* Für wen gewählt wird, sichtbar — nicht nur im aria-label. */}
      <li role="presentation" className="jagd-verteilen-listenkopf">
        {zeile.name} · {spalte.titel}
      </li>
      {eintraege.length === 0 && <li className="jagd-verteilen-eintrag-aus">Keine Stände in dieser Spalte.</li>}
      {eintraege.map((e, i) => (
        <li
          key={e.schluessel}
          id={`jagd-verteilen-eintrag-${i}`}
          role="option"
          aria-selected={i === aktiv}
          aria-disabled={e.aus !== null}
          className={`jagd-verteilen-eintrag${i === aktiv ? ' aktiv' : ''}${e.aus !== null ? ' aus' : ''}`}
          onMouseEnter={() => setAktiv(i)}
          onClick={() => {
            if (e.aus === null) aufWahl(e.standId)
          }}
        >
          {e.text}
          {e.aus && <span className="jagd-verteilen-grund"> — {e.aus}</span>}
        </li>
      ))}
    </ul>,
    // In `.zentrale`, nicht in `body`: die Palette ist dort gescopet
    // (`zentrale.css`), an `body` hätte die Liste keinen Hintergrund.
    document.querySelector('.zentrale') ?? document.body,
  )
}

function angebotText(a: Angebot): string {
  let text = a.name
  if (a.inhaber) text += ` · ${a.inhaber.name}`
  if (a.erbtHier) text += ` · jagdweit ${a.erbtHier}`
  return text
}

/** Warum ein Eintrag nicht wählbar ist — `null` = wählbar. Gesperrt sperrt wie die App (D2). */
function angebotAus(a: Angebot, daten: VerteilenDaten): string | null {
  if (a.aktuell) return 'steht schon hier'
  if (a.sperre === 'gesperrt') {
    const p = daten.pruefung?.get(a.standId)
    const seit = p ? ` seit ${new Date(p.checked_at).toLocaleDateString('de-DE')}${p.pruefer ? ` (${p.pruefer})` : ''}` : ''
    return `gesperrt${seit} — entsperren über eine neue Prüfung in der App oder im Objekt-Inspektor der Revierseite`
  }
  return null
}
