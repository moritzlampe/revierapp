'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../../schreiben'
import {
  alsEingabewert,
  jagdAenderungen,
  jagdart,
  jagdstatus,
  laeuft,
  namensvorschlag,
  pruefeJagdEntwurf,
  rolle,
  sortiereTeilnehmer,
  tag,
  teilnahme,
  teilnehmerName,
  termin,
  terminText,
  vorbereitbar,
  VORBEREITBARE_STATUS,
  wiederEinladbar,
  JAGDARTEN,
  SETZBARE_ROLLEN,
  TAGS,
  type Jagd,
  type JagdEntwurf,
  type Teilnehmer,
} from '../jagden'

interface Profil {
  id: string
  display_name: string | null
}

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
  eigeneId,
  erstellerId,
  istLeiter,
}: {
  jagd: Jagd
  revierName: string | null
  revierId: string | null
  teilnehmer: Teilnehmer[]
  profile: Profil[]
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
  const sortiert = useMemo(() => sortiereTeilnehmer(teilnehmer, namen), [teilnehmer, namen])

  /** Wer noch gar keine Zeile hat — nur die sind ein INSERT. */
  const einladbar = useMemo(() => {
    const dabei = new Set(teilnehmer.map((t) => t.user_id).filter(Boolean))
    return profile.filter((p) => p.id !== eigeneId && !dabei.has(p.id))
  }, [profile, teilnehmer, eigeneId])

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
    if (!data || !vorbereitbar(data.status)) {
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
    await schreibe('Die Jagd', () =>
      createClient()
        .from('hunts')
        .update(patch)
        .eq('id', jagd.id)
        .in('status', VORBEREITBARE_STATUS)
        .select('id')
    )
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
   */
  const einladen = async (userIds: string[]) => {
    await pruefeZustand()
    const client = createClient()
    const vorhandene = new Map(teilnehmer.filter((t) => t.user_id).map((t) => [t.user_id!, t]))

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
    try {
      for (const userId of userIds) {
        const alt = vorhandene.get(userId)
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
        } else {
          await schreibe('Die Einladung', () =>
            client
              .from('hunt_participants')
              .insert({ hunt_id: jagd.id, user_id: userId, role: 'schuetze', status: 'invited' })
              .select('id')
          )
        }
      }
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

      {sortiert.length === 0 ? (
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>Noch niemand eingeladen.</p>
        </div>
      ) : (
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
            <tbody>
              {sortiert.map((t) => (
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
          </table>
        </div>
      )}

      {schreibbar ? (
        <Einladen
          kandidaten={einladbar}
          abgesagte={teilnehmer.filter((t) => wiederEinladbar(t.status))}
          namen={namen}
          gesperrt={laedtNach}
          aufEinladen={einladen}
        />
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
        <span className={`jagden-stand ist-${t.status ?? 'unbekannt'}`}>{teilnahme(t.status)}</span>
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
 * Einladen — Neue und erneut Abgesagte in einer Auswahl.
 *
 * Ohne Suche, wie nativ: im Bestand stehen 9 Profile (03.08.2026). Die
 * Gästeliste mit 154 Namen hängt bewusst nicht daran — `kontakte.profil_id`
 * steht bei 0 von 154, das ist ein eigener Block (E3).
 */
function Einladen({
  kandidaten,
  abgesagte,
  namen,
  gesperrt,
  aufEinladen,
}: {
  kandidaten: Profil[]
  abgesagte: Teilnehmer[]
  namen: Record<string, string>
  /** Ein Refresh läuft — die Kandidatenliste ist bis dahin veraltet. */
  gesperrt: boolean
  aufEinladen: (userIds: string[]) => Promise<void>
}) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set())
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const inArbeit = useRef(false)

  const blockiert = laeuft || gesperrt

  const umschalten = (id: string) =>
    setGewaehlt((v) => {
      const neu = new Set(v)
      if (neu.has(id)) neu.delete(id)
      else neu.add(id)
      return neu
    })

  const absenden = async () => {
    if (inArbeit.current || gewaehlt.size === 0) return
    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await aufEinladen([...gewaehlt])
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
      setGewaehlt(new Set())
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  const auswahl = [
    ...kandidaten.map((p) => ({ id: p.id, name: p.display_name || `Konto ${p.id.slice(0, 8)}`, erneut: false })),
    ...abgesagte
      .filter((t) => t.user_id)
      .map((t) => ({ id: t.user_id!, name: namen[t.user_id!] || `Konto ${t.user_id!.slice(0, 8)}`, erneut: true })),
  ]

  if (auswahl.length === 0) {
    return (
      <>
        <h2 className="jagden-abschnitt">Einladen</h2>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Alle bekannten Konten sind schon eingeladen. Wer noch kein Konto hat,
            kommt über einen Begehungsschein dazu.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="jagden-abschnitt">Einladen</h2>
      <div className="jagden-einladen">
        {auswahl.map((k) => (
          <label key={k.id} className="jagden-kandidat">
            <input
              type="checkbox"
              checked={gewaehlt.has(k.id)}
              disabled={blockiert}
              onChange={() => umschalten(k.id)}
            />
            {k.name}
            {k.erneut ? <span className="jagden-erneut"> hatte abgesagt</span> : null}
          </label>
        ))}
      </div>

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
      </div>
    </>
  )
}
