'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../schreiben'
import {
  alsZeitstempel,
  beendet,
  einladungscode,
  filtere,
  jagdart,
  jagdstatus,
  laeuft,
  namensvorschlag,
  pruefeJagdEntwurf,
  sortiere,
  termin,
  terminText,
  vorbereitbar,
  VORBEREITBARE_STATUS,
  FILTER,
  JAGDARTEN,
  KEINE_ZUSAGEN,
  type Filter,
  type Jagd,
  type JagdEntwurf,
  type Zusagen,
} from './jagden'

/** Merkt die schon angelegte Jagd über einen gescheiterten Versuch hinweg. */
type AngelegteJagd = { current: string | null }

/**
 * Die Jagdliste — Stand 03.08.2026: **lesend**.
 *
 * Der Inspektor mit Termin, Einladungen und Rollen kommt als nächster Schritt
 * (Portal-Phase 4a). Diese Fassung steht allein, weil sie schon die Frage
 * beantwortet, für die man die Seite öffnet: was ist als Nächstes dran, und
 * wer hat zugesagt.
 *
 * **Alles im Speicher**, wie in der Gästeliste: 18 Jagden kommen als ein Rutsch
 * vom Server, Filtern passiert hier. Keine Blätterung — bei dieser Menge wäre
 * sie Aufwand ohne Wirkung.
 */
export default function Liste({
  jagden,
  zusagen,
  filter,
  revierId,
  eigeneId,
}: {
  jagden: Jagd[]
  /** Aus einer Map serialisiert — Server-Komponenten reichen keine Map durch. */
  zusagen: Record<string, Zusagen>
  filter: Filter
  revierId: string
  eigeneId: string
}) {
  const router = useRouter()
  const [anlegen, setAnlegen] = useState(false)

  const sichtbare = useMemo(() => sortiere(filtere(jagden, filter)), [jagden, filter])

  const zaehler = useMemo(
    () => ({
      alle: jagden.length,
      offen: jagden.filter((j) => !beendet(j.status)).length,
      geplant: jagden.filter((j) => j.status === 'scheduled' || j.status === 'draft').length,
      beendet: jagden.filter((j) => beendet(j.status)).length,
    }),
    [jagden]
  )

  // Der Filterzustand gehört in die URL (Konzept §2.4) — ein geteilter Link
  // zeigt dieselbe Ansicht. `scroll: false`, damit die Liste stehen bleibt.
  const setzeFilter = (f: Filter) => {
    const ziel = f === 'alle' ? `?revier=${revierId}` : `?revier=${revierId}&filter=${f}`
    router.replace(`/zentrale/jagden${ziel}`, { scroll: false })
  }

  /**
   * Eine Jagd anlegen — die vier Schreibvorgänge aus `createHunt` der App
   * (`src/lib/data/hunts.ts`), in derselben Reihenfolge.
   *
   * **Die Chat-Gruppe gehört dazu, und das ist der Schritt, den man auslässt.**
   * `accept_hunt_invitation` (Migration 049) trägt den Annehmenden nur dann in
   * die Gruppe ein, wenn es zu dieser `hunt_id` eine gibt — sonst findet das
   * eingebettete SELECT nichts und die Funktion tut still nichts. Eine ohne
   * Gruppe angelegte Jagd hätte also keinen Chat, und es fiele erst am Jagdtag
   * auf.
   *
   * **Nicht transaktional**, genau wie nativ: ein Fehlschlag in Schritt 3 lässt
   * Jagd und Teilnehmerzeile stehen. Der saubere Weg wäre eine Anlege-RPC —
   * dieselbe Schuld, die die App und die Pilot-PWA seit jeher tragen, und kein
   * Fall, den 4a neu aufmacht.
   *
   * **Immer `scheduled`, nie `active`.** Das Portal bereitet vor; gestartet
   * wird in der App (Konzept §3).
   */
  const jagdAnlegen = async (entwurf: JagdEntwurf, schonAngelegt: AngelegteJagd) => {
    const client = createClient()
    const name = entwurf.name.trim()

    // Die vier Felder, die der Nutzer bestimmt. Nur die Drückjagd ist laut —
    // zeichengleich zu `buildHuntInsert` der App.
    const felder = {
      name,
      type: entwurf.type,
      scheduled_for: alsZeitstempel(entwurf.termin),
      signal_mode: entwurf.type === 'drueckjagd' ? 'loud' : 'silent',
    }

    // **Schritt 1 nur einmal, auch über mehrere Versuche hinweg.** Ohne das
    // beginnt ein zweiter Klick nach einem Fehler in Schritt 2–4 mit einer
    // weiteren Jagd, und aus einem vorübergehenden Netzfehler werden Duplikate
    // (Fremdprüfung 03.08.2026). Die ID lebt im Ref des Formulars, überlebt
    // also den Fehlschlag und wird beim nächsten Versuch wiederverwendet.
    if (!schonAngelegt.current) {
      const jagd = await schreibe<{ id: string }>('Die Jagd', () =>
        client
          .from('hunts')
          .insert({
            ...felder,
            creator_id: eigeneId,
            district_id: revierId,
            kind: 'group',
            status: 'scheduled',
            started_at: null,
            invite_code: einladungscode(),
          })
          .select('id')
      )
      schonAngelegt.current = jagd.id
    } else {
      /**
       * **Der zweite Versuch schreibt die Eingaben nach, statt sie zu
       * verwerfen** (Schlusslesung 03.08.2026).
       *
       * Die erste Fassung übersprang Schritt 1 einfach — richtig gegen
       * Duplikate, falsch für den Nutzer: wer nach einem Fehlschlag den Termin
       * korrigierte und erneut klickte, bekam die Jagd mit dem ALTEN Termin und
       * eine Chat-Gruppe mit dem NEUEN Namen. Zwei Wahrheiten aus einem Klick,
       * ohne jeden Hinweis. Ein Fix auf ein Review-Finding kann schlimmer sein
       * als der Fehler.
       */
      // Der Statusfilter gehört auch hierher, und das war zuerst vergessen:
      // dies ist ein `hunts`-UPDATE wie jedes andere. Zwischen dem ersten
      // Versuch und dem zweiten kann der Auto-Start aus Migration 051 die
      // frisch geplante Jagd auf `active` gesetzt haben — dann schriebe der
      // Wiederholungsklick in eine laufende Feldsituation (Konzept §3).
      await schreibe('Die Jagd', () =>
        client
          .from('hunts')
          .update(felder)
          .eq('id', schonAngelegt.current!)
          .in('status', VORBEREITBARE_STATUS)
          .select('id')
      )
    }
    const huntId = schonAngelegt.current

    // `upsert` statt `insert`: beim Wiederholungsversuch steht die Zeile schon
    // da und liefe sonst in `UNIQUE (hunt_id, user_id)`. Die Werte sind
    // dieselben, das Überschreiben ist also folgenlos.
    await schreibe('Die eigene Teilnahme', () =>
      client
        .from('hunt_participants')
        .upsert(
          {
            hunt_id: huntId,
            user_id: eigeneId,
            role: 'jagdleiter',
            status: 'joined',
            joined_at: new Date().toISOString(),
          },
          { onConflict: 'hunt_id,user_id' }
        )
        .select('id')
    )

    /**
     * **Der Chat ist nicht kritisch, die Jagd ist es.**
     *
     * Scheitert eine der beiden Chat-Zeilen, ist die Jagd trotzdem fertig:
     * Termin, Teilnehmer und Einladungen funktionieren, nur der Gruppenchat
     * fehlt. Diesen Fehlschlag hochzureichen hieße, den Nutzer vor einer
     * angelegten Jagd stehen zu lassen, die er für gescheitert hält — und ihn
     * zum zweiten Anlauf einzuladen.
     *
     * `chat_groups` trägt keinen Unique auf `hunt_id`; ein zweiter Versuch
     * legte eine zweite Gruppe an. Deshalb wird hier nicht wiederholt, sondern
     * weitergegangen und der Mangel benannt.
     */
    let chatFehler: string | null = null
    try {
      const gruppe = await schreibe<{ id: string }>('Die Chat-Gruppe', () =>
        client
          .from('chat_groups')
          .insert({ name, emoji: '🎯', created_by: eigeneId, hunt_id: huntId })
          .select('id')
      )
      await schreibe('Die eigene Chat-Mitgliedschaft', () =>
        client
          .from('chat_group_members')
          .insert({ group_id: gruppe.id, user_id: eigeneId })
          .select('id')
      )
    } catch (err) {
      chatFehler = err instanceof Error ? err.message : String(err)
    }

    // Direkt ins Detail: einladen ist der nächste Handgriff, nicht ein zweiter
    // Klick durch eine Liste, in der die neue Jagd erst gesucht werden muss.
    //
    // **Der fehlende Chat reist als Parameter mit.** Ihn nur in die Konsole zu
    // schreiben hieße, genau den Zustand herzustellen, den der Kommentar oben
    // vermeiden will: einen Mangel, der erst am Jagdtag auffällt
    // (Schlusslesung 03.08.2026).
    const ziel = `/zentrale/jagden/${huntId}?revier=${revierId}`
    router.push(chatFehler ? `${ziel}&chat=fehlt` : ziel)
    return chatFehler
  }

  const anlegenKnopf = (
    <button type="button" className="haupt" onClick={() => setAnlegen(true)}>
      Jagd anlegen
    </button>
  )

  if (anlegen) {
    return <Anlegen aufSichern={jagdAnlegen} aufAbbrechen={() => setAnlegen(false)} />
  }

  if (jagden.length === 0) {
    return (
      <>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Für dieses Revier ist keine Jagd angelegt. Hier entsteht eine
            geplante Jagd; &bdquo;Sofort starten&ldquo; gibt es nur in der
            Feld-App.
          </p>
        </div>
        <div className="jagden-kopfzeile">{anlegenKnopf}</div>
      </>
    )
  }

  return (
    <>
      <div className="jagden-kopfzeile">{anlegenKnopf}</div>

      <div className="jagden-filter" role="group" aria-label="Jagden filtern">
        {FILTER.map((f) => (
          <button
            key={f}
            type="button"
            className={`jagden-chip${f === filter ? ' ist-aktiv' : ''}`}
            aria-pressed={f === filter}
            onClick={() => setzeFilter(f)}
          >
            {f === 'alle' ? 'Alle' : f === 'offen' ? 'Offen' : f === 'geplant' ? 'Geplant' : 'Beendet'}
            <span className="jagden-chip-zahl">{zaehler[f]}</span>
          </button>
        ))}
      </div>

      {/* `zentrale-tabelle` trägt Rahmen, Kopfzeile und Zeilenhöhe für das
          ganze Portal — hier kommt nur dazu, was die Jagdliste eigenes hat. */}
      <div className="jagden-tabellenkasten">
        <table className="zentrale-tabelle jagden-tabelle">
          <thead>
            <tr>
              <th scope="col">Jagd</th>
              <th scope="col">Art</th>
              <th scope="col">Termin</th>
              <th scope="col">Status</th>
              <th scope="col">Zusagen</th>
            </tr>
          </thead>
          <tbody>
            {sichtbare.map((j) => {
              const z = zusagen[j.id] ?? KEINE_ZUSAGEN
              return (
                <tr key={j.id}>
                  <td>
                    {/* Ein echter Link, kein klickbares <tr>: Mittelklick,
                        Tastatur und „in neuem Tab öffnen" kommen dadurch
                        geschenkt. */}
                    <Link className="jagden-link" href={`/zentrale/jagden/${j.id}?revier=${revierId}`}>
                      {j.name || 'Ohne Namen'}
                    </Link>
                  </td>
                  <td>{jagdart(j.type)}</td>
                  {/* Mono + tabular-nums: Datumsspalten sollen untereinander
                      fluchten (Konzept §2.2). */}
                  <td className="jagden-zahl">{terminText(termin(j))}</td>
                  <td>
                    <span
                      className={`jagden-pille${laeuft(j.status) ? ' ist-live' : ''}${
                        vorbereitbar(j.status) ? ' ist-offen' : ''
                      }`}
                    >
                      {jagdstatus(j.status)}
                    </span>
                    {/* Der read-only-Riegel aus Konzept §3, als Text statt als
                        fehlender Knopf: eine laufende Jagd gehört der Feld-App. */}
                    {laeuft(j.status) ? (
                      <span className="jagden-hinweis"> nur in der App</span>
                    ) : null}
                  </td>
                  <td className="jagden-zahl">
                    {z.zugesagt}
                    {z.offen > 0 ? <span className="jagden-offen"> +{z.offen} offen</span> : null}
                    {z.abgesagt > 0 ? (
                      <span className="jagden-abgesagt"> −{z.abgesagt} abgesagt</span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {sichtbare.length === 0 ? (
        <p className="zentrale-sub" style={{ marginTop: '1rem' }}>
          Kein Treffer für diesen Filter.
        </p>
      ) : null}
    </>
  )
}

/**
 * Eine neue Jagd anlegen.
 *
 * Der Name ist Pflicht (`hunts.name` ist NOT NULL) und bekommt den Vorschlag
 * der App als **Platzhalter**, nicht als vorbelegten Wert: sonst wäre nicht zu
 * unterscheiden, ob jemand den Vorschlag gewollt oder nur nicht gelesen hat.
 * Wer nichts tippt, bekommt ihn trotzdem — das ist der Zweck.
 *
 * Der Riegel gegen doppeltes Absenden ist ein **Ref**, kein State. Hier wiegt
 * er schwerer als anderswo: zwei durchgekommene Klicks legten zwei Jagden an,
 * und das sieht wie Erfolg aus.
 */
function Anlegen({
  aufSichern,
  aufAbbrechen,
}: {
  aufSichern: (entwurf: JagdEntwurf, schonAngelegt: AngelegteJagd) => Promise<string | null>
  aufAbbrechen: () => void
}) {
  const [entwurf, setEntwurf] = useState<JagdEntwurf>({ name: '', termin: '', type: 'drueckjagd' })
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const inArbeit = useRef(false)

  /**
   * Die ID der bereits angelegten Jagd, falls ein früherer Versuch nach
   * Schritt 1 abgebrochen ist. Ein Ref, kein State: er soll den
   * Wiederholungsversuch überleben, ohne ein Rendern auszulösen.
   */
  const schonAngelegt: AngelegteJagd = useRef<string | null>(null)

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inArbeit.current) return

    // Der Vorschlag greift erst hier, damit das Feld sichtbar leer bleiben darf.
    const mitName = { ...entwurf, name: entwurf.name.trim() || namensvorschlag(entwurf.termin) }

    const problem = pruefeJagdEntwurf(mitName)
    if (problem) {
      setFehler(problem)
      return
    }

    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await aufSichern(mitName, schonAngelegt)
      // Kein `setLaeuft(false)` im Erfolgsfall: der Aufrufer navigiert weg, und
      // ein wieder freigegebener Knopf wäre eine Einladung zum zweiten Anlegen.
      // Ein fehlender Chat ist kein Fehlschlag des Anlegens — er reist als
      // Parameter mit und wird auf der Detailseite angesagt.
    } catch (err) {
      // Der Entwurf bleibt vollständig stehen (Backlog E-R2), und die schon
      // angelegte Jagd bleibt im Ref — der nächste Versuch setzt dort an,
      // statt eine zweite anzulegen.
      setFehler(
        (err instanceof Error ? err.message : 'Unbekannter Fehler beim Anlegen.') +
          (schonAngelegt.current
            ? ' Die Jagd selbst ist bereits angelegt; „Anlegen" setzt dort fort und ' +
              'erzeugt keine zweite.'
            : '')
      )
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  return (
    <form className="jagden-formular" onSubmit={absenden}>
      <h2 className="jagden-abschnitt">Neue Jagd</h2>

      <div className="zentrale-inspektor-feld">
        <div>
          <label htmlFor="neu-name">Name</label>
          <input
            id="neu-name"
            value={entwurf.name}
            disabled={laeuft}
            autoFocus
            placeholder={namensvorschlag(entwurf.termin)}
            onChange={(e) => setEntwurf((v) => ({ ...v, name: e.target.value }))}
          />
        </div>

        <div>
          <label htmlFor="neu-termin">Termin</label>
          <input
            id="neu-termin"
            type="datetime-local"
            value={entwurf.termin}
            disabled={laeuft}
            onChange={(e) => setEntwurf((v) => ({ ...v, termin: e.target.value }))}
          />
        </div>

        <div>
          <label htmlFor="neu-art">Jagdart</label>
          <select
            id="neu-art"
            value={entwurf.type}
            disabled={laeuft}
            onChange={(e) =>
              setEntwurf((v) => ({ ...v, type: e.target.value as JagdEntwurf['type'] }))
            }
          >
            {JAGDARTEN.map((a) => (
              <option key={a} value={a}>
                {jagdart(a)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="zentrale-sub">
        Die Jagd wird geplant angelegt. Gestartet wird sie in der Feld-App.
      </p>

      {fehler ? (
        <p className="zentrale-inspektor-fehler" role="alert">
          {fehler}
        </p>
      ) : null}

      <div className="zentrale-inspektor-fuss">
        <button type="submit" className="haupt" disabled={laeuft}>
          {laeuft ? 'Wird angelegt …' : 'Anlegen'}
        </button>
        <button type="button" onClick={aufAbbrechen} disabled={laeuft}>
          Abbrechen
        </button>
      </div>
    </form>
  )
}
