'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../schreiben'
import {
  alsDatum,
  alsEinloeseErgebnis,
  alsSpalten,
  alsStatus,
  betragFehler,
  betragKanonisch,
  effektiverStatus,
  entgeltSpalten,
  entgeltZeile,
  einloeseText,
  jagdjahrEnde,
  pruefeEntwurf,
  zuteilungsArt,
  INTERVALLE,
  STATUS_LABEL,
  type Entwurf,
  type Zahlung,
} from './scheine'
import Zahlungen from './zahlungen'

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
  /** Migration 103. `null` heißt „nicht angegeben", nicht „unentgeltlich". */
  entgeltlich: boolean | null
  /** Migration 104. Kommt als Zahl an; `string` steht defensiv daneben, s. `alsEuro`. */
  entgelt_betrag: string | number | null
  /** Migration 105. `entgelt_faellig` aus 104 ist abgelöst und wird nicht mehr geladen. */
  entgelt_intervall: string | null
  entgelt_erste_zahlung: string | null
}

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
  bundesland,
  ausstellerId,
  staende,
  scheine,
  zahlungen,
  heute,
}: {
  revierId: string
  /** `districts.bundesland` — entscheidet ueber den Rechtshinweis, s. unten. */
  bundesland: string | null
  ausstellerId: string
  staende: StandWahl[]
  scheine: ScheinZeile[]
  /** Das Zahlungsjournal ALLER Scheine dieses Reviers (Migration 109),
   *  server-seitig geladen. Wird je Zeile gefiltert statt vorgruppiert: bei
   *  einer Handvoll Scheinen kostet das nichts, und eine Map waere ein
   *  zweiter Zustand, der mit `scheine` auseinanderlaufen kann. */
  zahlungen: Zahlung[]
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
  // Keine Vorbelegung: die Angabe soll entschieden werden, nicht ererbt.
  const [entgeltlich, setEntgeltlich] = useState<boolean | null>(null)
  const [betrag, setBetrag] = useState('')
  // Voreingestellt jährlich (Moritz, 05.08.2026) — und zwar aus `INTERVALLE`,
  // nicht als getippter Schlüssel: eine zweite Stelle, die `'jaehrlich'`
  // buchstabiert, wäre eine Stelle zu viel für einen Wert, den ein CHECK prüft.
  const [intervall, setIntervall] = useState<string>(INTERVALLE[0][0])
  const [ersteZahlung, setErsteZahlung] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  /**
   * Die Konfliktmeldung EINER Listenzeile, gehalten von der Elternkomponente.
   *
   * Sie kann nicht in der Zeile selbst stehen: deren React-Schlüssel trägt den
   * Serverstand mit, und im Konfliktfall hat der sich gerade geändert — der
   * `router.refresh()` unmittelbar nach der Meldung setzt die Zeile also neu
   * auf und löscht ihren Zustand. (Codex P2-12, 05.08.2026)
   */
  const [konflikt, setKonflikt] = useState<string | null>(null)

  /**
   * Der Riegel gegen doppeltes Absenden ist ein Ref, kein State.
   *
   * Zwischen `setLaeuft(true)` und dem sperrenden Render sehen Return-Taste und
   * Knopfdruck beide noch `false`. Die DB bliebe dicht (der zweite INSERT legte
   * schlicht einen zweiten Schein an — schlimmer als ein Fehler), die Anzeige
   * nicht. Derselbe Befund wie im nativen Einlöse-Feld (Codex, 31.07.2026).
   */
  const inArbeit = useRef(false)

  const entwurf: Entwurf = {
    name, email, von, bis, art, standIds, auflagen, entgeltlich, betrag, intervall, ersteZahlung,
  }

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
      // Ohne Prüfung auf `ok` bliebe selbst ein HTTP 500 unsichtbar — `fetch`
      // lehnt bei Statusfehlern nicht ab. Der Nutzer bekommt trotzdem nichts zu
      // sehen (der Schein ist ja angelegt), aber in der Konsole steht dann,
      // warum niemand benachrichtigt wurde. (Codex, 31.07.2026)
      void fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'schein', licenseId: angelegt.id }),
      })
        .then((r) => {
          if (!r.ok) console.error('[push] Schein-Benachrichtigung fehlgeschlagen:', r.status)
        })
        .catch((e: unknown) => console.error('[push] Schein-Benachrichtigung nicht abgesetzt:', e))
      // Zeitraum und Zuteilung stehen lassen: wer zwei Gästen denselben Zeitraum
      // gibt, tippt ihn sonst zweimal.
      //
      // **Die Entgeltlichkeit wird dagegen zurückgesetzt** (Schlusslesung
      // 05.08.2026, Befund 4). Sie stehen zu lassen widerspräche der
      // Begründung eine Bildschirmhöhe weiter oben: eine Angabe, die nicht
      // durch Trägheit entstehen soll, darf ab dem zweiten Schein nicht
      // stillschweigend geerbt werden. Ein Zeitraum ist Tipparbeit, die
      // Entgeltlichkeit eine Entscheidung je Person.
      setName('')
      setEmail('')
      setAuflagen('')
      setEntgeltlich(null)
      // Mit der Entgeltlichkeit, aus demselben Grund: Betrag und Zahlungsplan
      // sind je Person verhandelt, nicht je Sitzung. Das Intervall geht auf
      // seine Voreinstellung zurück, nicht auf leer — es IST eine Vorgabe.
      setBetrag('')
      setIntervall(INTERVALLE[0][0])
      setErsteZahlung('')
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

          <fieldset className="jes-feld jes-radios">
            <legend>Erteilung</legend>
            <label>
              <input
                type="radio"
                name="jes-entgelt"
                checked={entgeltlich === false}
                onChange={() => setEntgeltlich(false)}
              />
              Unentgeltlich
            </label>
            <label>
              <input
                type="radio"
                name="jes-entgelt"
                checked={entgeltlich === true}
                onChange={() => setEntgeltlich(true)}
              />
              Entgeltlich
            </label>
            {/* Verzweigt wie das Blatt (`landesrecht()`), statt Landesrecht als
                allgemeine Auskunft zu setzen: die Erteilung von
                Jagderlaubnisscheinen ist Laendersache (§ 11 Abs. 1 Satz 3
                BJagdG), und NRW verlangt eine Anzeige binnen eines Monats, wo
                Niedersachsen gar keine kennt. (Codex, 05.08.2026, W9) */}
            {/* Nur beim entgeltlichen Schein — beim unentgeltlichen gibt es
                nichts zu vereinbaren, und `alsSpalten` schreibt dann ohnehin
                `null`, egal was hier stünde. */}
            {entgeltlich === true ? (
              <div className="jes-entgelt">
                <label>
                  <span>Betrag</span>
                  {/* Das „€" steht NEBEN dem Feld, nie darin: `betragAlsZahl`
                      verlangt reine Ziffern mit deutschem Trenner, und
                      „1.500,00 €" fiele durch die Regex — der Wert wäre beim
                      nächsten Speichern still weg. */}
                  <span className="mit-einheit">
                    <input
                      value={betrag}
                      onChange={(e) => setBetrag(e.target.value)}
                      // Beim Verlassen des Feldes die einheitliche Form
                      // (Moritz, 05.08.2026). Unlesbares bleibt stehen, damit
                      // der Nutzer seine Eingabe neben der Fehlermeldung
                      // wiederfindet, statt sie kommentarlos zu verlieren.
                      onBlur={() => setBetrag(betragKanonisch(betrag))}
                      placeholder="z. B. 1.500,50"
                      inputMode="decimal"
                      maxLength={14}
                      autoComplete="off"
                    />
                    {/* KEIN `aria-hidden`: das „€" ist die Einheit, nicht
                        Zierrat. Es steht im Label, also liest eine
                        Vorlesesoftware „Betrag €" — verborgen bliebe nur
                        „Betrag" und eine nackte Zahl, bei einer
                        Geldvereinbarung mehrdeutig. (Codex P3-9, 05.08.2026) */}
                    <span>€</span>
                  </span>
                </label>
                <label>
                  <span>Zahlungsintervall</span>
                  {/* Kein leerer Eintrag: „jährlich" ist die Voreinstellung,
                      und ein „keins" daneben wäre eine vierte Antwort auf eine
                      Frage mit drei. Wer gar nichts vereinbaren will, lässt den
                      Betrag leer — dann steht das Intervall auf keinem Blatt
                      (`entgeltZeile`). */}
                  <select value={intervall} onChange={(e) => setIntervall(e.target.value)}>
                    {INTERVALLE.map(([wert, text]) => (
                      <option key={wert} value={wert}>{text}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Erste Zahlung am</span>
                  <input
                    type="date"
                    value={ersteZahlung}
                    onChange={(e) => setErsteZahlung(e.target.value)}
                  />
                </label>
                <p className="jes-hinweis">
                  Betrag und Termin dürfen offenbleiben. Auf dem gedruckten Blatt
                  erscheinen sie nur, wenn du es dort ausdrücklich ankreuzt — der
                  Schein wird auch Polizeibeamten vorgezeigt.
                </p>
              </div>
            ) : null}

            <p className="jes-hinweis">
              {bundesland === 'Niedersachsen'
                ? 'Betrifft nur den entgeltlichen Fall: der Inhaber muss ihn nach § 20 Nr. 5 '
                  + 'NJagdG angeben, wenn er selbst einmal einen Jagdpachtvertrag anzeigt — und '
                  + 'auch dann nur, wenn der Schein mindestens eine Wildart für deren volle '
                  + 'Jagdzeit gestattet. Du selbst musst dem Landkreis in Niedersachsen nichts '
                  + 'melden.'
                : 'Ob eine entgeltliche Erteilung bei der unteren Jagdbehörde anzuzeigen ist, '
                  + 'richtet sich nach dem Landesjagdgesetz und ist für dieses Revier nicht '
                  + 'hinterlegt.'}
            </p>
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
        {/* Der Konflikt einer einzelnen Zeile steht HIER und nicht dort: die
            Zeile wird nach dem `router.refresh()` neu aufgesetzt (ihr Schlüssel
            trägt den Serverstand), ihr lokaler Fehlerzustand ginge dabei
            verloren. `role="alert"` sagt es auch der Vorlesesoftware, denn die
            Meldung erscheint ohne Seitenwechsel. */}
        {konflikt ? (
          <p className="jes-fehler" role="alert">
            {konflikt}{' '}
            <button type="button" onClick={() => setKonflikt(null)}>
              Verstanden
            </button>
          </p>
        ) : null}
        {scheine.length === 0 ? (
          <p className="zentrale-leer">Für dieses Revier ist noch kein Schein ausgestellt.</p>
        ) : (
          <ul className="jes-liste">
            {/* Der Schlüssel trägt den Serverstand mit, nicht nur die ID. Damit
                setzt React die Zeile neu auf, sobald sich einer der Werte
                ändert — und die zwei Eingabefelder, die ihren Anfangswert aus
                den Props ziehen, können nicht auf einem überholten Stand
                stehenbleiben, während die Zeile darüber schon den neuen zeigt.
                Ein halb angefangener Eingriff geht dabei verloren; das ist die
                richtige Richtung, denn die Zeile hat sich unter ihm bewegt.
                (Codex, 31.07.2026)

                **JEDE geschriebene Entgelt-Spalte MUSS mit hinein**
                (Fremdprüfung 05.08.2026, S6): fehlte eine, setzte
                `router.refresh()` die Zeile nach einer konkurrierenden Änderung
                genau dieser Spalte nicht neu auf. Der lokale Vergleichsstand
                bliebe alt, und jeder weitere Speicherversuch scheiterte
                **dauerhaft** am Compare-and-Swap — ein Zustand, aus dem nur ein
                harter Reload herausführt. Mit 105 sind es zwei mehr; der
                Schlüssel wächst mit `zuVergleichen` weiter unten mit. */}
            {scheine.map((s) => (
              <Schein
                key={`${s.id}:${s.status}:${s.valid_until}:${s.entgeltlich}:${s.entgelt_betrag}:${s.entgelt_intervall}:${s.entgelt_erste_zahlung}`}
                schein={s}
                /* Bewusst NICHT im `key` oben: der Compare-and-Swap betrifft nur
                   `hunting_licenses`. Stuenden die Zahlungen im Schluessel, remountete
                   jede eingetragene Zahlung die ganze Zeile und wuerfe einen halb
                   getippten Betrag im Schein-Formular weg. */
                zahlungen={zahlungen.filter((z) => z.hunting_license_id === s.id)}
                heute={heute}
                staende={staende}
                meldeKonflikt={setKonflikt}
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
  zahlungen,
  heute,
  staende,
  meldeKonflikt,
}: {
  schein: ScheinZeile
  zahlungen: Zahlung[]
  heute: string
  staende: StandWahl[]
  /** Meldet einen Compare-and-Swap-Konflikt an die Elternkomponente, die den
   *  folgenden Remount dieser Zeile überlebt. `null` räumt ihn weg. S.
   *  `speichern()`. */
  meldeKonflikt: (text: string | null) => void
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
  const [basis, setBasis] = useState({
    bis: schein.valid_until,
    status: schein.status,
    entgeltlich: schein.entgeltlich,
    // Einmal normalisiert statt bei jedem Vergleich. `Number()` ist auch dann
    // richtig, wenn schon eine Zahl ankommt — und Postgres vergleicht
    // `eq.1200.5` gegen `numeric 1200.50` numerisch korrekt.
    betrag: schein.entgelt_betrag === null ? null : Number(schein.entgelt_betrag),
    intervall: schein.entgelt_intervall,
    ersteZahlung: schein.entgelt_erste_zahlung,
  })
  const [bis, setBis] = useState(schein.valid_until)
  /**
   * **Der Rohwert, nicht `?? 'aktiv'`** (Codex, 05.08.2026, W1/W3/S5).
   *
   * Die Vorbelegung mit `'aktiv'` machte aus einem `status = null` beim ersten
   * Rendern eine Aenderung: der Speichern-Knopf war ohne Zutun klickbar, und
   * wer nur die Entgeltlichkeit nachtrug, schrieb ungefragt `status = 'aktiv'`
   * mit. Im Bestand heute folgenlos — 0 von 4 Zeilen sind null, die Spalte hat
   * `default 'aktiv'` — aber sie IST nullable, und der Wert entscheidet ueber
   * den Revierzugang.
   *
   * `''` steht fuer null und wird beim Schreiben zurueckuebersetzt; dieselbe
   * Bauform wie beim Entgelt-Feld darunter.
   */
  const [neuerStatus, setNeuerStatus] = useState<string>(schein.status ?? '')
  // Nachtragbar, weil es sonst niemand nachtragen könnte: das Ausstellformular
  // erreicht die vier Altscheine nicht mehr.
  const [neuEntgeltlich, setNeuEntgeltlich] = useState<boolean | null>(schein.entgeltlich)
  // Als Text, damit die deutsche Schreibweise beim Tippen erhalten bleibt, und
  // seit 105 gleich in der **kanonischen** Form: aus `1200` wird „1.200,00",
  // aus `1200.5` wird „1.200,50". Vorher stand hier die rohe Zahl mit
  // getauschtem Trenner („1200", „1200,5") — dasselbe Feld zeigte also je nach
  // Herkunft zwei verschiedene Schreibweisen desselben Betrags.
  //
  // **`geaendert` bleibt davon unberührt**, und das ist der Grund, warum die
  // Umformung hier gefahrlos ist: verglichen wird über `betragAlsZahl`, und die
  // liest „1.200,00" und „1200" beide als `1200`. (Zwei Kommentare haben an
  // dieser Stelle schon etwas Falsches behauptet — Schlusslesung 05.08.2026,
  // Befund 2.)
  const [neuBetrag, setNeuBetrag] = useState(
    schein.entgelt_betrag === null ? '' : betragKanonisch(Number(schein.entgelt_betrag)),
  )
  // **Der Rohwert, kein `?? 'jaehrlich'`** — dieselbe Falle wie beim Status
  // darunter (Codex, 05.08.2026, W1/W3/S5). Eine Voreinstellung machte aus
  // einem `entgelt_intervall = null` beim ersten Rendern eine Änderung: der
  // Speichern-Knopf wäre ohne Zutun klickbar, und wer nur das Gültigkeitsdatum
  // verlängert, schriebe ungefragt „jährlich" mit. Die Voreinstellung gehört
  // ins AUSSTELL-Formular, wo sie eine Vorgabe für etwas Neues ist — hier wäre
  // sie eine Behauptung über etwas Bestehendes.
  const [neuIntervall, setNeuIntervall] = useState<string>(schein.entgelt_intervall ?? '')
  const [neuErsteZahlung, setNeuErsteZahlung] = useState<string>(
    schein.entgelt_erste_zahlung ?? '',
  )
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [kopiert, setKopiert] = useState(false)
  const inArbeit = useRef(false)

  // Dieselbe Zeile wie auf dem Blatt, aus derselben Funktion — sonst stünde
  // hier etwas anderes als auf dem Papier, das aus dieser Zeile gedruckt wird.
  const entgeltZusatz = entgeltZeile(
    schein.entgelt_betrag,
    schein.entgelt_intervall,
    schein.entgelt_erste_zahlung,
  )

  const art = zuteilungsArt(schein.zone_ids, schein.stand_ids)
  const zuteilung =
    art === 'revier'
      ? 'Ganzes Revier'
      : art === 'zonen'
        ? `${schein.zone_ids!.length} gezeichnete Bereiche`
        : nenneStaende(schein.stand_ids ?? [], staende)

  // Dieselbe Regel wie im Ausstellformular, aus derselben Funktion.
  const zuSchreiben = entgeltSpalten({
    entgeltlich: neuEntgeltlich,
    betrag: neuBetrag,
    intervall: neuIntervall,
    ersteZahlung: neuErsteZahlung,
  })

  // Ein unlesbarer Betrag ergibt `null` — genau wie ein leeres Feld. Bei einem
  // Schein, dessen Betrag schon `null` war, faellt der Vergleich damit auf
  // „nichts geaendert" und der Knopf bliebe gesperrt: der Nutzer tippt Unsinn
  // und die Oberflaeche reagiert gar nicht. Deshalb zaehlt ein FEHLER als
  // Aenderung — dann greift der Riegel in `speichern()` und sagt, was los ist.
  // (Fremdpruefung 05.08.2026, W7)
  const betragUnlesbar = neuEntgeltlich === true && betragFehler(neuBetrag) !== null

  const geaendert =
    bis !== basis.bis ||
    (neuerStatus || null) !== basis.status ||
    neuEntgeltlich !== basis.entgeltlich ||
    zuSchreiben.entgelt_betrag !== basis.betrag ||
    zuSchreiben.entgelt_intervall !== basis.intervall ||
    zuSchreiben.entgelt_erste_zahlung !== basis.ersteZahlung ||
    betragUnlesbar

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
    // Ohne diese Zeile wuerde ein unlesbarer Betrag still zu `null` — der Wert
    // waere weg, und der Nutzer saehe eine Erfolgsmeldung.
    const betragProblem = neuEntgeltlich ? betragFehler(neuBetrag) : null
    if (betragProblem) {
      setFehler(betragProblem)
      return
    }
    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      let abfrage = createClient()
        .from('hunting_licenses')
        .update({
          valid_until: bis,
          status: neuerStatus || null,
          entgeltlich: neuEntgeltlich,
          ...zuSchreiben,
        })
        .eq('id', schein.id)
      // Beide sind nullable: `.eq(spalte, null)` wird zu `spalte=eq.null` und
      // trifft nie — für NULL braucht PostgREST `.is()`.
      //
      // **Jede Spalte im UPDATE braucht ihre eigene Bedingung.** Eine dritte
      // Spalte ohne dritten Abgleich hätte das Loch wieder aufgemacht, gegen
      // das die zwei bestehenden gebaut wurden (Codex, 31.07.2026).
      // **Jede geschriebene Spalte braucht ihre Bedingung**, sonst ist sie das
      // Loch im Compare-and-Swap (Codex, 31.07.2026). Als Liste statt als
      // Verzweigungen: eine weitere Spalte kostet dann einen Eintrag.
      // `null` braucht `.is()` — `.eq(spalte, null)` wird zu `spalte=eq.null`
      // und trifft nie.
      //
      // **`entgelt_faellig` fehlt hier, weil es auch nicht mehr GESCHRIEBEN
      // wird.** Die Spalte ist seit 105 stillgelegt und per CHECK auf `NULL`
      // festgenagelt — es gibt keinen Schreiber mehr, dessen Änderung dieses
      // UPDATE verlieren könnte. Ein früherer Entwurf schrieb sie hier auf
      // `null`, ohne sie zu vergleichen; das hätte die Eingabe eines Tabs mit
      // dem alten Bundle still gelöscht (Codex P1/P2, 05.08.2026).
      const zuVergleichen: readonly (readonly [string, unknown])[] = [
        ['valid_until', basis.bis],
        ['status', basis.status],
        ['entgeltlich', basis.entgeltlich],
        ['entgelt_betrag', basis.betrag],
        ['entgelt_intervall', basis.intervall],
        ['entgelt_erste_zahlung', basis.ersteZahlung],
      ]
      for (const [spalte, wert] of zuVergleichen) {
        abfrage = wert === null ? abfrage.is(spalte, null) : abfrage.eq(spalte, wert)
      }
      const { data, error } = await abfrage.select('id')

      if (error) throw new Error(error.message)

      if (!data || data.length === 0) {
        // **Die Konfliktmeldung geht nach OBEN, nicht in den lokalen Zustand**
        // (Codex P2-12, 05.08.2026). Der React-Schlüssel dieser Zeile trägt den
        // Serverstand mit — genau im Konfliktfall hat der sich geändert, das
        // folgende `router.refresh()` setzt die Zeile also neu auf und ein
        // `setFehler` hier wäre nach einem Aufblitzen wieder `null`. Der Nutzer
        // sähe zurückgesetzte Felder und keine Erklärung: ein fehlgeschlagener
        // Schreibvorgang, der sich wie ein geglückter liest.
        // Die Elternkomponente ist nicht keyed und überlebt den Refresh.
        meldeKonflikt(
          `„${schein.holder_name}" wurde nicht gespeichert: der Schein ist inzwischen an ` +
            'anderer Stelle geändert worden. Die Liste zeigt jetzt den neuen Stand — ' +
            'schau ihn dir an und entscheide noch einmal.'
        )
        router.refresh()
        return
      }

      setBasis({
        bis,
        status: neuerStatus || null,
        entgeltlich: neuEntgeltlich,
        betrag: zuSchreiben.entgelt_betrag,
        intervall: zuSchreiben.entgelt_intervall,
        ersteZahlung: zuSchreiben.entgelt_erste_zahlung,
      })
      // Ein geglücktes Speichern räumt eine stehengebliebene Konfliktmeldung
      // weg. Ohne diese Zeile stünde über einem gerade erfolgreichen Vorgang
      // weiterhin „wurde nicht gespeichert", bis jemand „Verstanden" klickt —
      // ein Erfolg unter einer Fehlermeldung ist dasselbe Übel wie ein
      // Fehlschlag ohne. (Schlusslesung 05.08.2026, Befund 3a)
      meldeKonflikt(null)
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
        <dt>Erteilung</dt>
        {/* In der LISTE steht „nicht angegeben" ausgeschrieben, auf dem
            AUSDRUCK dagegen bleiben beide Wörter stehen
            (`entgeltAufDemBlatt`). Zwei Orte, zwei richtige Antworten: hier
            liest der Revierbesitzer eine Lücke, die er schließen kann; dort
            liest ein Beamter ein Papier, das nichts behaupten darf. */}
        <dd>
          {schein.entgeltlich === null ? (
            <span className="jes-fehlt">nicht angegeben — vor dem Ausdruck ergänzen</span>
          ) : schein.entgeltlich ? (
            // Ternär, nicht `&&`: `entgeltZeile` liefert `null` statt `''`, und
            // `null && …` ergäbe `null` — im Template stünde „Entgeltlichnull".
            `Entgeltlich${entgeltZusatz ? ` — ${entgeltZusatz}` : ''}`
          ) : (
            'Unentgeltlich'
          )}
        </dd>
        {/* Das Zahlungsjournal (Migration 109).

            **Die Bedingung ist ein ODER, und der zweite Zweig ist der
            wichtige.** Bei „entgeltlich" gehört das Journal offensichtlich
            hierher. Der zweite Zweig fängt den Fall ab, dass jemand einen
            Schein NACHTRÄGLICH auf unentgeltlich umstellt: die bereits
            erfassten Zahlungen wären sonst unsichtbar — und weil Löschen nur
            über diese Ansicht geht, auch nicht mehr wegzuräumen. Dieselbe
            Überlegung wie bei `inaktiv_seit` (Migration 100): versteckte Zeilen
            sind nicht wieder aufnehmbar.

            **Anzeigen und Erfassen folgen bewusst DERSELBEN Bedingung:** wo
            das Journal steht, lässt es sich auch pflegen. Ein Journal, das man
            sehen, aber nicht korrigieren kann, wäre halb — und der zweite
            Zweig entsteht ja gerade dort, wo schon Zahlungen liegen, die
            jemand nachtragen oder wegräumen können muss.

            **Hier stand zwei Fassungen lang das Gegenteil**, und beide Male
            falsch. Erst zitierte der Kommentar die DB-Begründung von 109
            (Wildbret, Nachsuche), als wäre sie auch die UI-Begründung — sie
            ist es nicht. Dann behauptete er, Erfassen gehe „nur bei
            entgeltlich", **was der Code nie tat**: `<Zahlungen>` kennt
            `entgeltlich` gar nicht und rendert den Knopf immer, wenn die
            Komponente steht (Schlusslesung 06.08.2026). Ein Kommentar, der
            eine Sperre behauptet, die es nicht gibt, ist schlimmer als keiner
            — der nächste Leser verlässt sich darauf. */}
        {schein.entgeltlich || zahlungen.length > 0 ? (
          <>
            <dt>Zahlungen</dt>
            <dd>
              <Zahlungen scheinId={schein.id} zahlungen={zahlungen} heute={heute} />
            </dd>
          </>
        ) : null}
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
          {/* Die Zusatz-Option haengt am BASIS-Wert, nicht am aktuellen: sonst
              verschwindet sie, sobald man einmal etwas anderes waehlt, und der
              Ausgangszustand ist nur noch per Neuladen erreichbar. Genau die
              Parität, die der Kommentar am Entgelt-Feld behauptete, ohne dass
              sie bestand. (Schlusslesung 05.08.2026, Befund 5) */}
          <select value={neuerStatus} onChange={(e) => setNeuerStatus(e.target.value)}>
            {['aktiv', 'pausiert', 'entzogen'].includes(basis.status ?? '')
              ? null
              : (
                  <option value={basis.status ?? ''}>
                    {basis.status === null
                      ? STATUS_LABEL.unbekannt
                      : STATUS_LABEL[alsStatus(basis.status)]}
                  </option>
                )}
            <option value="aktiv">Aktiv</option>
            <option value="pausiert">Pausiert</option>
            <option value="entzogen">Entzogen</option>
          </select>
        </label>
        <label>
          <span>Erteilung</span>
          {/* Der leere Wert steht nur zur Wahl, solange er der Ist-Zustand ist —
              wie beim Status-Feld daneben. Eine Auswahl, die den Ist-Zustand
              nicht enthält, überschriebe ihn beim ersten Speichern still. */}
          <select
            value={neuEntgeltlich === null ? '' : neuEntgeltlich ? 'ja' : 'nein'}
            onChange={(e) => setNeuEntgeltlich(e.target.value === '' ? null : e.target.value === 'ja')}
          >
            {basis.entgeltlich === null ? <option value="">nicht angegeben</option> : null}
            <option value="nein">Unentgeltlich</option>
            <option value="ja">Entgeltlich</option>
          </select>
        </label>
        {neuEntgeltlich ? (
          <>
            <label>
              <span>Betrag</span>
              {/* „€" neben dem Feld, nie darin — s. das Ausstellformular. */}
              <span className="mit-einheit">
                <input
                  value={neuBetrag}
                  onChange={(e) => setNeuBetrag(e.target.value)}
                  onBlur={() => setNeuBetrag(betragKanonisch(neuBetrag))}
                  placeholder="1.500,50"
                  inputMode="decimal"
                  maxLength={14}
                  size={10}
                />
                <span>€</span>
              </span>
            </label>
            <label>
              <span>Intervall</span>
              {/* **„nicht vereinbart" steht IMMER zur Wahl, anders als beim
                  Status- und beim Erteilungs-Feld darüber.** Dort ist der leere
                  Wert ein Altzustand, den man nicht wiederherstellen können
                  muss; hier ist er eine gültige Vereinbarung („Betrag ja,
                  Rhythmus offen"). Ohne diesen Eintrag wäre ein einmal
                  gewähltes Intervall über die Oberfläche nie wieder
                  wegzubekommen — nur noch über den Umweg „unentgeltlich und
                  zurück". (Ponytail, 05.08.2026, Randbefund a)

                  Ein unbekannter Wert kommt dazu, wenn er der Ist-Zustand ist:
                  eine Auswahl, die ihn nicht enthält, überschriebe ihn beim
                  ersten Speichern still. **Die `null`-Prüfung ist nicht
                  redundant, obwohl `INTERVALLE.some(null)` schon `false`
                  ergibt** — ohne sie stünde für einen Schein ohne Intervall
                  eine ZWEITE leere Option ohne Beschriftung neben „nicht
                  vereinbart". */}
              <select value={neuIntervall} onChange={(e) => setNeuIntervall(e.target.value)}>
                <option value="">nicht vereinbart</option>
                {basis.intervall !== null &&
                !INTERVALLE.some(([wert]) => wert === basis.intervall) ? (
                  <option value={basis.intervall}>{basis.intervall}</option>
                ) : null}
                {INTERVALLE.map(([wert, text]) => (
                  <option key={wert} value={wert}>{text}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Erste Zahlung</span>
              <input
                type="date"
                value={neuErsteZahlung}
                onChange={(e) => setNeuErsteZahlung(e.target.value)}
              />
            </label>
          </>
        ) : null}
        <button type="button" onClick={() => void speichern()} disabled={laeuft || !geaendert}>
          {laeuft ? 'Speichert …' : 'Speichern'}
        </button>
        {/* Neuer Tab, nicht dieselbe Seite: wer druckt, will danach in der
            Liste weitermachen — und der Druckdialog des Browsers hängt am
            Tab, aus dem er geöffnet wurde. */}
        <a
          className="jes-drucken"
          href={`/zentrale/jagderlaubnisse/${schein.id}/druck`}
          target="_blank"
          rel="noopener"
        >
          Blatt drucken
        </a>
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
