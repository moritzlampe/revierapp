'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../../schreiben'
import { VORBEREITBARE_STATUS } from '../jagden'
import {
  alsFeldtext,
  JAGDREGELN_MAX_ZEICHEN,
  jagdregelnGeaendert,
  pruefeJagdregeln,
  pruefeVorlagen,
  regelnZumSpeichern,
  speicherAusgang,
  vorlageEinfuegen,
  type RegelVorlage,
  type SpeicherAusgang,
} from './regeln'

/** Frist für Speichern und Vorlagen-Laden — wie die App (`SCHREIB_FRIST_MS`). */
const FRIST_MS = 15_000

const KEINE_ANTWORT =
  'Keine gültige Antwort vom Server — der Entwurf bleibt stehen. Ob gespeichert wurde, siehst du nach dem Schließen.'

/** Die Meldung zu einem gescheiterten Speichern (Bauplan Portal P1b/P1c, E6). */
function meldungZu(ausgang: SpeicherAusgang): string {
  switch (ausgang.art) {
    case 'keineZeile':
      return 'Nicht gespeichert: geändert, die Jagd läuft inzwischen, ist gelöscht, oder du leitest sie nicht mehr. Der Text bleibt zum Kopieren stehen; „Verwerfen" lädt den neuen Stand.'
    case 'abgemeldet':
      return 'Anmeldung abgelaufen — Text kopieren, in einem neuen Tab anmelden, dann hier erneut speichern.'
    case 'abgelehnt':
      return `Der Server hat abgelehnt (${ausgang.code})${ausgang.grund}`
    case 'keineAntwort':
      return KEINE_ANTWORT
  }
}

type Phase =
  /** Tippen, Speichern möglich. */
  | 'bearbeiten'
  /** Eine Anfrage läuft, die Frist ist noch nicht um: alles gesperrt. */
  | 'schreibt'
  /** Frist um, die Anfrage läuft weiter: Entwurf schreibgeschützt, Schließen geht (E9). */
  | 'wartet'
  /** 0 Zeilen: ein weiterer Versuch prallte an derselben Basis ab — Speichern bleibt gesperrt (E6). */
  | 'veraltet'

type Rueckfrage = { art: 'schliessen' } | { art: 'vorlage'; vorlage: RegelVorlage }

type Vorlagen = { zustand: 'laedt' } | { zustand: 'fehler'; text: string } | { zustand: 'da'; liste: RegelVorlage[] }

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
  const [phase, setPhase] = useState<Phase>('bearbeiten')
  const [meldung, setMeldung] = useState<string | null>(null)
  const [rueckfrage, setRueckfrage] = useState<Rueckfrage | null>(null)
  const [vorlagen, setVorlagen] = useState<Vorlagen | null>(null)
  // Riegel als Ref, nicht als State (S5) — wie `regeln-bereich.tsx`.
  const inArbeit = useRef(false)
  const lebt = useRef(true)
  useEffect(() => {
    lebt.current = true
    return () => {
      lebt.current = false
    }
  }, [])

  const neu = regelnZumSpeichern([feld])
  const geaendert = jagdregelnGeaendert(neu, basis)
  // Gezählt wird der gespeicherte Text samt „• ", UTF-16 wie die App (E3).
  const zeichen = neu?.length ?? 0
  const zuLang = zeichen > JAGDREGELN_MAX_ZEICHEN
  const laeuft = phase === 'schreibt' || phase === 'wartet'
  // Solange eine Rückfrage offen ist, ist der übrige Editor gesperrt (E1).
  const gesperrt = phase !== 'bearbeiten' || rueckfrage !== null

  // Reload und Tab schließen fragen nach, solange etwas verloren ginge (E9).
  // Link-Navigation im Portal erreicht das nicht (CP-107, hingenommen).
  const schuetzen = geaendert || laeuft
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
    if (inArbeit.current || gesperrt || !geaendert || zuLang) return
    inArbeit.current = true
    setPhase('schreibt')
    setMeldung(null)
    // Wettlauf ohne Abbruch (E9): nach der Frist läuft die Anfrage weiter,
    // ihre Antwort wird verbucht, wenn sie kommt.
    let fristUm = false
    const frist = setTimeout(() => {
      fristUm = true
      if (!lebt.current) return
      setPhase('wartet')
      setMeldung(KEINE_ANTWORT)
    }, FRIST_MS)
    schreibe('Die Jagdregeln', () => {
      const anfrage = createClient()
        .from('hunts')
        .update({ jagdregeln: neu })
        .eq('id', jagdId)
        .in('status', VORBEREITBARE_STATUS)
      return (basis === null ? anfrage.is('jagdregeln', null) : anfrage.eq('jagdregeln', basis)).select('jagdregeln')
    }).then(
      (zeile) => {
        clearTimeout(frist)
        inArbeit.current = false
        // Nach dem Schließen fällt die Antwort ins Leere (E9, hingenommen).
        if (!lebt.current) return
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
      (e: unknown) => {
        clearTimeout(frist)
        inArbeit.current = false
        if (!lebt.current) return
        const ausgang = speicherAusgang(e)
        setPhase(ausgang.art === 'keineZeile' ? 'veraltet' : 'bearbeiten')
        setMeldung(meldungZu(ausgang))
      },
    )
  }

  const schliessen = () => {
    // Nach der Frist ebenfalls fragen: eine Antwort danach fiele ins Leere.
    if (geaendert || phase === 'wartet') setRueckfrage({ art: 'schliessen' })
    else onSchliessen(null)
  }

  /**
   * Lädt die Vorlagen beim Klick, nicht beim Öffnen (E4) — frisch, falls in
   * der App gerade eine angelegt wurde. **Keine Zeile ist der Normalfall**
   * („keine Vorlagen"), aber nur mit Status 200; unlesbar heißt „nicht
   * lesbar", nie „keine Vorlagen" (S4, wie `data/vorlagen.ts` der App).
   */
  const vorlagenLaden = async () => {
    setVorlagen({ zustand: 'laedt' })
    try {
      const { data, error, status } = await Promise.race([
        createClient().from('user_settings').select('regel_vorlagen').eq('user_id', nutzerId).maybeSingle(),
        new Promise<never>((_, nein) =>
          setTimeout(() => nein(new Error('Keine Antwort vom Server (15 s).')), FRIST_MS),
        ),
      ])
      if (error) throw new Error(error.message)
      if (!data && status !== 200) throw new Error(`Leere Antwort (${status}) — nicht vom Server.`)
      const liste = data ? pruefeVorlagen(data.regel_vorlagen) : []
      if (liste === undefined) throw new Error('Vorlagen gerade nicht lesbar.')
      if (lebt.current) {
        setVorlagen({ zustand: 'da', liste: [...liste].sort((a, b) => a.titel.localeCompare(b.titel, 'de')) })
      }
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
        <p className="zentrale-hinweis">Noch keine Vorlagen — angelegt werden sie in der App (Du → Jagdeinstellungen).</p>
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
        <button type="button" disabled={phase === 'schreibt' || rueckfrage !== null} onClick={schliessen}>
          {geaendert ? 'Verwerfen …' : 'Schließen'}
        </button>
      </div>
    </div>
  )
}
