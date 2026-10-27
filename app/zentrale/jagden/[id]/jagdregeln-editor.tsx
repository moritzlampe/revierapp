'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../../schreiben'
import { VORBEREITBARE_STATUS } from '../jagden'
import { ladeVorlagen, useSpeicherLauf } from './editor-teile'
import VorlageSpeichern from './vorlage-speichern'
import {
  alsFeldtext,
  JAGDREGELN_MAX_ZEICHEN,
  jagdregelnGeaendert,
  pruefeJagdregeln,
  regelnZumSpeichern,
  vorlageEinfuegen,
  type RegelVorlage,
} from './regeln'

type Rueckfrage = { art: 'schliessen' } | { art: 'vorlage'; vorlage: RegelVorlage }

type Vorlagen = { zustand: 'laedt' } | { zustand: 'fehler'; text: string } | { zustand: 'da'; liste: RegelVorlage[] }

/** „Als Vorlage speichern" (P1d): das Namensfeld offen, oder danach die Meldung. */
type VorlageSichern = { art: 'offen' } | { art: 'gespeichert'; titel: string }

/**
 * Jagdregeln einer Jagd bearbeiten (Fahrplan P1b, Bauplan Portal
 * Freigabe/Regeln V2.1) — dieselbe Spalte mit denselben Regeln wie die App
 * (`RegelnAnsicht.tsx`, `speichereJagdregeln`), am Desktop als EIN Textfeld,
 * eine Regel je Zeile (E3).
 *
 * - **Compare-and-Swap über den Wert** (`.eq` bzw. `.is(null)`) gegen die
 *   ROHE Basis beim Öffnen, dazu der Statusfilter wie beim Sicht-Write: eine
 *   inzwischen gestartete Jagd trifft 0 Zeilen.
 * - **Vier Ausgänge** statt einem (E6): 0 Zeilen lässt den Entwurf lesbar
 *   stehen und sperrt Speichern; abgelaufene Anmeldung, Ablehnung und keine
 *   gültige Antwort lassen ihn frei. Nach der Frist (15 s) bleibt der Entwurf
 *   schreibgeschützt, bis die Anfrage endet — **ein Versuch zur Zeit**; ein
 *   spätes Ja wird als „Doch gespeichert" verbucht (E9).
 * - **Kein eigenes Nachladen**, solange er offen ist (E6): das tut
 *   `RegelnBereich` beim Schließen.
 * - **Kein `<form>`:** Speichern ist `type="button"` (E1, Schritt 6).
 */
export default function JagdregelnEditor({
  jagdId,
  basis: basisProp,
  nutzerId,
  onSchliessen,
}: {
  jagdId: string
  /** Stand beim Öffnen — gegen ihn vergleicht der Compare-and-Swap. */
  basis: string | null
  /** Das eigene Konto — die Vorlagen hängen an ihm (`user_settings`). */
  nutzerId: string
  /** Schließt den Editor; `hinweis` erscheint danach unter den Jagdregeln. */
  onSchliessen: (hinweis: string | null) => void
}) {
  // Eingefroren beim Öffnen (E9): die Seite lädt nach Sicht- und
  // Teilnehmer-Writes nach, neue Props dürfen die Basis nicht ersetzen.
  const [basis] = useState(basisProp)
  // Eigener Eingabezustand, genau das Getippte (E3, Codex D3): der Text zum
  // Speichern wird daraus abgeleitet, nie zurück ins Feld geschrieben.
  const [feld, setFeld] = useState(() => alsFeldtext(basisProp))
  // Frist, Wettlauf, Ausgänge und der Doppelklick-Riegel (E6/E9).
  const { phase, meldung, starte, lebt } = useSpeicherLauf()
  const [rueckfrage, setRueckfrage] = useState<Rueckfrage | null>(null)
  const [vorlagen, setVorlagen] = useState<Vorlagen | null>(null)
  const [vorlageSichern, setVorlageSichern] = useState<VorlageSichern | null>(null)
  const [vorlageSchreibt, setVorlageSchreibt] = useState(false)

  const neu = regelnZumSpeichern([feld])
  const geaendert = jagdregelnGeaendert(neu, basis)
  // Gezählt wird der gespeicherte Text samt „• ", UTF-16 wie die App (E3).
  const zeichen = neu?.length ?? 0
  const zuLang = zeichen > JAGDREGELN_MAX_ZEICHEN
  const laeuft = phase === 'schreibt' || phase === 'wartet'
  // Solange eine Rückfrage offen ist, ist der übrige Editor gesperrt (E1);
  // ebenso, solange eine Vorlage gesichert wird (`VorlageSpeichern`).
  const gesperrt = phase !== 'bearbeiten' || rueckfrage !== null || vorlageSchreibt
  // Keine Vorlage, solange der Editor speichert oder fragt — wohl aber in
  // `veraltet`: sie geht an das eigene Konto, nicht an die Jagd, und rettet
  // den Text, den Speichern nicht mehr loswird (Schlusslesung P1d F3, Moritz
  // 27.10.2026).
  const beschaeftigt = laeuft || rueckfrage !== null

  // Reload und Tab schließen fragen nach, solange etwas verloren ginge (E9).
  // Link-Navigation im Portal erreicht das nicht (CP-107, hingenommen).
  // Ein laufender Vorlagen-Write ebenso — sein Ausgang ginge verloren (Codex P1d B-F2).
  const schuetzen = geaendert || laeuft || vorlageSchreibt
  useEffect(() => {
    if (!schuetzen) return
    const warnen = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warnen)
    return () => window.removeEventListener('beforeunload', warnen)
  }, [schuetzen])

  const speichern = () => {
    if (gesperrt || !geaendert || zuLang) return
    starte(
      () =>
        schreibe('Die Jagdregeln', () => {
          const anfrage = createClient()
            .from('hunts')
            .update({ jagdregeln: neu })
            .eq('id', jagdId)
            .in('status', VORBEREITBARE_STATUS)
          return (basis === null ? anfrage.is('jagdregeln', null) : anfrage.eq('jagdregeln', basis)).select(
            'jagdregeln',
          )
        }),
      (zeile, fristUm) => {
        const zurueck = pruefeJagdregeln((zeile as Record<string, unknown>).jagdregeln)
        onSchliessen(
          zurueck === undefined
            ? 'Die Jagdregeln wurden gespeichert, kamen aber nicht lesbar zurück.'
            : fristUm
              ? 'Doch gespeichert — die Antwort kam nach der Frist.'
              : // Nicht `null`: bis das Nachladen durch ist, zeigt die Liste
                // noch den alten Stand (Schlusslesung 27.10.2026, F1).
                'Gespeichert.',
        )
      },
    )
  }

  const schliessen = () => {
    // Nach der Frist ebenfalls fragen: eine Antwort danach fiele ins Leere.
    if (geaendert || phase === 'wartet') setRueckfrage({ art: 'schliessen' })
    else onSchliessen(null)
  }

  /** Lädt die Vorlagen beim Klick (E4, `ladeVorlagen`). */
  const vorlagenLaden = async () => {
    setVorlageSichern(null)
    setVorlagen({ zustand: 'laedt' })
    try {
      const liste = await ladeVorlagen(nutzerId)
      if (lebt.current) setVorlagen({ zustand: 'da', liste })
    } catch (e) {
      if (lebt.current) {
        setVorlagen({ zustand: 'fehler', text: e instanceof Error ? e.message : 'Vorlagen gerade nicht abrufbar.' })
      }
    }
  }

  /** Ersetzen oder anhängen — auf den Text zum Zeitpunkt der Bestätigung (E1). */
  const einfuegen = (vorlage: RegelVorlage, ersetzen: boolean) => {
    setFeld((f) => vorlageEinfuegen(ersetzen ? [] : [f], vorlage).join('\n'))
    setVorlagen(null)
    setRueckfrage(null)
  }

  // Stehen schon Regeln da, fragen: ersetzen oder anhängen (CN-387).
  const waehlen = (vorlage: RegelVorlage) => {
    if (regelnZumSpeichern([feld]) === null) einfuegen(vorlage, false)
    else setRueckfrage({ art: 'vorlage', vorlage })
  }

  return (
    <div className="jagd-regeln-editor">
      <div className="zentrale-inspektor-feld">
        <label htmlFor="jagdregeln-feld">Eine Regel je Zeile — beim Speichern wird jede Zeile ein Punkt.</label>
        {/* `readOnly` statt `disabled`: der Text bleibt markier- und kopierbar (E9). */}
        <textarea
          id="jagdregeln-feld"
          rows={12}
          value={feld}
          readOnly={gesperrt}
          onChange={(e) => setFeld(e.target.value)}
        />
      </div>
      <p className={zuLang ? 'zentrale-inspektor-warnung' : 'zentrale-hinweis'}>
        {zuLang ? 'Zu lang: ' : ''}
        {zeichen} von {JAGDREGELN_MAX_ZEICHEN} Zeichen
      </p>

      {vorlageSichern?.art === 'offen' ? (
        <VorlageSpeichern
          nutzerId={nutzerId}
          regeln={neu}
          vorschlag="Jagdregeln"
          aus={beschaeftigt}
          onSchreibt={setVorlageSchreibt}
          onFertig={(titel) => setVorlageSichern({ art: 'gespeichert', titel })}
          onAbbrechen={() => setVorlageSichern(null)}
        />
      ) : vorlageSichern?.art === 'gespeichert' ? (
        <p className="zentrale-hinweis" role="status">
          Als Vorlage „{vorlageSichern.titel}“ gespeichert.
        </p>
      ) : null}

      {vorlagen === null ? null : vorlagen.zustand === 'laedt' ? (
        <p className="zentrale-hinweis">Vorlagen werden geladen …</p>
      ) : vorlagen.zustand === 'fehler' ? (
        <div className="zentrale-inspektor-fuss jagd-regeln-vorlagen">
          <span role="alert">{vorlagen.text}</span>
          <button type="button" disabled={gesperrt} onClick={() => void vorlagenLaden()}>
            Erneut versuchen
          </button>
        </div>
      ) : vorlagen.liste.length === 0 ? (
        <p className="zentrale-hinweis">Noch keine Vorlagen. Speichere Regeln mit „Als Vorlage speichern“.</p>
      ) : (
        <div className="zentrale-inspektor-fuss jagd-regeln-vorlagen">
          {vorlagen.liste.map((v) => (
            <button key={v.titel} type="button" disabled={gesperrt} onClick={() => waehlen(v)}>
              {v.titel}
            </button>
          ))}
          <button type="button" disabled={gesperrt} onClick={() => setVorlagen(null)}>
            Keine einfügen
          </button>
        </div>
      )}

      {rueckfrage?.art === 'vorlage' ? (
        <div className="zentrale-inspektor-warnung">
          Es stehen schon Regeln da. „{rueckfrage.vorlage.titel}“ ersetzt sie oder kommt unten dazu.
          <div className="zentrale-inspektor-fuss">
            <button type="button" autoFocus onClick={() => einfuegen(rueckfrage.vorlage, true)}>
              Ersetzen
            </button>
            <button type="button" onClick={() => einfuegen(rueckfrage.vorlage, false)}>
              Anhängen
            </button>
            <button type="button" onClick={() => setRueckfrage(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : rueckfrage?.art === 'schliessen' ? (
        <div className="zentrale-inspektor-warnung">
          Änderungen verwerfen? Der getippte Text geht verloren.
          <div className="zentrale-inspektor-fuss">
            <button type="button" autoFocus onClick={() => setRueckfrage(null)}>
              Weiter bearbeiten
            </button>
            <button type="button" className="warn" onClick={() => onSchliessen(null)}>
              Verwerfen
            </button>
          </div>
        </div>
      ) : null}

      {meldung ? (
        <p className="zentrale-inspektor-fehler" role="alert">
          {meldung}
        </p>
      ) : null}

      <div className="zentrale-inspektor-fuss">
        <button type="button" className="haupt" disabled={gesperrt || !geaendert || zuLang} onClick={speichern}>
          {laeuft ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <button type="button" disabled={gesperrt || vorlagen?.zustand === 'laedt'} onClick={() => void vorlagenLaden()}>
          Vorlage einfügen
        </button>
        <button
          type="button"
          // Nicht, solange die Liste lädt: ihre späte Antwort stünde sonst neben dem Feld (Codex P1d B-F1).
          disabled={
            beschaeftigt ||
            vorlageSchreibt ||
            neu === null ||
            vorlageSichern?.art === 'offen' ||
            vorlagen?.zustand === 'laedt'
          }
          onClick={() => {
            setVorlagen(null)
            setVorlageSichern({ art: 'offen' })
          }}
        >
          Als Vorlage speichern
        </button>
        <button
          type="button"
          disabled={phase === 'schreibt' || rueckfrage !== null || vorlageSchreibt}
          onClick={schliessen}
        >
          {geaendert ? 'Verwerfen …' : 'Schließen'}
        </button>
      </div>
    </div>
  )
}
