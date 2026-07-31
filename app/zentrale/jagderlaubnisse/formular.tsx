'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../schreiben'
import {
  alsEinloeseErgebnis,
  alsSpalten,
  alsStatus,
  effektiverStatus,
  einloeseText,
  jagdjahrEnde,
  pruefeEntwurf,
  zuteilungsArt,
  STATUS_LABEL,
  type Entwurf,
} from './scheine'

export type StandWahl = { id: string; name: string; typ: string }

export type ScheinZeile = {
  id: string
  holder_name: string
  holder_email: string | null
  holder_id: string | null
  valid_from: string
  valid_until: string
  status: string | null
  auflagen: string | null
  zone_ids: string[] | null
  stand_ids: string[] | null
  invite_code: string | null
}

// `timeZone: 'UTC'` ist tragend, nicht Kosmetik: der Wert ist ein Kalendertag
// der DB, kein Zeitpunkt. Ohne die Angabe rutscht `2026-08-01T00:00:00Z` in
// jeder Zeitzone westlich von UTC auf den 31.07. — die Liste zeigte einen
// anderen Tag als den, gegen den 077 die Zugriffsgrenze zieht. (Codex, 31.07.2026)
const datum = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})
const alsDatum = (iso: string) => datum.format(new Date(`${iso}T00:00:00Z`))

/**
 * Ausstellen und Verwalten der Begehungsscheine eines Reviers.
 *
 * Alle Schreibpfade laufen durch `schreibe()`: PostgREST liefert bei
 * RLS-gefilterten 0 Zeilen `{ data: null, error: null }`, und ohne diese eine
 * Tür wäre ein abgewiesener Schreibversuch von einem geglückten nicht zu
 * unterscheiden. Genau daran ist die PWA vier Mal still vorbeigelaufen
 * (Backlog E-R1).
 */
export default function Ausstellen({
  revierId,
  ausstellerId,
  staende,
  scheine,
  heute,
}: {
  revierId: string
  ausstellerId: string
  staende: StandWahl[]
  scheine: ScheinZeile[]
  /**
   * Der heutige Tag, **vom Server** (`heuteUtc()` in page.tsx).
   *
   * Nicht hier gerechnet, und das aus zwei Gründen. Erstens liefe die Rechnung
   * nach der Hydrierung auf der Uhr des Endgeräts — eine falsch gestellte Uhr
   * beschriftete Scheine dann anders, als die DB sie behandelt. Zweitens
   * ergäbe ein Tageswechsel zwischen Server-Render und Hydrierung zwei
   * verschiedene Werte für denselben Baum. Nachgemessen am 31.07.2026: die DB
   * steht auf UTC, `current_date` ist zeichengleich mit
   * `(now() at time zone 'utc')::date` — der Container tut dasselbe.
   * (Codex, 31.07.2026)
   */
  heute: string
}) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [von, setVon] = useState(heute)
  const [bis, setBis] = useState(() => jagdjahrEnde(heute))
  const [art, setArt] = useState<'revier' | 'staende'>('revier')
  const [standIds, setStandIds] = useState<readonly string[]>([])
  const [auflagen, setAuflagen] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  /**
   * Der Riegel gegen doppeltes Absenden ist ein Ref, kein State.
   *
   * Zwischen `setLaeuft(true)` und dem sperrenden Render sehen Return-Taste und
   * Knopfdruck beide noch `false`. Die DB bliebe dicht (der zweite INSERT legte
   * schlicht einen zweiten Schein an — schlimmer als ein Fehler), die Anzeige
   * nicht. Derselbe Befund wie im nativen Einlöse-Feld (Codex, 31.07.2026).
   */
  const inArbeit = useRef(false)

  const entwurf: Entwurf = { name, email, von, bis, art, standIds, auflagen }

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inArbeit.current) return

    const problem = pruefeEntwurf(entwurf)
    if (problem) {
      setFehler(problem)
      return
    }

    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      const angelegt = await schreibe<{ id: string }>('Begehungsschein', () =>
        createClient()
          .from('hunting_licenses')
          .insert(alsSpalten(entwurf, revierId, ausstellerId))
          .select('id')
      )

      // Benachrichtigen, aber niemals darauf warten und niemals daran
      // scheitern: der Schein IST angelegt: das ist der Vorgang, den der Nutzer
      // ausgelöst hat. Ein fehlgeschlagener Push darf ihn nicht als Fehler
      // aussehen lassen — und er ist ohnehin kein Zustellversprechen, denn wer
      // die App nie geöffnet hat, hat kein Gerät hinterlegt. Genau dafür steht
      // der Code kopierbar in der Liste.
      // Gleiche Bauform wie sendDrivePush in der nativen App.
      void fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'schein', licenseId: angelegt.id }),
      }).catch(() => {})
      // Zeitraum und Zuteilung stehen lassen: wer zwei Gästen denselben
      // Zeitraum gibt, tippt ihn sonst zweimal. Person und Auflagen sind
      // dagegen genau das, was sich je Schein unterscheidet.
      setName('')
      setEmail('')
      setAuflagen('')
      router.refresh()
    } catch (err: unknown) {
      setFehler(err instanceof Error ? err.message : 'Der Schein konnte nicht angelegt werden.')
    } finally {
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  return (
    <>
      <section className="zentrale-block">
        <h2>Schein ausstellen</h2>

        <form className="jes-form" onSubmit={absenden}>
          <div className="jes-feld">
            <label htmlFor="jes-name">Name des Inhabers</label>
            <input
              id="jes-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Heinrich Beispiel"
              autoComplete="off"
            />
          </div>

          <div className="jes-feld">
            <label htmlFor="jes-email">Anmelde-Adresse</label>
            <input
              id="jes-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="heinrich@example.de"
              autoComplete="off"
              aria-describedby="jes-email-hinweis"
            />
            {/* Die einzige echte Fußangel dieses Wegs, deshalb steht sie neben
                dem Feld und nicht in einer Hilfeseite: eine Einladung an eine
                Zweitadresse kommt nie an und meldet dabei GAR NICHTS — sie ist
                einfach unsichtbar. Der Code darunter ist der Rückfallweg. */}
            <p id="jes-email-hinweis" className="jes-hinweis">
              Muss die Adresse sein, mit der sich der Nehmer bei QuickHunt
              anmeldet. Eine andere Adresse sieht die Einladung nie — ohne
              Fehlermeldung. Notfalls den Code unten weitergeben.
            </p>
          </div>

          <div className="jes-zeitraum">
            <div className="jes-feld">
              <label htmlFor="jes-von">Gültig von</label>
              <input id="jes-von" type="date" value={von} onChange={(e) => setVon(e.target.value)} />
            </div>
            <div className="jes-feld">
              <label htmlFor="jes-bis">Gültig bis</label>
              <input id="jes-bis" type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
            </div>
          </div>

          <fieldset className="jes-feld jes-zuteilung">
            <legend>Zuteilung</legend>
            {/* Zwei Arten statt der drei aus dem Konzept: „gezeichnete
                Bereiche" braucht Zonen, und `zones` ist projektweit leer
                (0 Zeilen, gemessen 31.07.2026). Eine dritte Auswahl, die
                garantiert nichts anbietet, ist keine Funktion, sondern eine
                Sackgasse. Die Spalte `zone_ids` wird trotzdem leer
                mitgeschrieben, damit nicht die Vorgabe entscheidet. */}
            <label>
              <input
                type="radio"
                name="jes-art"
                checked={art === 'revier'}
                onChange={() => setArt('revier')}
              />
              Ganzes Revier
            </label>
            <label>
              <input
                type="radio"
                name="jes-art"
                checked={art === 'staende'}
                onChange={() => setArt('staende')}
                disabled={staende.length === 0}
              />
              Einzelne Stände
              {staende.length === 0 ? <span className="jes-hinweis"> — keine Stände im Revier</span> : null}
            </label>

            {art === 'staende' ? (
              <div className="jes-staende">
                {staende.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={standIds.includes(s.id)}
                      onChange={(e) =>
                        setStandIds((ids) =>
                          e.target.checked ? [...ids, s.id] : ids.filter((i) => i !== s.id)
                        )
                      }
                    />
                    <span className="nam">{s.name}</span>
                    <span className="typ">{s.typ}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>

          <div className="jes-feld">
            <label htmlFor="jes-auflagen">Auflagen (optional)</label>
            <textarea
              id="jes-auflagen"
              rows={2}
              value={auflagen}
              onChange={(e) => setAuflagen(e.target.value)}
              placeholder="z. B. kein Rotwild, Ansitz nur mit Absprache"
            />
          </div>

          {fehler ? <p className="jes-fehler">{fehler}</p> : null}

          <div className="jes-fuss">
            <button type="submit" className="haupt" disabled={laeuft}>
              {laeuft ? 'Legt an …' : 'Schein ausstellen'}
            </button>
          </div>
        </form>
      </section>

      <section className="zentrale-block">
        <h2>Ausgestellte Scheine</h2>
        {scheine.length === 0 ? (
          <p className="zentrale-leer">Für dieses Revier ist noch kein Schein ausgestellt.</p>
        ) : (
          <ul className="jes-liste">
            {/* Der Schlüssel trägt den Serverstand mit, nicht nur die ID. Damit
                setzt React die Zeile neu auf, sobald sich Status oder Datum
                ändern — und die zwei Eingabefelder, die ihren Anfangswert aus
                den Props ziehen, können nicht auf einem überholten Stand
                stehenbleiben, während die Zeile darüber schon den neuen zeigt.
                Ein halb angefangener Eingriff geht dabei verloren; das ist die
                richtige Richtung, denn die Zeile hat sich unter ihm bewegt.
                (Codex, 31.07.2026) */}
            {scheine.map((s) => (
              <Schein
                key={`${s.id}:${s.status}:${s.valid_until}`}
                schein={s}
                heute={heute}
                staende={staende}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/**
 * Eine Zeile der Liste — mitsamt den zwei Eingriffen, die es gibt.
 *
 * **Verlängern ist ein UPDATE auf `valid_until`, mehr nicht.** Weil 077 das
 * Datum live in den Policies prüft, ist das Revier in derselben Sekunde wieder
 * offen; es gibt nichts nachzuziehen.
 *
 * **Kein „endgültig löschen".** Ein DELETE nähme die Zeile mitsamt der Frage,
 * ob dieser Mensch je Zugang hatte. `entzogen` beantwortet dieselbe Absicht und
 * bleibt lesbar — auch für den Inhaber, dessen Schein-Ansicht sonst nur zeigt,
 * dass das Revier verschwunden ist, aber nicht warum.
 */
function Schein({
  schein,
  heute,
  staende,
}: {
  schein: ScheinZeile
  heute: string
  staende: StandWahl[]
}) {
  const router = useRouter()
  const roh = alsStatus(schein.status)
  const status = effektiverStatus(roh, schein.valid_from, schein.valid_until, heute)

  /**
   * Der Stand, gegen den geschrieben wird — anfangs der vom Server, nach einem
   * geglückten Speichern der eben geschriebene.
   *
   * Ohne diese Trennung wäre der Knopf zwischen `router.refresh()` und dem
   * Eintreffen der neuen Props noch einmal klickbar, weil `geaendert` gegen
   * einen überholten Prop-Wert verglichen würde. (Codex, 31.07.2026)
   */
  const [basis, setBasis] = useState({ bis: schein.valid_until, status: schein.status })
  const [bis, setBis] = useState(schein.valid_until)
  const [neuerStatus, setNeuerStatus] = useState<string>(schein.status ?? 'aktiv')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [kopiert, setKopiert] = useState(false)
  const inArbeit = useRef(false)

  const art = zuteilungsArt(schein.zone_ids, schein.stand_ids)
  const zuteilung =
    art === 'revier'
      ? 'Ganzes Revier'
      : art === 'zonen'
        ? `${schein.zone_ids!.length} gezeichnete Bereiche`
        : nenneStaende(schein.stand_ids ?? [], staende)

  const geaendert = bis !== basis.bis || neuerStatus !== basis.status

  /**
   * Verlängern und Sperren in einem Schreibvorgang — aber nur, wenn die Zeile
   * seit dem Laden unverändert ist.
   *
   * **Warum die zwei zusätzlichen `.eq()` das Wichtigste an dieser Funktion
   * sind.** Das Formular schreibt immer beide Spalten. Ohne den Abgleich
   * genügten zwei Tabs desselben Besitzers, um eine Sperre stillschweigend
   * aufzuheben: der eine entzieht den Schein, der andere verlängert danach nur
   * das Datum — und schickt dabei sein altes `aktiv` mit. RLS lässt beide
   * Schreibvorgänge zu, beide treffen genau eine Zeile, beide melden Erfolg.
   * Der Zugang wäre wieder offen, ohne dass irgendwo etwas dazu steht.
   * (Codex, 31.07.2026)
   *
   * **Und warum hier `schreibe()` fehlt, obwohl es sonst jeden Write trägt.**
   * Die eine Tür gibt es, weil 0 betroffene Zeilen sonst als Erfolg
   * durchgingen. Genau das passiert hier nicht: 0 Zeilen sind hier ein
   * ERWARTETES Ergebnis mit eigener Bedeutung — jemand war schneller. Das
   * durch eine Ausnahme zu schicken hieße, den Konflikt am Text der
   * Fehlermeldung wiederzuerkennen. Der Fall wird deshalb ausgeschrieben, und
   * er wird strenger behandelt, nicht lockerer.
   */
  const speichern = async () => {
    if (inArbeit.current) return
    if (bis < schein.valid_from) {
      setFehler('Das Ende liegt vor dem Beginn.')
      return
    }
    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      const abfrage = createClient()
        .from('hunting_licenses')
        .update({ valid_until: bis, status: neuerStatus })
        .eq('id', schein.id)
        .eq('valid_until', basis.bis)
      // `status` ist nullable. `.eq(spalte, null)` wird zu `status=eq.null` und
      // trifft nie — für NULL braucht PostgREST `.is()`.
      const { data, error } = await (basis.status === null
        ? abfrage.is('status', null)
        : abfrage.eq('status', basis.status)
      ).select('id')

      if (error) throw new Error(error.message)

      if (!data || data.length === 0) {
        setFehler(
          'Nicht gespeichert: der Schein wurde inzwischen an anderer Stelle geändert. ' +
            'Die Liste lädt neu — schau dir den neuen Stand an und entscheide noch einmal.'
        )
        router.refresh()
        return
      }

      setBasis({ bis, status: neuerStatus })
      router.refresh()
    } catch (err: unknown) {
      setFehler(err instanceof Error ? err.message : 'Die Änderung konnte nicht gespeichert werden.')
    } finally {
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  return (
    <li className="jes-schein">
      <div className="jes-kopf">
        <span className="nam">{schein.holder_name}</span>
        <span className={`zentrale-pill jes-status-${status}`}>{STATUS_LABEL[status]}</span>
      </div>

      <dl className="jes-daten">
        <dt>Adresse</dt>
        <dd>{schein.holder_email ?? <span className="jes-fehlt">keine — nur per Code erreichbar</span>}</dd>
        <dt>Zeitraum</dt>
        <dd>
          {alsDatum(schein.valid_from)} – {alsDatum(schein.valid_until)}
        </dd>
        <dt>Zuteilung</dt>
        <dd>{zuteilung}</dd>
        {schein.auflagen ? (
          <>
            <dt>Auflagen</dt>
            <dd>{schein.auflagen}</dd>
          </>
        ) : null}
        <dt>Einladung</dt>
        <dd>
          {schein.holder_id ? (
            'Angenommen.'
          ) : schein.invite_code ? (
            <span className="jes-code">
              <code>{schein.invite_code}</code>
              <button
                type="button"
                onClick={() => {
                  // Schlägt der Zugriff fehl (kein HTTPS, verweigerte
                  // Berechtigung), bleibt der Code sichtbar und markierbar —
                  // deshalb hier kein Fehlertext, der nichts hinzufügt.
                  navigator.clipboard?.writeText(schein.invite_code!).then(
                    () => setKopiert(true),
                    () => {}
                  )
                }}
              >
                {kopiert ? 'Kopiert' : 'Kopieren'}
              </button>
            </span>
          ) : (
            <span className="jes-fehlt">kein Code</span>
          )}
        </dd>
      </dl>

      <div className="jes-eingriff">
        <label>
          <span>Gültig bis</span>
          <input type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
        </label>
        <label>
          <span>Status</span>
          {/* Nur die drei Werte, die der Aussteller verfügen kann. `abgelaufen`
              steht bewusst nicht zur Wahl: das entscheidet das Datum, und ein
              Knopf daneben würde zwei Wahrheiten erzeugen. Trägt die Zeile
              trotzdem einen anderen Wert, kommt er als vierte Option dazu —
              eine Auswahl, die den Ist-Zustand nicht enthält, würde ihn beim
              ersten Speichern still überschreiben. */}
          <select value={neuerStatus} onChange={(e) => setNeuerStatus(e.target.value)}>
            {['aktiv', 'pausiert', 'entzogen'].includes(neuerStatus)
              ? null
              : <option value={neuerStatus}>{STATUS_LABEL[alsStatus(neuerStatus)]}</option>}
            <option value="aktiv">Aktiv</option>
            <option value="pausiert">Pausiert</option>
            <option value="entzogen">Entzogen</option>
          </select>
        </label>
        <button type="button" onClick={() => void speichern()} disabled={laeuft || !geaendert}>
          {laeuft ? 'Speichert …' : 'Speichern'}
        </button>
      </div>

      {fehler ? <p className="jes-fehler">{fehler}</p> : null}
    </li>
  )
}

/** Bis zu drei Standnamen ausschreiben, danach zählen. */
function nenneStaende(ids: string[], staende: StandWahl[]): string {
  const namen = ids.map((id) => staende.find((s) => s.id === id)?.name ?? 'unbekannter Stand')
  if (namen.length <= 3) return namen.join(', ')
  return `${namen.slice(0, 3).join(', ')} und ${namen.length - 3} weitere`
}

/**
 * Einen Schein per Code annehmen.
 *
 * Ruft dieselbe RPC wie die native App (`schein_einloesen`, Migration 068) —
 * es gibt genau einen Annahmepfad, und der trägt den Schutz gegen zwei
 * gleichzeitige Annahmen. Ein zweiter Weg müsste ihn ein zweites Mal richtig
 * treffen.
 */
export function Einloesen() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [meldung, setMeldung] = useState<{ gut: boolean; text: string } | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const inArbeit = useRef(false)

  const einloesen = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inArbeit.current) return
    const getrimmt = code.trim()
    if (!getrimmt) return

    inArbeit.current = true
    setLaeuft(true)
    setMeldung(null)
    try {
      const { data, error } = await createClient().rpc('schein_einloesen', { p_code: getrimmt })
      if (error) throw new Error(error.message)

      // Die Funktion liefert immer genau eine Zeile. Keine zu bekommen ist kein
      // Ergebnis, das gedeutet werden darf.
      const zeile = ((data ?? []) as { ergebnis: string | null; district_name: string | null }[])[0]
      const ergebnis = zeile ? alsEinloeseErgebnis(zeile.ergebnis) : 'fehler'
      setMeldung({ gut: ergebnis === 'ok', text: einloeseText(ergebnis, zeile?.district_name ?? null) })
      if (ergebnis === 'ok') {
        setCode('')
        router.refresh()
      }
    } catch {
      setMeldung({ gut: false, text: einloeseText('fehler', null) })
    } finally {
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  return (
    <section className="zentrale-block">
      <h2>Schein einlösen</h2>
      <p className="jes-hinweis">
        Hat dir jemand einen Begehungsschein ausgestellt, trag den Code hier ein.
        Steht die Einladung auf deine Anmelde-Adresse, siehst du sie auch in der
        App unter „Du“.
      </p>
      <form className="jes-einloesen" onSubmit={einloesen}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Einladungscode"
          // Der Code ist base64url aus gen_random_bytes(9) und damit
          // Groß-/Kleinschreibung-EMPFINDLICH. Jede Autokorrektur des Browsers
          // macht daraus einen Code, den es nicht gibt.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="haupt" disabled={laeuft || !code.trim()}>
          {laeuft ? 'Löst ein …' : 'Einlösen'}
        </button>
      </form>
      {meldung ? (
        <p className={meldung.gut ? 'jes-gut' : 'jes-fehler'}>{meldung.text}</p>
      ) : null}
    </section>
  )
}
