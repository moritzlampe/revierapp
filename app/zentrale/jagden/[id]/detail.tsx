'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../../schreiben'
import {
  alsEingabewert,
  filterZaehler,
  jagdAenderungen,
  jagdart,
  jagdstatus,
  laeuft,
  namensvorschlag,
  pruefeJagdEntwurf,
  rolle,
  gastZustand,
  rolleBeimEinladen,
  rollenVerteilung,
  leerText,
  gruppiereTeilnehmer,
  kandidaten,
  sichtbareKandidaten,
  tag,
  teilnahme,
  teilnehmerName,
  termin,
  terminText,
  vorbereitbar,
  VORBEREITBARE_STATUS,
  EINLADE_FILTER,
  GAST_ZUSTAENDE,
  JAGDARTEN,
  SETZBARE_ROLLEN,
  TAGS,
  type EinladbarerKontakt,
  type EinladeFilter,
  type Jagd,
  type JagdEntwurf,
  type Kandidat,
  type SetzbareRolle,
  type Profil,
  type Teilnehmer,
} from '../jagden'
import { suchtext } from '../../gaeste/kontakte'

/**
 * Eine Jagd vorbereiten — Portal-Phase 4a.
 *
 * **Alle Schreibpfade laufen über `schreibe()`**, also über die eine Stelle,
 * die „0 betroffene Zeilen" als Fehler liest. Ohne sie meldete ein von RLS
 * gefilterter Write `{ data: null, error: null }` und sähe wie ein Erfolg aus
 * (Backlog E-R1).
 *
 * **`router.refresh()` nach jedem Write** lädt die Server-Komponente neu. Das
 * ist im Portal der einzige Weg, geschriebene Daten zurückzubekommen, ohne den
 * Zustand doppelt zu führen — dieselbe Bauform wie in der Gästeliste.
 */
export default function Detail({
  jagd,
  revierName,
  revierId,
  teilnehmer,
  profile,
  kontakte,
  eigeneId,
  erstellerId,
  istLeiter,
}: {
  jagd: Jagd
  revierName: string | null
  revierId: string | null
  teilnehmer: Teilnehmer[]
  profile: Profil[]
  /** Das Adressbuch — die Menschen ohne Konto (Migration 085). */
  kontakte: EinladbarerKontakt[]
  eigeneId: string
  erstellerId: string
  /** Ersteller ODER zugesagter Rollen-Jagdleiter. Serverseitig entschieden. */
  istLeiter: boolean
}) {
  const router = useRouter()
  const [bearbeiten, setBearbeiten] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  /**
   * `laedtNach` ist wahr, solange der Server-Refresh nach einem Write läuft.
   *
   * **Ohne das ist jede Zeile für einen Moment mit veralteten Daten bedienbar**
   * (Codex-Befund 3, 03.08.2026): der Write ist durch, der Knopf wieder frei,
   * aber die Props tragen noch den alten Stand. Ein zweiter Klick rechnete
   * seinen neuen Wert dann aus dem alten — bei den Merkmalen ging so das zuerst
   * gesetzte verloren, weil beide Klicks dasselbe Array als Grundlage nahmen.
   *
   * `useTransition` ist dafür das vorgesehene Werkzeug: `isPending` bleibt
   * wahr, bis der Refresh mitsamt neuen Props durch ist.
   */
  const [laedtNach, starteRefresh] = useTransition()
  const nachladen = () => starteRefresh(() => router.refresh())

  /**
   * Darf hier überhaupt geschrieben werden?
   *
   * Zwei Bedingungen, und beide sind eigenständig: die Rolle (sonst weist RLS
   * ab — S2) und der Zustand der Jagd. Eine laufende oder beendete Jagd ist im
   * Portal read-only (Konzept §3: „ein offener Browser darf keine laufende
   * Feldsituation umschreiben"). Die DB erlaubte das UPDATE durchaus; der
   * Riegel ist hier eine Produktentscheidung, keine Berechtigungsfrage — und
   * deshalb steht er als sichtbarer Hinweis da statt als fehlender Knopf.
   */
  const schreibbar = istLeiter && vorbereitbar(jagd.status)

  const namen = useMemo(
    () => Object.fromEntries(profile.map((p) => [p.id, p.display_name ?? ''])),
    [profile]
  )
  const gruppen = useMemo(() => gruppiereTeilnehmer(teilnehmer, namen), [teilnehmer, namen])
  // **Zusagen und Offene, nicht „N Personen"** (Schlusslesung 03.08.2026):
  // eine Gesamtzahl zählt Abgesagte und Ausgetretene mit, und „8 Personen"
  // liest sich wie acht Kommende. Die zwei Zahlen hier sind die, nach denen
  // ein Jagdleiter beim Vorbereiten sucht; alles Weitere steht in den Gruppen.
  const zugesagt = teilnehmer.filter((t) => t.status === 'joined').length
  const offen = teilnehmer.filter((t) => t.status === 'invited').length

  /**
   * Wer eingeladen werden kann — Konten UND Adressbuch in einer Liste.
   *
   * Die Regeln stecken in `kandidaten()` (mit Selbsttest); hier steht nur, dass
   * beide Quellen hineingehen. Bis 03.08.2026 waren es allein die 9 Profile.
   */
  const alleKandidaten = useMemo(
    () => kandidaten(profile, kontakte, teilnehmer, eigeneId, namen),
    [profile, kontakte, teilnehmer, eigeneId, namen]
  )

  /**
   * Die Read-only-Grenze aus Konzept §3, **in der Datenbank statt nur im UI**.
   *
   * `schreibbar` unten rechnet aus dem Status, der beim Laden der Seite galt.
   * Startet jemand die Jagd währenddessen in der Feld-App — der Normalfall,
   * das Portal steht ja auf dem Schreibtisch —, bleiben hier alle Knöpfe
   * aktiv, und die Policies nehmen den Write an: sie prüfen die Leitung, nicht
   * den Zustand. Ein offener Browser schriebe dann in eine laufende
   * Feldsituation, also genau das, was §3 verbietet (Codex-Befund 1).
   *
   * Für `hunts` ist der Riegel atomar und kostenlos: der Statusfilter im UPDATE
   * lässt 0 Zeilen übrig, und `schreibe()` macht daraus einen Fehler. Für
   * `hunt_participants` geht das nicht — PostgREST kann beim UPDATE nicht über
   * die verknüpfte Jagd filtern. Dort steht deshalb `pruefeZustand()`, eine
   * frische Abfrage unmittelbar vor dem Write. Das schrumpft das Fenster von
   * „beliebig lang" auf Millisekunden, schließt es aber nicht.
   *
   * **Ganz zu ist es erst mit einer DB-Bedingung**, und die wäre DDL — die
   * schreibt der native Track (Parallelitäts-Vertrag R2). Als Auftrag notiert,
   * nicht hier stillschweigend umgangen.
   *
   * Die Statusliste kommt aus `jagden.ts` und ist damit dieselbe, die
   * `vorbereitbar()` benutzt. Hier stand einmal eine eigene Kopie; sie und die
   * Funktion sagten für `null` und für jeden künftigen Enum-Wert Verschiedenes
   * (Schlusslesung 03.08.2026).
   */
  const pruefeZustand = async () => {
    const { data, error } = await createClient()
      .from('hunts')
      .select('status')
      .eq('id', jagd.id)
      .maybeSingle()
    if (error) throw new Error(`Der Zustand der Jagd war nicht zu prüfen: ${error.message}`)
    // **`!data` heißt NICHT „gestartet".** Eine unsichtbare Zeile kann gelöscht
    // sein oder von RLS gefiltert; beides als „inzwischen gestartet" zu melden
    // ist eine erfundene Auskunft (Fremdprüfung 03.08.2026, F4). Ein Nutzer,
    // dem gerade die Leitung entzogen wurde, wartet sonst auf ein Jagdende,
    // das es nicht gibt.
    if (!data) {
      nachladen()
      throw new Error(
        'Diese Jagd ist nicht mehr erreichbar — gelöscht, oder die Leitung liegt ' +
          'nicht mehr bei dir. Die Seite lädt gerade den neuen Stand.'
      )
    }
    if (!vorbereitbar(data.status)) {
      nachladen()
      throw new Error(
        'Diese Jagd wurde inzwischen gestartet oder beendet. Ab da gehört sie der ' +
          'Feld-App — die Seite lädt gerade den neuen Stand.'
      )
    }
  }

  const jagdSpeichern = async (entwurf: JagdEntwurf) => {
    const patch = jagdAenderungen(entwurf, jagd)
    // Nichts geändert heißt nichts schreiben.
    if (!patch) {
      setBearbeiten(false)
      return
    }
    /*
     * **Erst schreiben, dann fragen warum — nicht umgekehrt.**
     *
     * Der Riegel gegen das Beschreiben einer laufenden Jagd ist der
     * Statusfilter unten; er ist atomar. Was fehlte, war die MELDUNG: am
     * 03.08.2026 am Bildschirm belegt, dass der Riegel hielt und `schreibe()`
     * drei Ursachen nannte, von denen keine zutraf.
     *
     * Die erste Fassung prüfte deshalb VOR dem Write — und machte aus einer
     * Diagnose ein zweites Tor (Fremdprüfung, F3): ein einmalig scheiternder
     * GET hätte ein UPDATE verhindert, das durchgelaufen wäre. Im Fehlerzweig
     * kostet die Prüfung nichts, kann nichts blockieren und beantwortet genau
     * die Frage, die dann offen ist.
     */
    try {
      await schreibe('Die Jagd', () =>
        createClient()
          .from('hunts')
          .update(patch)
          .eq('id', jagd.id)
          .in('status', VORBEREITBARE_STATUS)
          .select('id')
      )
    } catch (err) {
      // Findet `pruefeZustand()` einen benennbaren Grund, wirft es ihn; sonst
      // bleibt es bei der allgemeinen Meldung aus `schreibe()`.
      await pruefeZustand()
      throw err
    }
    setBearbeiten(false)
    nachladen()
  }

  /**
   * Einladen. **Ein INSERT für Neue, ein UPDATE für Abgesagte** — und das ist
   * kein Feinschliff, sondern der Kern:
   *
   * `hunt_participants` trägt `UNIQUE (hunt_id, user_id)`. Bis Migration 088
   * löschte eine Absage die Zeile, erneutes Einladen war also immer ein INSERT.
   * Seit 088 bleibt sie stehen — ein INSERT scheiterte an `23505`, und ein
   * einmal Abgesagter ließe sich nie wieder einladen.
   *
   * `left_at` wird dabei zurückgesetzt: eine Zeile auf `invited` mit einem
   * Absagedatum daneben behauptet zwei Dinge gleichzeitig.
   *
   * **Seit 03.08.2026 kommen Gäste ohne Konto dazu** — ein dritter Fall, und
   * der einfachste: `user_id = null`, `guest_name` gesetzt. Kein UPDATE-Zweig,
   * weil ein Gast keine Zeile haben KANN, die er wieder-einladen ließe: er hat
   * keine Kennung, an der man sie fände. Ein bereits eingetragener Gast steht
   * deshalb gar nicht erst zur Wahl (`kandidaten()` filtert über den Namen).
   *
   * **`guest_token` bleibt hier leer, und das ist Absicht.** Er ist der
   * Nachweis, dass jemand über `/join/<code>` selbst beigetreten ist — wer vom
   * Jagdleiter eingetragen wird, hat nichts nachgewiesen. Ein hier erfundener
   * Token wäre eine Behauptung, und die Join-Seite liest genau dieses Feld, um
   * Eingetragene von Beigetretenen zu unterscheiden.
   */
  const einladen = async (wahl: ReadonlyMap<string, SetzbareRolle>) => {
    await pruefeZustand()
    const client = createClient()
    const schluessel = [...wahl.keys()]
    const vorhandene = new Map(teilnehmer.filter((t) => t.user_id).map((t) => [t.user_id!, t]))
    // Aus dem Schlüssel zurück auf den Kandidaten: er trägt Name und `userId`,
    // und beides braucht der Write. Über die Kandidatenliste statt über zwei
    // getrennte Parameter — dann kann der Aufrufer die zwei Fälle nicht
    // verwechseln.
    const gewaehlteKandidaten = schluessel
      .map((s) => alleKandidaten.find((k) => k.schluessel === s))
      .filter((k): k is NonNullable<typeof k> => Boolean(k))

    // **Ein Schlüssel ohne Kandidat wird NICHT still verworfen** (Fremdprüfung
    // 03.08.2026, B4). Die Auswahl überlebt einen `router.refresh()`, die
    // Kandidatenliste nicht: wer inzwischen von woanders eingeladen wurde,
    // verschwindet aus `alleKandidaten` und bliebe im Set stehen. Der Knopf
    // sagte dann „12 einladen", geschrieben würden 10 — ein Teilfehlschlag, der
    // sich als voller Erfolg liest. Genau die Klasse, gegen die `schreibe()`
    // gebaut ist, nur eine Ebene höher.
    if (gewaehlteKandidaten.length !== schluessel.length) {
      const fehlend = schluessel.length - gewaehlteKandidaten.length
      nachladen()
      throw new Error(
        `${fehlend} der ${schluessel.length} Ausgewählten stehen nicht mehr zur Wahl — ` +
          'sie wurden inzwischen anderswo eingeladen oder entfernt. Es wurde nichts ' +
          'geschrieben; die Seite lädt gerade den neuen Stand.',
      )
    }

    /**
     * **`finally`, nicht am Ende des Erfolgspfads** (Codex-Befund 2): die Writes
     * committen einzeln. Scheitert der dritte von fünf, stehen die ersten beiden
     * dauerhaft in der DB — der Client hielte aber weiter seine alten Props und
     * klassifizierte die zwei beim zweiten Versuch erneut als INSERT, direkt in
     * `23505` (UNIQUE hunt_id, user_id). Der Nutzer sähe zweimal einen Fehler,
     * obwohl beim ersten Mal die Hälfte geglückt war.
     *
     * Mit dem Refresh im `finally` ist der zweite Versuch auf dem frischen
     * Stand und tut genau das, was noch fehlt.
     */
    // **Zählt mit, wie viele schon durch sind** (Fremdprüfung 03.08.2026,
    // B3/B11). Die Writes committen einzeln; scheitert der 7. von 20, stehen 6
    // dauerhaft in der DB, 13 wurden nie versucht, und die Auswahl wird gleich
    // darauf geleert. Ohne diese Zahl liest sich die Meldung, als sei gar
    // nichts passiert — der Nutzer wählt alle 20 erneut und läuft beim ersten
    // in `23505`.
    let geschrieben = 0
    try {
      for (const kandidat of gewaehlteKandidaten) {
        // Die Rolle steht in der Auswahl, nicht im aktiven Filter — s. dort.
        const rolleFuer = wahl.get(kandidat.schluessel) ?? 'schuetze'
        if (!kandidat.userId) {
          await schreibe('Die Einladung', () =>
            client
              .from('hunt_participants')
              .insert({
                hunt_id: jagd.id,
                user_id: null,
                guest_name: kandidat.name,
                role: rolleFuer,
                status: 'invited',
              })
              .select('id')
          )
          geschrieben++
          continue
        }
        const alt = vorhandene.get(kandidat.userId)
        if (alt) {
          /**
           * **`.eq('status', 'declined')` ist der Riegel, nicht Zierat**
           * (Schlusslesung 03.08.2026). Ohne ihn wurde aus dem
           * Wiederholungspfad ein Schreibweg, der eine Zusage zurückdreht: nach
           * einem Teilerfolg blieb die schon eingeladene Person in der Auswahl
           * stehen; hatte sie inzwischen in der App zugesagt, setzte der zweite
           * Klick sie kommentarlos auf `invited` zurück und nahm ihr `joined_at`.
           *
           * Mit dem Filter trifft das UPDATE 0 Zeilen, und `schreibe()` macht
           * daraus einen lauten Fehler statt einer stillen Rückstufung.
           */
          await schreibe('Die Einladung', () =>
            client
              .from('hunt_participants')
              .update({ status: 'invited', left_at: null, joined_at: null })
              .eq('id', alt.id)
              .eq('status', 'declined')
              .select('id')
          )
          geschrieben++
        } else {
          await schreibe('Die Einladung', () =>
            client
              .from('hunt_participants')
              .insert({
                hunt_id: jagd.id,
                user_id: kandidat.userId,
                role: rolleFuer,
                status: 'invited',
              })
              .select('id')
          )
          geschrieben++
        }
      }
    } catch (err) {
      // Die Zahl davor, nicht dahinter: sie ist die Handlungsanweisung („die
      // ersten sechs stehen, fang beim siebten an"), die Ursache nur die
      // Erklärung. Beim ersten Fehlschlag steht sie nicht da — dann wäre „0 von
      // 20" ein Rauschen vor der eigentlichen Meldung.
      const rumpf = err instanceof Error ? err.message : 'Unbekannter Fehler beim Einladen.'
      throw new Error(
        geschrieben > 0
          ? `${geschrieben} von ${gewaehlteKandidaten.length} sind eingeladen, dann brach es ab: ${rumpf}`
          : rumpf,
      )
    } finally {
      nachladen()
    }
  }

  const teilnehmerAendern = async (id: string, patch: Record<string, unknown>) => {
    await pruefeZustand()
    await schreibe('Der Teilnehmer', () =>
      createClient().from('hunt_participants').update(patch).eq('id', id).select('id')
    )
    nachladen()
  }

  /**
   * Entfernen — ein DELETE, keine Statusänderung.
   *
   * `participant_status` kennt keinen Wert für „vom Leiter entfernt": `left`
   * heißt „selbst gegangen", `declined` „selbst abgesagt". Einen dritten Wert
   * zu erfinden wäre eine Migration, und Migrationen schreibt der native Track
   * (Parallelitäts-Vertrag R2). Ein DELETE sagt außerdem die Wahrheit: die
   * Einladung hat es nie gegeben.
   *
   * **`kills_participant_id_fkey` kann das verhindern**, und das ist gut so —
   * wer schon gemeldet hat, verschwindet nicht aus der Strecke. Der
   * Fremdschlüssel meldet sich mit `23503` und einem englischen Constraint-Namen;
   * hier wird daraus ein Satz, der das Problem benennt.
   */
  const entfernen = async (id: string) => {
    await pruefeZustand()
    try {
      await schreibe('Der Teilnehmer', () =>
        createClient().from('hunt_participants').delete().eq('id', id).select('id')
      )
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      if (text.includes('kills_participant_id_fkey') || text.includes('23503')) {
        throw new Error(
          'Diese Person hat in dieser Jagd bereits eine Erlegung gemeldet und lässt ' +
            'sich deshalb nicht entfernen. Die Strecke bliebe sonst ohne Melder.'
        )
      }
      throw err
    }
    nachladen()
  }

  const zurueck = revierId ? `/zentrale/jagden?revier=${revierId}` : '/zentrale/jagden'

  return (
    <>
      <p className="jagden-zurueck">
        <Link href={zurueck}>← Alle Jagden</Link>
      </p>

      {bearbeiten ? (
        <JagdFormular
          jagd={jagd}
          aufSichern={jagdSpeichern}
          aufAbbrechen={() => setBearbeiten(false)}
        />
      ) : (
        <>
          {/* Derselbe Revierkopf wie auf der Liste. Wer eine Jagd bearbeitet,
              soll ohne Hinsehen wissen, wessen Revier er gerade anfasst. */}
          <div className="zentrale-revier">
            <span className="zentrale-revier-label">Revier</span>
            <span className="zentrale-revier-name">{revierName ?? 'Unbekannt'}</span>
          </div>
          <h1>{jagd.name || 'Ohne Namen'}</h1>
          <p className="zentrale-sub">
            {jagdart(jagd.type)} · {terminText(termin(jagd))}
          </p>

          <div className="jagden-kopfzeile">
            <span
              className={`jagden-pille${laeuft(jagd.status) ? ' ist-live' : ''}${
                vorbereitbar(jagd.status) ? ' ist-offen' : ''
              }`}
            >
              {jagdstatus(jagd.status)}
            </span>
            {schreibbar ? (
              // `laedtNach` sperrt mit: sonst öffnete sich das Formular während
              // des Refresh auf den veralteten Props, und die gerade
              // gespeicherte Änderung sähe für Sekunden aus wie verschwunden.
              <button type="button" disabled={laedtNach} onClick={() => setBearbeiten(true)}>
                Bearbeiten
              </button>
            ) : null}
          </div>

          {!schreibbar ? (
            <div className="zentrale-note">
              <p style={{ margin: 0 }}>
                {!istLeiter
                  ? 'Vorbereiten kann nur, wer die Jagd angelegt hat oder als Jagdleiter zugesagt hat.'
                  : laeuft(jagd.status)
                    ? 'Diese Jagd läuft. Der Jagdtag wird in der Feld-App gesteuert — im Portal ist sie so lange unveränderlich.'
                    : 'Diese Jagd ist beendet und lässt sich nicht mehr ändern.'}
              </p>
            </div>
          ) : null}
        </>
      )}

      {fehler ? (
        <p className="zentrale-inspektor-fehler" role="alert">
          {fehler}
        </p>
      ) : null}

      <h2 className="jagden-abschnitt">Teilnehmer</h2>

      {teilnehmer.length === 0 ? (
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>Noch niemand eingeladen.</p>
        </div>
      ) : (
        <>
          <p className="jagden-teilnehmer-summe">
            {zugesagt} zugesagt
            {offen > 0 ? <> · {offen} offen</> : null}
          </p>

          <div className="jagden-tabellenkasten">
            <table className="zentrale-tabelle jagden-tabelle">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Rolle</th>
                  <th scope="col">Merkmale</th>
                  <th scope="col">Stand</th>
                  <th scope="col">
                    <span className="zentrale-nur-vorleser">Aktionen</span>
                  </th>
                </tr>
              </thead>
              {/*
               * **Ein `tbody` je Zustandsgruppe, und die Zwischenzeile nur bei
               * mehr als einer.** Eine Jagd mit zwei Zugesagten bekäme sonst
               * eine Gliederung für eine einzige Gruppe — Verwaltungsarchitektur
               * für zwei Leute. Ab zwei Zuständen trägt dieselbe Zeile die
               * Orientierung, die bei 40 Personen nötig wird.
               *
               * `g.status` steht roh als Schlüssel da: `|| 'unbekannt'`
               * kollidierte mit einem echten Status dieses Namens
               * (Fremdprüfung, F5). Der leere String ist ein gültiger,
               * eindeutiger Schlüssel.
               */}
              {gruppen.map((g) => (
                <tbody key={g.status}>
                  {gruppen.length > 1 ? (
                    <tr className="jagden-gruppenzeile">
                      {/* `rowgroup`, nicht `colgroup` — die Zeile betitelt die
                          Teilnehmer darunter, keine Spalten (Fremdprüfung, F5). */}
                      <th scope="rowgroup" colSpan={5}>
                        {g.titel}
                        <span className="jagden-gruppenzahl">{g.eintraege.length}</span>
                      </th>
                    </tr>
                  ) : null}
                  {g.eintraege.map((t) => (
                    <Zeile
                      key={t.id}
                      teilnehmer={t}
                      name={teilnehmerName(t, namen)}
                      /** Der Ersteller bleibt unantastbar — s. `Zeile`. */
                      istErstellerZeile={t.user_id === erstellerId}
                      schreibbar={schreibbar}
                      gesperrt={laedtNach}
                      aufAendern={teilnehmerAendern}
                      aufEntfernen={entfernen}
                      aufFehler={setFehler}
                    />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}

      {schreibbar ? (
        <Einladen kandidaten={alleKandidaten} gesperrt={laedtNach} aufEinladen={einladen} />
      ) : null}
    </>
  )
}

/**
 * Name, Termin und Jagdart ändern.
 *
 * Der Riegel gegen doppeltes Absenden ist ein **Ref**, kein State: zwischen
 * `setLaeuft(true)` und dem sperrenden Render sehen Return-Taste und Knopfdruck
 * beide noch `false`. Gleiche Stelle und gleiche Begründung wie im
 * Gäste-Formular — und dieselbe, an der `handleDecline` der App am 03.08.2026
 * als Befund auffiel.
 */
function JagdFormular({
  jagd,
  aufSichern,
  aufAbbrechen,
}: {
  jagd: Jagd
  aufSichern: (entwurf: JagdEntwurf) => Promise<void>
  aufAbbrechen: () => void
}) {
  const [entwurf, setEntwurf] = useState<JagdEntwurf>({
    name: jagd.name ?? '',
    termin: alsEingabewert(jagd.scheduled_for ?? jagd.started_at),
    type: jagd.type ?? 'ansitz',
  })
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const inArbeit = useRef(false)

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inArbeit.current) return

    const problem = pruefeJagdEntwurf(entwurf)
    if (problem) {
      setFehler(problem)
      return
    }

    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await aufSichern(entwurf)
    } catch (err) {
      // Der Entwurf bleibt vollständig stehen (Backlog E-R2).
      setFehler(err instanceof Error ? err.message : 'Unbekannter Fehler beim Speichern.')
    } finally {
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  return (
    <form className="jagden-formular" onSubmit={absenden}>
      <h1>Jagd bearbeiten</h1>

      <div className="zentrale-inspektor-feld">
        <div>
          <label htmlFor="jagd-name">Name</label>
          <input
            id="jagd-name"
            value={entwurf.name}
            disabled={laeuft}
            autoFocus
            placeholder={namensvorschlag(entwurf.termin)}
            onChange={(e) => setEntwurf((v) => ({ ...v, name: e.target.value }))}
          />
        </div>

        <div>
          <label htmlFor="jagd-termin">Termin</label>
          <input
            id="jagd-termin"
            type="datetime-local"
            value={entwurf.termin}
            disabled={laeuft}
            onChange={(e) => setEntwurf((v) => ({ ...v, termin: e.target.value }))}
          />
        </div>

        <div>
          <label htmlFor="jagd-art">Jagdart</label>
          <select
            id="jagd-art"
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

      {fehler ? (
        <p className="zentrale-inspektor-fehler" role="alert">
          {fehler}
        </p>
      ) : null}

      <div className="zentrale-inspektor-fuss">
        <button type="submit" className="haupt" disabled={laeuft}>
          {laeuft ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <button type="button" onClick={aufAbbrechen} disabled={laeuft}>
          Abbrechen
        </button>
      </div>
    </form>
  )
}

/**
 * Eine Teilnehmerzeile.
 *
 * **Die Zeile des Erstellers ist unantastbar**, und das hat einen gemessenen
 * Grund: `participants_leader_all` ist `for all`, ein Co-Leiter könnte die Zeile
 * des Erstellers also umschreiben und ihm damit das Sicherheitsnetz beim Melden
 * nehmen (`fetchTodaysScheduledLeaderHunt` hängt an ihr). Rechte verliert der
 * Ersteller dabei nie — die Creator-Policies bleiben —, aber Komfort schon.
 * Randnotiz der Schlusslesung vom 03.08.2026, hier als Riegel eingelöst.
 *
 * **`jagdleiter` steht in keinem Auswahlfeld.** Die Rolle wirkt an drei
 * Stellen, und „Leiter übertragen" ist ein Feature mit eigener Rückfrage —
 * nicht etwas, das man beim Scrollen durch eine Teilnehmerliste erwischt.
 */
function Zeile({
  teilnehmer: t,
  name,
  istErstellerZeile,
  schreibbar,
  gesperrt,
  aufAendern,
  aufEntfernen,
  aufFehler,
}: {
  teilnehmer: Teilnehmer
  name: string
  istErstellerZeile: boolean
  schreibbar: boolean
  /** Ein Refresh läuft — die Props sind bis dahin veraltet. */
  gesperrt: boolean
  aufAendern: (id: string, patch: Record<string, unknown>) => Promise<void>
  aufEntfernen: (id: string) => Promise<void>
  aufFehler: (meldung: string | null) => void
}) {
  const [frage, setFrage] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const inArbeit = useRef(false)

  const blockiert = laeuft || gesperrt
  const aenderbar = schreibbar && !istErstellerZeile && t.role !== 'jagdleiter'

  const fuehreAus = async (was: () => Promise<void>) => {
    if (inArbeit.current) return
    inArbeit.current = true
    setLaeuft(true)
    aufFehler(null)
    try {
      await was()
    } catch (err) {
      aufFehler(err instanceof Error ? err.message : 'Unbekannter Fehler.')
    } finally {
      inArbeit.current = false
      setLaeuft(false)
      setFrage(false)
    }
  }

  const tagsUmschalten = (wert: string) => {
    const jetzt = t.tags ?? []
    const neu = jetzt.includes(wert) ? jetzt.filter((x) => x !== wert) : [...jetzt, wert]
    void fuehreAus(() => aufAendern(t.id, { tags: neu }))
  }

  return (
    <tr>
      <td>{name}</td>

      <td>
        {aenderbar ? (
          <select
            value={SETZBARE_ROLLEN.includes(t.role as never) ? (t.role as string) : 'schuetze'}
            disabled={blockiert}
            aria-label={`Rolle von ${name}`}
            onChange={(e) => void fuehreAus(() => aufAendern(t.id, { role: e.target.value }))}
          >
            {SETZBARE_ROLLEN.map((r) => (
              <option key={r} value={r}>
                {rolle(r)}
              </option>
            ))}
          </select>
        ) : (
          rolle(t.role)
        )}
      </td>

      <td>
        {aenderbar ? (
          <span className="jagden-tags">
            {TAGS.map((wert) => (
              <label key={wert} className="jagden-tag-wahl">
                <input
                  type="checkbox"
                  checked={(t.tags ?? []).includes(wert)}
                  disabled={blockiert}
                  onChange={() => tagsUmschalten(wert)}
                />
                {tag(wert)}
              </label>
            ))}
          </span>
        ) : (
          (t.tags ?? []).map(tag).join(', ') || '—'
        )}
      </td>

      <td>
        {/**
          * **Für Gäste ist der Zustand setzbar, für Konten nicht** —
          * Schlusslesung 03.08.2026, offener Punkt.
          *
          * Ein Konto antwortet selbst, in der App. Diese Zelle dort zu einem
          * Auswahlfeld zu machen hieße, eine fremde Willenserklärung zu
          * überschreiben: der Jagdleiter setzte „zugesagt" für jemanden, der
          * nichts gesagt hat.
          *
          * **Ein Gast kann nicht selbst antworten, und das ist keine
          * Bequemlichkeitsfrage, sondern eine Sackgasse:** er hat kein Konto,
          * der Weg über `/join/<code>` ist verschlossen (s. `Einladen`), und
          * bis hierher konnte auch der Jagdleiter den Zustand nicht ändern —
          * die Zeile bot nur `role` und `tags`. Ein eingetragener Gast wäre
          * damit dauerhaft „Eingeladen" geblieben und hätte für immer im
          * „N offen" der Kopfzeile mitgezählt. Die Zahl hätte behauptet, dort
          * stünden Antworten aus, wo keine kommen können.
          *
          * Der Jagdleiter erfährt die Zusage ohnehin selbst — er hat den Gast
          * angerufen oder ihm geschrieben; es gibt keinen anderen Weg zu ihm.
          * Hier trägt er ein, was er weiß.
          */}
        {/* **Nur für Zustände, die das Feld auch anbietet** (Delta-Durchgang
            03.08.2026, D3). Stünde in der Zeile `left` oder `null`, zeigte das
            Feld „Eingeladen" — und weil `onChange` beim Wählen des bereits
            angezeigten Werts nicht feuert, ließe sich die Abweichung nicht
            einmal wegklicken. Lieber der wahre Zustand als Text: der Fall ist
            über keinen Weg herstellbar (ein Gast kann weder absagen noch
            austreten, beide RPCs brauchen ein Konto), und wenn er doch
            entsteht, will man ihn SEHEN, nicht überschrieben bekommen. */}
        {aenderbar && !t.user_id && GAST_ZUSTAENDE.includes(t.status as never) ? (
          <select
            value={t.status as string}
            disabled={blockiert}
            aria-label={`Zustand von ${name}`}
            onChange={(e) => void fuehreAus(() => aufAendern(t.id, gastZustand(e.target.value)))}
          >
            {GAST_ZUSTAENDE.map((z) => (
              <option key={z} value={z}>
                {teilnahme(z)}
              </option>
            ))}
          </select>
        ) : (
          <span className={`jagden-stand ist-${t.status ?? 'unbekannt'}`}>{teilnahme(t.status)}</span>
        )}
      </td>

      <td className="jagden-aktionen">
        {!schreibbar || istErstellerZeile ? null : frage ? (
          <>
            <button
              type="button"
              disabled={blockiert}
              onClick={() => setFrage(false)}
              autoFocus
            >
              Behalten
            </button>
            <button
              type="button"
              className="warn"
              disabled={blockiert}
              onClick={() => void fuehreAus(() => aufEntfernen(t.id))}
            >
              {laeuft ? 'Wird entfernt …' : 'Wirklich entfernen'}
            </button>
          </>
        ) : (
          <button type="button" disabled={blockiert} onClick={() => setFrage(true)}>
            Entfernen
          </button>
        )}
      </td>
    </tr>
  )
}

/**
 * Einladen — Konten und Adressbuch in EINER Liste, nach Kategorie filterbar.
 *
 * **Moritz' Vorgabe vom 03.08.2026, wörtlich:** *„ich will das aber wirklich
 * übersichtlich getrennt können. also wenn ich schützen einlade will ich die
 * treiber da nicht sehen. entweder über filter oder eigene tabellen."*
 *
 * **Filter, nicht eigene Tabellen** (Codex, 03.08.2026, auf genau diese Frage).
 * Vier Tabellen untereinander sprengen bei 154 Kontakten die Seite, und eine
 * Person mit drei Kategorien stünde dreimal da — mit drei Kästchen für eine
 * Einladung. Der Filter zeigt jede Person genau einmal.
 *
 * **Die Auswahl überlebt den Filterwechsel**, sonst wäre ein Durchgang mit 40
 * Leuten nicht zu schaffen: erst alle Schützen, dann alle Treiber. Damit kann
 * aber ausgewählt sein, was man gerade nicht sieht — Codex' eigener Einwand
 * gegen seinen Vorschlag. Dagegen zwei Dinge, und sie sind keine Zugabe: der
 * Zähler am Knopf sagt, DASS da etwas ist, und der Filter „Ausgewählt" zeigt,
 * WAS.
 *
 * **Mit Suche, anders als bisher.** Bei 9 Profilen war der Verzicht richtig;
 * bei 154 Kontakten ist es eine andere Größenordnung — und die Suche ist der
 * einzige Weg zu jemandem, der noch keine Kategorie hat und dessen Namen man
 * kennt.
 *
 * **Hier stand kurzzeitig ein Einladungslink, und er ist wieder raus.** Der
 * naheliegende zweite Weg für Menschen ohne Konto wäre `hunts.invite_code` mit
 * `/join/<code>` — die Seite gibt es, jede der 41 Jagden hat einen Code, und
 * `hunt_participants` trägt seit Migration 003 `guest_token` genau dafür.
 * **Der Weg ist tot, gemessen am 03.08.2026 gegen die Produktion** (Testrevier
 * L7, alles mit ROLLBACK):
 *
 * - `anon` liest `hunts` per `invite_code` -> **0 Zeilen**; die Join-Seite
 *   meldet „Einladungslink ungültig oder abgelaufen", bevor irgendetwas
 *   passiert.
 * - `anon` INSERT auf `hunt_participants` -> **42501**.
 * - Ein ANGEMELDETER Fremder: dasselbe, 0 Zeilen und 42501. Alle vier Policies
 *   verlangen, Ersteller oder Jagdleiter zu sein.
 * - Positivkontrolle: der Ersteller legt eine Gast-Zeile an -> durchgelaufen.
 *   **Genau der Pfad, den `einladen()` oben nimmt.**
 *
 * Aufgefallen ist es nie, weil ihn nie jemand benutzt hat: `guest_token` ist
 * bei **0 von 93** Teilnehmerzeilen gesetzt. Ein Knopf dafür wäre der S2-Fall
 * aus dem Standard-Focus gewesen — eine Fläche, die einen Weg verspricht, den
 * die Policies verweigern.
 *
 * **Was das offenlässt und was nicht:** wer nie ein Konto haben wird, steht
 * über die Gästeliste vollständig auf der Teilnehmerliste — dafür braucht es
 * den Link nicht. Wer die App bekommen SOLL, kommt heute nur über einen
 * Begehungsschein herein. Den Link-Weg wieder aufzumachen wäre eine
 * INSERT-Policy, also DDL, also der native Track (R2) und Anker 2.
 */
function Einladen({
  kandidaten,
  gesperrt,
  aufEinladen,
}: {
  kandidaten: Kandidat[]
  /** Ein Refresh läuft — die Kandidatenliste ist bis dahin veraltet. */
  gesperrt: boolean
  aufEinladen: (wahl: ReadonlyMap<string, SetzbareRolle>) => Promise<void>
}) {
  /**
   * **Eine `Map`, kein `Set` — der Wert ist die Rolle.**
   *
   * Die Rolle wird beim ANHAKEN festgehalten, nicht beim Absenden, und daran
   * hängt der ganze Durchgang „erst alle Schützen, dann alle Treiber": beim
   * Absenden ist nur noch EIN Filter aktiv, die Auswahl stammt aber aus
   * mehreren. Ein `rolleBeimEinladen(k, filter)` im Schreibpfad hätte die
   * vorher gewählten Schützen zu Treibern gemacht — schlimmer als die
   * Pauschalrolle, die es vorher gab, weil es aussieht wie eine Verbesserung.
   */
  const [gewaehlt, setGewaehlt] = useState<Map<string, SetzbareRolle>>(new Map())
  const [filter, setFilter] = useState<EinladeFilter>('alle')
  const [suche, setSuche] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const inArbeit = useRef(false)

  const blockiert = laeuft || gesperrt

  const zahlen = useMemo(() => filterZaehler(kandidaten, gewaehlt), [kandidaten, gewaehlt])

  /**
   * Die Aufschlüsselung neben dem Knopf — **nur über die, die wirklich eine
   * Rolle bekommen** (Delta-Durchgang 03.08.2026, R7).
   *
   * Ein wieder eingeladener Abgesagter läuft über ein UPDATE, das `role`
   * ausdrücklich NICHT anfasst (s. `einladen()`). Zählte er hier mit, versprach
   * der Text eine Einordnung, die nie geschrieben wird — und beim ersten
   * Durchgang mit gemischter Auswahl wäre die Zahl schlicht falsch.
   */
  const verteilung = useMemo(() => {
    const neue = [...gewaehlt.entries()]
      .filter(([sch]) => !kandidaten.find((k) => k.schluessel === sch)?.erneut)
      .map(([, r]) => r)
    return rollenVerteilung(neue)
  }, [gewaehlt, kandidaten])
  const sichtbar = useMemo(
    () => sichtbareKandidaten(kandidaten, filter, suche, gewaehlt, suchtext),
    [kandidaten, filter, suche, gewaehlt]
  )

  const umschalten = (k: Kandidat) =>
    setGewaehlt((v) => {
      const neu = new Map(v)
      if (neu.has(k.schluessel)) neu.delete(k.schluessel)
      else neu.set(k.schluessel, rolleBeimEinladen(k, filter))
      return neu
    })

  /**
   * Alle Sichtbaren auf einmal — der Grund, warum ein 40-Personen-Durchgang
   * überhaupt zumutbar ist. Wirkt **nur auf das gerade Sichtbare**: Filter und
   * Suche sind die Auswahl, der Knopf führt sie nur aus.
   *
   * Er setzt oder räumt, je nachdem, ob schon alles Sichtbare gewählt ist —
   * damit ist derselbe Knopf auch der Rückweg aus einem Fehlgriff.
   */
  const alleSichtbaren = () => {
    const alleDrin = sichtbar.length > 0 && sichtbar.every((k) => gewaehlt.has(k.schluessel))
    setGewaehlt((v) => {
      const neu = new Map(v)
      for (const k of sichtbar) {
        if (alleDrin) neu.delete(k.schluessel)
        // **`if (!neu.has(...))` — die Sammelauswahl fasst keine schon
        // festgehaltene Rolle an** (Delta-Durchgang 03.08.2026, R3). Ohne den
        // Riegel machte sie aus „beim Anhaken festgehalten" eine Lüge: wer als
        // Schütze gewählt war und beim Treiber-Durchgang mit erfasst wird, weil
        // er beide Kategorien trägt, wäre stillschweigend zum Treiber geworden.
        // Genau der Fall, für den die Map überhaupt gebaut wurde.
        else if (!neu.has(k.schluessel)) neu.set(k.schluessel, rolleBeimEinladen(k, filter))
      }
      return neu
    })
  }

  const absenden = async () => {
    if (inArbeit.current || gewaehlt.size === 0) return
    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await aufEinladen(gewaehlt)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Unbekannter Fehler beim Einladen.')
    } finally {
      // **Die Auswahl wird IMMER geleert, auch nach einem Fehler**
      // (Schlusslesung 03.08.2026). Vorher überlebte sie den Fehlschlag: wer
      // schon eingeladen war, verschwand aus der Liste, blieb aber in der
      // Auswahl — unsichtbar, nicht abwählbar, vom Knopf mitgezählt („2
      // einladen" bei einer sichtbaren Zeile), und beim nächsten Klick erneut
      // mitgeschickt. Nach dem Refresh steht ohnehin der frische Stand da; wer
      // weitermachen will, wählt aus dem, was wirklich noch offen ist.
      setGewaehlt(new Map())
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  if (kandidaten.length === 0) {
    return (
      <>
        <h2 className="jagden-abschnitt">Einladen</h2>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Niemand steht mehr zur Wahl. Wer noch fehlt, kommt zuerst in die{' '}
            <Link href="/zentrale/gaeste">Gästeliste</Link> — von dort steht er
            beim nächsten Mal hier.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="jagden-abschnitt">Einladen</h2>

      <div className="jagden-einladen-kopf">
        {/* Die Zahl steht AM Schalter, nicht erst nach dem Klick: „Treiber 0"
            heißt „dort ist niemand eingeordnet" — ohne die Zahl müsste man
            jeden Filter durchprobieren, um das herauszufinden. */}
        <div className="jagden-filter" role="group" aria-label="Nach Kategorie filtern">
          {EINLADE_FILTER.map((f) => (
            <button
              key={f.wert}
              type="button"
              className="jagden-chip"
              aria-pressed={filter === f.wert}
              disabled={blockiert}
              onClick={() => setFilter(f.wert)}
            >
              {f.label} <span className="jagden-chip-zahl">{zahlen[f.wert]}</span>
            </button>
          ))}
        </div>

        <label className="jagden-suche">
          <span className="jagden-suche-label">Suchen</span>
          <input
            type="search"
            value={suche}
            disabled={blockiert}
            placeholder="Name suchen …"
            onChange={(e) => setSuche(e.target.value)}
          />
        </label>
      </div>

      {sichtbar.length === 0 ? (
        // Vier Fälle statt drei, Begründung bei `leerText()` in `../jagden.ts`
        <p className="jagden-leer">{leerText(filter, suche)}</p>
      ) : (
        <>
          <div className="jagden-einladen">
            {sichtbar.map((k) => (
              <label key={k.schluessel} className="jagden-kandidat">
                <input
                  type="checkbox"
                  checked={gewaehlt.has(k.schluessel)}
                  disabled={blockiert}
                  onChange={() => umschalten(k)}
                />
                {k.name}
                {/* „hatte abgesagt" ist eine Warnung, „ohne Konto" eine
                    Sacherklärung: die Person bekommt keine Einladung aufs
                    Handy, sie steht auf der Liste. Wer das nicht weiß, wartet
                    auf eine Zusage, die nie kommt. */}
                {k.erneut ? <span className="jagden-erneut"> hatte abgesagt</span> : null}
                {!k.userId ? <span className="jagden-gast"> ohne Konto</span> : null}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="jagden-alle"
            disabled={blockiert}
            onClick={alleSichtbaren}
          >
            {sichtbar.every((k) => gewaehlt.has(k.schluessel))
              ? `Diese ${sichtbar.length} abwählen`
              : `Diese ${sichtbar.length} auswählen`}
          </button>
        </>
      )}

      {fehler ? (
        <p className="zentrale-inspektor-fehler" role="alert">
          {fehler}
        </p>
      ) : null}

      <div className="zentrale-inspektor-fuss">
        <button
          type="button"
          className="haupt"
          disabled={blockiert || gewaehlt.size === 0}
          onClick={absenden}
        >
          {laeuft ? 'Wird eingeladen …' : `${gewaehlt.size || ''} einladen`.trim()}
        </button>
        {/* **Die abgeleitete Rolle wird gezeigt, nicht still angewandt.** „12
            einladen" sagt nichts darüber, dass vier davon als Treiber in die
            Jagd gehen. Steht nur bei gemischter Auswahl da — bei einer
            einzigen Rolle wäre es Lärm. */}
        {verteilung ? <span className="jagden-verteilung">{verteilung}</span> : null}
        {/* **Der Riegel gegen den einen Fehler, den dieser Entwurf ermöglicht**
            (Codex' eigener Punkt 7): wer Schützen wählt, zu Treibern wechselt
            und dort weiterwählt, lädt beide Gruppen ein, ohne es zu sehen.
            Steht nur da, wenn tatsächlich etwas verborgen ist — sonst wäre es
            ein Hinweis auf nichts. */}
        {gewaehlt.size > sichtbar.filter((k) => gewaehlt.has(k.schluessel)).length ? (
          <button
            type="button"
            className="jagden-versteckt"
            onClick={() => {
              // **Auch die Suche leeren** (Fremdprüfung 03.08.2026, B8): nur
              // den Filter umzustellen zeigte die Ausgewählten weiterhin
              // gefiltert — der Knopf verspricht „anzeigen" und zeigte dann
              // wieder nicht alle. Ein Knopf, der sein eigenes Versprechen
              // halb einlöst, ist schlimmer als keiner.
              setSuche('')
              setFilter('gewaehlt')
            }}
          >
            {gewaehlt.size} ausgewählt, nicht alle sichtbar — anzeigen
          </button>
        ) : null}
      </div>
    </>
  )
}
