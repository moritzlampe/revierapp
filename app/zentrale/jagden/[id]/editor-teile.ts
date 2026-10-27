import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { pruefeVorlagen, speicherAusgang, type RegelVorlage, type SpeicherAusgang } from './regeln'

/**
 * Was der Jagdregeln-Editor (P1b) und der Freigabe-Editor (P1c) teilen
 * (Bauplan Portal Freigabe/Regeln V2.1, E4/E6/E9): Speichern mit Frist als
 * Wettlauf und das Laden der Vorlagen. Aus `jagdregeln-editor.tsx`
 * herausgezogen, als der zweite Editor dazukam — unverändert im Verhalten.
 */

/** Frist für Speichern und Vorlagen-Laden — wie die App (`SCHREIB_FRIST_MS`). */
export const FRIST_MS = 15_000

const KEINE_ANTWORT =
  'Keine gültige Antwort vom Server — der Entwurf bleibt stehen. Ob gespeichert wurde, siehst du nach dem Schließen.'

/** Die Meldung zu einem gescheiterten Speichern (E6). */
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

export type Phase =
  /** Tippen, Speichern möglich. */
  | 'bearbeiten'
  /** Eine Anfrage läuft, die Frist ist noch nicht um: alles gesperrt. */
  | 'schreibt'
  /** Frist um, die Anfrage läuft weiter: Entwurf schreibgeschützt, Schließen geht (E9). */
  | 'wartet'
  /** 0 Zeilen: ein weiterer Versuch prallte an derselben Basis ab — Speichern bleibt gesperrt (E6). */
  | 'veraltet'

/**
 * Speichern als Wettlauf gegen die Frist, **ohne Abbruch** (E9): nach 15 s
 * gilt „keine gültige Antwort", die Anfrage läuft weiter, und ihre Antwort
 * wird verbucht, wenn sie kommt — **ein Versuch zur Zeit** (Codex D2).
 * Gescheitert: 0 Zeilen sperrt Speichern (`veraltet`), alles andere gibt den
 * Entwurf frei. Nach dem Unmount fällt jede Antwort ins Leere (hingenommen).
 */
export function useSpeicherLauf() {
  const [phase, setPhase] = useState<Phase>('bearbeiten')
  const [meldung, setMeldung] = useState<string | null>(null)
  // Riegel als Ref, nicht als State (S5): zwischen Klick und sperrendem
  // Render sähe ein zweiter Klick sonst noch `false`.
  const inArbeit = useRef(false)
  const lebt = useRef(true)
  useEffect(() => {
    lebt.current = true
    return () => {
      lebt.current = false
    }
  }, [])

  /** `geschafft` bekommt die Zeile und ob die Frist schon um war („Doch gespeichert"). */
  const starte = <T>(schreiben: () => Promise<T>, geschafft: (zeile: T, fristUm: boolean) => void) => {
    if (inArbeit.current) return
    inArbeit.current = true
    setPhase('schreibt')
    setMeldung(null)
    let fristUm = false
    const frist = setTimeout(() => {
      fristUm = true
      if (!lebt.current) return
      setPhase('wartet')
      setMeldung(KEINE_ANTWORT)
    }, FRIST_MS)
    schreiben().then(
      (zeile) => {
        clearTimeout(frist)
        inArbeit.current = false
        if (!lebt.current) return
        // Heute schließen beide Aufrufer danach; ein Editor, der offen bleibt
        // (P1d), wäre sonst gesperrt (Schlusslesung P1c, F2).
        setPhase('bearbeiten')
        setMeldung(null)
        geschafft(zeile, fristUm)
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

  return { phase, meldung, starte, lebt }
}

/**
 * Die Vorlagen des eigenen Kontos, alphabetisch (E4) — geladen beim Klick,
 * nicht beim Öffnen, damit eine gerade in der App angelegte dabei ist.
 * **Keine Zeile ist der Normalfall** („keine Vorlagen"), aber nur mit Status
 * 200; unlesbar wirft, nie „keine Vorlagen" (S4, wie `data/vorlagen.ts` der
 * App).
 */
export async function ladeVorlagen(nutzerId: string): Promise<RegelVorlage[]> {
  const { data, error, status } = await Promise.race([
    createClient().from('user_settings').select('regel_vorlagen').eq('user_id', nutzerId).maybeSingle(),
    new Promise<never>((_, nein) => setTimeout(() => nein(new Error('Keine Antwort vom Server (15 s).')), FRIST_MS)),
  ])
  if (error) throw new Error(error.message)
  if (!data && status !== 200) throw new Error(`Leere Antwort (${status}) — nicht vom Server.`)
  const liste = data ? pruefeVorlagen(data.regel_vorlagen) : []
  if (liste === undefined) throw new Error('Vorlagen gerade nicht lesbar.')
  return [...liste].sort((a, b) => a.titel.localeCompare(b.titel, 'de'))
}
