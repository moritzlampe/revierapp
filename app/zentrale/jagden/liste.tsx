'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  jagdjahre,
  jagdjahrLabel,
  jagdstatus,
  laeuft,
  nachJagdjahr,
  namensvorschlag,
  pruefeJagdEntwurf,
  sortiere,
  termin,
  terminText,
  vorbereitbar,
  VORBEREITBARE_STATUS,
  ALLE_JAHRE,
  FILTER,
  JAGDARTEN,
  KEINE_ANTWORTEN,
  KEINE_ZUSAGEN,
  type Antwort,
  type Antworten,
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
  antworten,
  filter,
  jahr,
  revierId,
  reviere,
  eigeneId,
}: {
  jagden: Jagd[]
  /** Aus einer Map serialisiert — Server-Komponenten reichen keine Map durch. */
  zusagen: Record<string, Zusagen>
  antworten: Record<string, Antworten>
  filter: Filter
  jahr: string
  /** Das Revier dieser Ansicht — Voreinstellung beim Anlegen. */
  revierId: string
  /** Alle eigenen Reviere, für die Auswahl im Anlege-Formular. */
  reviere: { id: string; name: string }[]
  eigeneId: string
}) {
  const router = useRouter()
  const [anlegen, setAnlegen] = useState(false)

  // **Erst das Jahr, dann der Zustandsfilter.** Die Reihenfolge ist gleichgültig
  // für das Ergebnis, aber nicht für die Zähler auf den Chips: die sollen sagen,
  // wie viele es *im gewählten Jahr* gibt, nicht im ganzen Bestand.
  const imJahr = useMemo(() => nachJagdjahr(jagden, jahr), [jagden, jahr])
  const sichtbare = useMemo(() => sortiere(filtere(imJahr, filter)), [imJahr, filter])

  const jahre = useMemo(() => jagdjahre(jagden), [jagden])

  const zaehler = useMemo(
    () => ({
      alle: imJahr.length,
      offen: imJahr.filter((j) => !beendet(j.status)).length,
      geplant: imJahr.filter((j) => j.status === 'scheduled' || j.status === 'draft').length,
      beendet: imJahr.filter((j) => beendet(j.status)).length,
    }),
    [imJahr]
  )

  // Der Filterzustand gehört in die URL (Konzept §2.4) — ein geteilter Link
  // zeigt dieselbe Ansicht. `scroll: false`, damit die Liste stehen bleibt.
  //
  // Beide Filter schreiben durch dieselbe Stelle, damit keiner den anderen
  // wegwirft. Genau diesen Fehler hatte der Revierwechsler der Seitenleiste
  // einmal: er setzte `?revier=` als ganze Query und leerte damit das Suchfeld
  // der Gästeliste.
  //
  // **Das aktuelle Paar liegt in einem Ref, nicht in den Props.** Die Props
  // kommen vom Server und treffen erst ein, wenn die Navigation durch ist; wer
  // in dieser Lücke den zweiten Filter bedient, baute seine URL sonst aus dem
  // ALTEN Wert des ersten. „Jahr wählen, sofort Offen klicken" hätte auf einer
  // langsamen Leitung das gerade gewählte Jahr wieder entfernt
  // (Fremdprüfung 03.08.2026). Ein Ref, weil er synchron im selben Klick gelten
  // muss — ein State wäre erst beim nächsten Rendern da und hätte dasselbe
  // Problem eine Ebene tiefer.
  // Die Zuweisung gehört in einen Effekt, NICHT in den Renderkörper: dort liefe
  // sie bei jedem Rendern und machte den optimistischen Wert sofort wieder
  // zunichte — der Ref hätte sich selbst aufgehoben. So gewinnen die Props erst,
  // wenn sie wirklich neu sind (auch beim Zurück-Knopf des Browsers).
  const gewaehlt = useRef({ filter, jahr })
  useEffect(() => {
    gewaehlt.current = { filter, jahr }
  }, [filter, jahr])

  const setzeAdresse = (neu: { filter?: Filter; jahr?: string }) => {
    const paar = { ...gewaehlt.current, ...neu }
    gewaehlt.current = paar
    const p = new URLSearchParams({ revier: revierId })
    if (paar.filter !== 'alle') p.set('filter', paar.filter)
    if (paar.jahr !== ALLE_JAHRE) p.set('jahr', paar.jahr)
    router.replace(`/zentrale/jagden?${p.toString()}`, { scroll: false })
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
  const jagdAnlegen = async (
    entwurf: JagdEntwurf,
    zielRevier: string,
    schonAngelegt: AngelegteJagd,
  ) => {
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
            district_id: zielRevier,
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
      /**
       * **Dieser eine Insert läuft NICHT über `schreibe()`, und das ist kein
       * Schlendrian.**
       *
       * `schreibe()` verlangt ein `.select()` und liest „0 betroffene Zeilen"
       * als Fehler. Hier sind 0 zurückgelesene Zeilen aber der Normalfall: die
       * SELECT-Policy auf `chat_group_members` läuft über
       * `get_my_group_ids()`, und die Funktion ist **STABLE** — sie sieht den
       * Snapshot vom Anweisungsbeginn und damit die gerade eingefügte Zeile
       * nicht. Die Zeile versteckt sich also vor ihrer eigenen Rückgabe.
       *
       * Am 03.08.2026 an einer echten Testjagd gemessen: Gruppe angelegt (1),
       * Mitglied 0 — der Insert war durchgelaufen, `schreibe()` hatte ihn zum
       * Fehlschlag erklärt und der Chat-Hinweis erschien, obwohl nur die
       * Rückgabe fehlte. Die App macht denselben Insert aus demselben Grund
       * ohne Rückgabe (`createHunt`).
       *
       * Der Fehler wird trotzdem geprüft — nur eben der echte, nicht die
       * ausbleibende Zeile. Es ist die dokumentierte Projektregel: eine normale
       * Rolle kann eine Zeile nicht in einen Zustand schreiben, den die
       * SELECT-Policies verbergen.
       */
      const { error: mitgliedFehler } = await client
        .from('chat_group_members')
        .insert({ group_id: gruppe.id, user_id: eigeneId })
      if (mitgliedFehler) {
        throw new Error(
          `Die eigene Chat-Mitgliedschaft konnte nicht geschrieben werden: ${mitgliedFehler.message}`
        )
      }
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
    // **Das Ziel folgt dem GEWAEHLTEN Revier, nicht dem der Ansicht.** Wer die
    // Jagd woanders anlegt, soll dort landen — sonst zeigte die Adresse ein
    // Revier, zu dem die Jagd gar nicht gehoert, und die Detailseite leitete
    // sofort wieder um.
    const ziel = `/zentrale/jagden/${huntId}?revier=${zielRevier}`
    router.push(chatFehler ? `${ziel}&chat=fehlt` : ziel)
    return chatFehler
  }

  /**
   * Titel und die einzige erzeugende Handlung auf einer Achse.
   *
   * Der Knopf stand vorher in einer eigenen Zeile zwischen Überschrift und
   * Filtern — also genau dort, wo das Auge schon drei Elemente abgearbeitet
   * hatte, und ging unter (Moritz, 03.08.2026: „nicht präsent genug"). Rechts
   * auf Titelhöhe bekommt er die Stelle, die jedes Werkzeug dafür benutzt, und
   * der Kopf wird eine Zeile kürzer.
   *
   * Er ist das **einzige** Element im Seitenkopf mit voller Akzentfläche.
   * Deshalb hat der aktive Filter-Chip seine Füllung abgegeben: ein
   * Ansichtszustand darf nicht mit der wichtigsten Handlung um dieselbe Farbe
   * konkurrieren (Codex-Designlesung, dritter Fund).
   */
  const kopf = (
    <div className="jagden-titelzeile">
      <h1>Jagden</h1>
      <button type="button" className="jagden-haupt" onClick={() => setAnlegen(true)}>
        Jagd anlegen
      </button>
    </div>
  )

  if (anlegen) {
    return (
      <Anlegen
        aufSichern={jagdAnlegen}
        aufAbbrechen={() => setAnlegen(false)}
        revierId={revierId}
        reviere={reviere}
      />
    )
  }

  if (jagden.length === 0) {
    return (
      <>
        {kopf}
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Für dieses Revier ist keine Jagd angelegt. Hier entsteht eine
            geplante Jagd; &bdquo;Sofort starten&ldquo; gibt es nur in der
            Feld-App.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      {kopf}

      {/* Das Jagdjahr steht vor den Zustands-Chips: es ist der gröbere Schnitt,
          und die Zahlen auf den Chips gelten innerhalb des gewählten Jahres.
          Nur anzeigen, wenn es überhaupt mehr als eines gibt — ein Auswahlfeld
          mit einer Wahl ist ein Möbelstück. */}
      {jahre.length > 1 ? (
        <div className="jagden-jahr">
          <label htmlFor="jagden-jahr">Jagdjahr</label>
          <select
            id="jagden-jahr"
            value={jahr}
            onChange={(e) => setzeAdresse({ jahr: e.target.value })}
          >
            <option value={ALLE_JAHRE}>Alle</option>
            {jahre.map((k) => (
              <option key={k} value={k}>
                {jagdjahrLabel(k)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="jagden-filter" role="group" aria-label="Jagden filtern">
        {FILTER.map((f) => (
          <button
            key={f}
            type="button"
            className={`jagden-chip${f === filter ? ' ist-aktiv' : ''}`}
            aria-pressed={f === filter}
            onClick={() => setzeAdresse({ filter: f })}
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
                    <Zusagenzelle zusagen={z} antworten={antworten[j.id] ?? KEINE_ANTWORTEN} />
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
 * Die Zusagen-Zelle: die Zahlen, und dahinter wer.
 *
 * **Ein `popover`, kein absolut positionierter Kasten** — und das ist keine
 * Modeentscheidung: die Tabelle steht in `.jagden-tabellenkasten` mit
 * `overflow-x: auto`, und ein normales Popup würde daran abgeschnitten. Die
 * Popover-API rendert im Top-Layer, außerhalb jedes Überlaufs; Escape,
 * Klick-daneben und die Fokusrückgabe kommen vom Browser.
 *
 * **Aufgehen tut es beim Überfahren mit der Maus** (Moritz' Vorgabe), **und
 * beim Klicken und beim Tastaturfokus** — Hover allein wäre auf einem
 * Touchgerät und für die Tastatur eine Sackgasse. `popovertarget` macht den
 * Klickweg von selbst; die zwei Zeilen JS darüber sind nur für die Maus da.
 */
function Zusagenzelle({ zusagen: z, antworten: a }: { zusagen: Zusagen; antworten: Antworten }) {
  const id = useId()
  const popRef = useRef<HTMLDivElement>(null)

  const zeigen = () => popRef.current?.showPopover()
  const verbergen = () => popRef.current?.hidePopover()

  const leer = z.zugesagt === 0 && z.offen === 0 && z.abgesagt === 0

  return (
    <span className="jagden-zusagen" onMouseEnter={leer ? undefined : zeigen} onMouseLeave={verbergen}>
      <button
        type="button"
        className="jagden-zusagen-knopf"
        popoverTarget={leer ? undefined : id}
        // **`show`, nicht das voreingestellte `toggle`.** Sonst schließt der
        // Klick genau das Popover wieder, das Hover oder Fokus einen Moment
        // vorher geöffnet haben — und weil Fokus dem Klick immer vorausgeht,
        // wäre das der Normalfall gewesen, nicht der Sonderfall. Das Feature
        // hätte nur aufgeblitzt (Fremdprüfung 03.08.2026). Mit `show` ist jede
        // Aktivierung idempotent; geschlossen wird über Escape, Klick daneben
        // (beides von `popover="auto"`), Mausaustritt und Fokusverlust.
        popoverTargetAction="show"
        disabled={leer}
        aria-label={
          leer
            ? 'Niemand eingeladen'
            : `${z.zugesagt} zugesagt, ${z.offen} offen, ${z.abgesagt} abgesagt — Namen anzeigen`
        }
        onFocus={leer ? undefined : zeigen}
        onBlur={verbergen}
      >
        {z.zugesagt}
        {z.offen > 0 ? <span className="jagden-offen"> +{z.offen} offen</span> : null}
        {z.abgesagt > 0 ? <span className="jagden-abgesagt"> −{z.abgesagt} abgesagt</span> : null}
      </button>

      {leer ? null : (
        <div ref={popRef} id={id} popover="auto" className="jagden-popover">
          <Antwortgruppe titel="Zugesagt" eintraege={a.zugesagt} />
          <Antwortgruppe titel="Offen" eintraege={a.offen} />
          <Antwortgruppe titel="Abgesagt" eintraege={a.abgesagt} />
        </div>
      )}
    </span>
  )
}

/**
 * Eine Gruppe im Aufklapper. Leere Gruppen fallen weg statt als „(0)"
 * dazustehen — drei Überschriften ohne Inhalt sind keine Auskunft.
 *
 * Das Datum steht ohne Uhrzeit: wann jemand zugesagt hat, ist eine Angabe auf
 * Tagesebene; die Minute daneben behauptete eine Genauigkeit, die niemand
 * braucht.
 */
function Antwortgruppe({ titel, eintraege }: { titel: string; eintraege: Antwort[] }) {
  if (eintraege.length === 0) return null
  return (
    <div className="jagden-popover-gruppe">
      <h3>
        {titel} <span className="jagden-popover-zahl">{eintraege.length}</span>
      </h3>
      <ul>
        {eintraege.map((e, i) => (
          <li key={`${e.name}-${i}`}>
            <span className="jagden-popover-name">{e.name}</span>
            {e.datum ? (
              <span className="jagden-popover-datum">{terminText(e.datum, false)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
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
  revierId,
  reviere,
}: {
  aufSichern: (
    entwurf: JagdEntwurf,
    zielRevier: string,
    schonAngelegt: AngelegteJagd,
  ) => Promise<string | null>
  aufAbbrechen: () => void
  /** Voreingestelltes Revier: das der aktuellen Ansicht. */
  revierId: string
  reviere: { id: string; name: string }[]
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

  /**
   * Das Revier, in dem die Jagd entsteht — voreingestellt auf das der Ansicht.
   *
   * **Nach dem ersten Schreibversuch nicht mehr änderbar.** Die Jagd existiert
   * dann bereits; `hunts.district_id` nachträglich umzuschreiben ist ein
   * anderer Vorgang als sie anzulegen — und einer, den die DB ablehnt, sobald
   * Erlegungen daran hängen. Ein Feld, das nach dem Fehlschlag noch aussieht
   * wie eine Wahl, wäre eine Lüge.
   */
  const [zielRevier, setZielRevier] = useState(revierId)
  // `revierFest` ist ein State, nicht aus dem Ref oben abgeleitet: ein Ref löst
  // kein Rendern aus, das Feld bliebe nach einem Fehlschlag also sichtbar
  // bedienbar — und die Wahl darin wirkungslos, weil die Jagd schon steht.
  const [revierFest, setRevierFest] = useState(false)

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
      await aufSichern(mitName, zielRevier, schonAngelegt)
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
      if (schonAngelegt.current) setRevierFest(true)
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  return (
    <form className="jagden-formular" onSubmit={absenden}>
      <h2 className="jagden-abschnitt">Neue Jagd</h2>

      <div className="zentrale-inspektor-feld">
        {/* Das Revier zuerst: es bestimmt, wo die Jagd landet, und beim
            Anlegen aus einer gefilterten Liste ist die Voreinstellung nicht
            immer die gewollte. Nur ein Revier vorhanden? Dann ist die Auswahl
            eine Zeile ohne Wahl — dann steht der Name einfach da. */}
        <div>
          <label htmlFor="neu-revier">Revier</label>
          {reviere.length > 1 && !revierFest ? (
            <select
              id="neu-revier"
              value={zielRevier}
              disabled={laeuft}
              onChange={(e) => setZielRevier(e.target.value)}
            >
              {reviere.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="neu-revier"
              value={reviere.find((r) => r.id === zielRevier)?.name ?? '—'}
              readOnly
              disabled
            />
          )}
        </div>

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
        {zielRevier !== revierId
          ? ' Sie entsteht in einem anderen Revier als dem gerade angezeigten — die Ansicht wechselt dorthin mit.'
          : ''}
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
