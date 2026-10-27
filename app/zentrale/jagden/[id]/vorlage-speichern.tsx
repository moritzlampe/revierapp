'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FRIST_MS } from './editor-teile'
import { VORLAGE_TITEL_MAX, vorlageFehler, vorlageMeldung, vorlageSpeichern, type VorlagenClient } from './regeln'

/**
 * **Ein Vorlagen-Write zur Zeit auf der ganzen Seite, nicht je Feld.** Ein
 * nach der Frist geschlossenes und neu geöffnetes Feld bekäme sonst einen
 * frischen Riegel, während der alte Versuch noch läuft — und fände dann die
 * eigene, spät gelandete Vorlage als „gibt es schon" (Codex P1d E1; Kartei
 * „Sperre am Schlüssel, nicht in einer Bildschirm-Instanz").
 */
let versuchLaeuft = false

const NOCH_KEINE_ANTWORT =
  'Noch keine Antwort vom Server (15 s) — der Versuch läuft weiter. Ob gespeichert wurde, zeigt sich hier oder unter „Vorlage einfügen“.'

/**
 * „Als Vorlage speichern" (Fahrplan P1d, Bauplan Portal Freigabe/Regeln V2.1,
 * E4) — Name, „Sichern", „Abbrechen", wie `VorlageSpeichern` in der App
 * (`RegelEingabe.tsx`), aber **nur unter neuem Namen**: ein vergebener wird
 * abgelehnt, Ersetzen geht in der App.
 *
 * - **Beim Tippen geprüft wird nur, was ohne Liste geht** (Name, Länge,
 *   Regeln). „Gibt es schon" und die 50er-Grenze meldet `vorlageSpeichern`
 *   beim Schreiben gegen den frischen Stand — ein Vorab-Laden der Liste prüfte
 *   dasselbe zweimal (Ponytail 27.10.2026).
 * - **Während des Writes sperrt der Editor Speichern und Schließen**
 *   (`onSchreibt`): sonst schlösse ein Erfolg des Editors dieses Feld, und
 *   die Antwort fiele ins Leere — dieselbe Sperre wie „Zurück" in der App
 *   (Codex CN-348 Delta 2).
 * - **Nach der Frist (15 s) ist der Editor frei, das Feld wartet weiter** —
 *   ein Versuch zur Zeit, eine späte Antwort wird verbucht. **Abweichung von
 *   der App**, die nach der Frist freigibt: ein zweiter Versuch fände dort die
 *   eigene, spät gelandete Vorlage und böte „ersetzen?" an; hier, ohne
 *   Ersetzen, hiesse es „gibt es schon — Ersetzen geht in der App"
 *   (Schlusslesung P1d F2). Wer den Editor schliesst, verwirft nur die Anzeige.
 */
export default function VorlageSpeichern({
  nutzerId,
  regeln,
  vorschlag,
  aus,
  onSchreibt,
  onFertig,
  onAbbrechen,
}: {
  nutzerId: string
  /** Der Text, wie er gespeichert würde (`regelnZumSpeichern`); `null` = keine Regel. */
  regeln: string | null
  /** Vorbelegter Name — wie in der App „Jagdregeln" bzw. die Wildart. */
  vorschlag: string
  /** Der Editor speichert oder fragt gerade — dann kein „Sichern". */
  aus: boolean
  onSchreibt: (an: boolean) => void
  onFertig: (titel: string) => void
  onAbbrechen: () => void
}) {
  const id = useId()
  const [titel, setTitel] = useState(vorschlag)
  const [phase, setPhase] = useState<'bereit' | 'schreibt' | 'wartet'>('bereit')
  const [meldung, setMeldung] = useState<string | null>(null)
  const lebt = useRef(true)

  useEffect(() => {
    lebt.current = true
    return () => {
      lebt.current = false
    }
  }, [])

  const fehler = vorlageFehler([], titel, regeln)
  const kannSichern = !aus && phase === 'bereit' && fehler === null

  const sichern = () => {
    if (!kannSichern) return
    if (versuchLaeuft) {
      setMeldung('Ein früherer Versuch läuft noch — bitte kurz warten. Ob er gespeichert hat, zeigt „Vorlage einfügen“.')
      return
    }
    // Synchron gesetzt (S5): auch Eingabetaste plus Klick startet nur einen.
    versuchLaeuft = true
    setPhase('schreibt')
    setMeldung(null)
    onSchreibt(true)
    const name = titel.trim()
    let fristUm = false
    const frist = setTimeout(() => {
      fristUm = true
      onSchreibt(false)
      if (!lebt.current) return
      setPhase('wartet')
      setMeldung(NOCH_KEINE_ANTWORT)
    }, FRIST_MS)
    // Der Client erfüllt `VorlagenClient`, aber TS kann es an den Typen von
    // supabase-js nicht nachrechnen (TS2589) — daher der Umweg über `unknown`.
    // In der Kette erzeugt: ein synchroner Wurf liefe sonst an `finally`
    // vorbei, und der Seiten-Riegel bliebe stehen (Codex P1d F-F1).
    Promise.resolve()
      .then(() => vorlageSpeichern(createClient() as unknown as VorlagenClient, nutzerId, name, regeln))
      .then(
        () => {
          if (lebt.current) onFertig(name)
        },
        (e: unknown) => {
          if (lebt.current) setMeldung(vorlageMeldung(e))
        },
      )
      .finally(() => {
        clearTimeout(frist)
        versuchLaeuft = false
        if (!fristUm) onSchreibt(false)
        if (lebt.current) setPhase('bereit')
      })
  }

  return (
    <div className="jagd-vorlage-speichern">
      <div className="zentrale-inspektor-feld">
        <label htmlFor={id}>Name der Vorlage</label>
        <input
          id={id}
          value={titel}
          maxLength={VORLAGE_TITEL_MAX}
          readOnly={phase !== 'bereit'}
          autoFocus
          autoComplete="off"
          onChange={(e) => setTitel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            sichern()
          }}
        />
      </div>
      {fehler !== null && titel.trim() !== '' ? <p className="zentrale-inspektor-warnung">{fehler}</p> : null}
      {meldung ? (
        <p className="zentrale-inspektor-fehler" role="alert">
          {meldung}
        </p>
      ) : null}
      <div className="zentrale-inspektor-fuss jagd-regeln-vorlagen">
        <button type="button" disabled={!kannSichern} onClick={sichern}>
          {phase === 'schreibt' ? 'Wird gesichert …' : phase === 'wartet' ? 'Wartet auf Antwort …' : 'Sichern'}
        </button>
        <button type="button" disabled={phase === 'schreibt'} onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
