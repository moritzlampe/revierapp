'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { freigabeHinweis, freigabeKarteFrei, freigabeRueckfrage, staendeAbErreicht } from '@/lib/hunt/staende-freigabe'
import { schreibe, SchreibFehler } from '../../schreiben'
import { VORBEREITBARE_STATUS } from '../jagden'

/**
 * Freigabe der Stände im Portal — CP-116, zweiter Teil (Bauplan
 * `quickhunt-native/docs/konzepte/QuickHunt_Bauplan_Sichtgrenze_Staende_V1.md`,
 * E3 und E8). Die Grenze selbst sitzt in der DB (`staende_offen()`, 146);
 * hier steht nur, was die Leitung sieht und schreibt.
 *
 * Steht im Verteilen-Bereich, und der erscheint nur für die Leitung einer
 * Jagd in `draft`/`scheduled` (`treibenSichtbar` in `page.tsx`) — also genau
 * für die, die `map_open` schreiben dürfen (`hunts_creator_all`,
 * `hunts_leader_update`).
 *
 * Schreibmuster wie App und PWA: absoluter Zielwert, `.select('map_open')`,
 * genau eine Zeile mit dem gewählten Wert gilt als Erfolg (S1), Freigeben mit
 * Rückfrage, Zurücknehmen ohne, Doppelklick-Riegel als Ref (S5). Der
 * Statusfilter macht aus einer inzwischen gestarteten Jagd einen lauten
 * Fehlschlag (Konzept §3: das Portal schreibt nicht in eine laufende Jagd).
 */
/** Ein Satzende anhängen, falls keines da ist (Codex Delta 2, Punkt 4). */
const satz = (text: string) => (/[.!?]$/.test(text.trimEnd()) ? text.trimEnd() : `${text.trimEnd()}.`)

export interface FreigabeDaten {
  kind: string | null
  mapOpen: boolean
  scheduledFor: string | null
  startedAt: string | null
  schuetzenSicht: string | null
}

export default function StaendeFreigabe({
  jagdId,
  daten,
  treibenGestartet,
}: {
  jagdId: string
  daten: FreigabeDaten
  /**
   * Ein Treiben ist gestartet — `146` fragt `started_at`, hier steht
   * `status <> 'pending'`. Gleichwertig, weil nur die App Treiben startet und
   * beides in EINEM Update setzt (`quickhunt-native/src/lib/data/drives.ts:392`;
   * der Neustart `:417` lässt `started_at` stehen). Die PWA startet keine.
   */
  treibenGestartet: boolean
}) {
  const router = useRouter()
  const [laedtNach, starteRefresh] = useTransition()
  const riegel = useRef(false)
  const [laeuft, setLaeuft] = useState(false)
  const [frage, setFrage] = useState(false)
  /** Die letzte Fehlermeldung samt dem Wert, der geschrieben werden sollte. */
  const [fehler, setFehler] = useState<{ text: string; ziel: boolean } | null>(null)
  const knopf = useRef<HTMLButtonElement>(null)
  /**
   * Die Uhr, im Minutentakt (E8, Punkt 5): `Date.now()` gehört nicht in den
   * Render, und eine offene Seite soll um T−1h umschlagen. `0` = noch nicht
   * gelesen — dann zeigt die Zeile nichts.
   */
  const [jetzt, setJetzt] = useState(0)
  useEffect(() => {
    setJetzt(Date.now())
    const t = setInterval(() => setJetzt(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Wie `staende_offen()` ohne `map_open`: der Schalter täte dann nichts mehr,
  // also steht er nicht da (E3). `status` ist hier immer draft/scheduled.
  const offenOhneSchalter =
    daten.startedAt !== null || treibenGestartet || staendeAbErreicht(daten.scheduledFor, jetzt)
  // Ändert sich die Lage unter einer offenen Rückfrage — Freigabe per Refresh
  // (App, zweiter Tab) oder die Stände öffnen von selbst —, gilt sie nicht
  // mehr. Sonst verschwänden Knopf UND Rückfrage, oder die alte tauchte nach
  // einer Terminverschiebung samt Fokus wieder auf (Codex CP-116 Portal,
  // Punkt 4 und Delta Punkt 4).
  useEffect(() => setFrage(false), [daten.mapOpen, offenOhneSchalter])

  if (daten.kind === 'solo' || jetzt === 0) return null

  const setzen = async (ziel: boolean) => {
    if (riegel.current) return
    riegel.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      const zeile = await schreibe('Die Freigabe der Stände', () =>
        createClient()
          .from('hunts')
          .update({ map_open: ziel })
          .eq('id', jagdId)
          .in('status', VORBEREITBARE_STATUS)
          .select('map_open'),
      )
      if (zeile.map_open !== ziel) throw new Error('Die Freigabe der Stände steht nicht auf dem gewählten Wert.')
      setFrage(false)
    } catch (err) {
      // 0 Zeilen heißt hier fast immer: die Jagd ist inzwischen gestartet
      // (Statusfilter) oder die Leitung liegt nicht mehr bei einem (RLS).
      setFehler({
        ziel,
        text:
          err instanceof SchreibFehler && err.keineZeile
            ? 'Die Freigabe wurde nicht gespeichert: die Jagd ist inzwischen gestartet oder die Leitung liegt nicht mehr bei dir. Die Seite lädt den aktuellen Stand.'
            : `${satz((err as Error).message)} Bitte noch einmal versuchen.`,
      })
    } finally {
      riegel.current = false
      setLaeuft(false)
      // Nach Erfolg UND Fehlschlag den Kopf neu lesen, statt den Antwortwert zu
      // übernehmen (E3, V1.3: eine verspätete Antwort überschriebe sonst einen
      // neueren Stand aus der App).
      starteRefresh(() => router.refresh())
    }
  }

  const gesperrt = laeuft || laedtNach
  const fragt = frage && !offenOhneSchalter && !daten.mapOpen
  /**
   * Die Meldung steht, solange ihr Anlass besteht: das Ziel ist nicht erreicht
   * UND der Schalter wirkt noch. Beim Rendern abgeleitet statt per Effekt
   * gelöscht — drei Prüfläufe fanden je einen neuen Fall, in dem ein Effekt
   * die Meldung zu früh oder zu spät räumte (Schlusslesung F2, Codex Delta 2
   * und 3). Eine verlorene Antwort mit geglücktem Write verschwindet so von
   * selbst; eine gescheiterte Rücknahme taucht wieder auf, wenn der Schalter
   * nach einer Terminverschiebung zurückkommt.
   */
  // Ist das Ziel einmal erreicht (eigener Write mit verlorener Antwort, oder
  // ein anderer Tab), ist die Meldung erledigt — endgültig, sonst kehrte sie
  // nach einem späteren Zurückstellen wieder (Codex Delta 4). State während
  // des Renderns anpassen ist das React-Muster dafür, kein Effekt.
  if (fehler && fehler.ziel === daten.mapOpen) setFehler(null)
  const fehlerText = fehler && fehler.ziel !== daten.mapOpen && !offenOhneSchalter ? fehler.text : null
  const abbrechen = () => {
    setFrage(false)
    // Fokus zurück auf den Knopf, der die Rückfrage geöffnet hat (Codex Punkt 8).
    requestAnimationFrame(() => knopf.current?.focus())
  }

  // Bei Sichtstufe `alles` sehen sie auch die Sitzordnung der anderen
  // (`stand_zeile_in_sicht`, 146) — wie die Rückfrage (Schlusslesung F3).
  const was =
    daten.schuetzenSicht === 'alles'
      ? 'ihren Stand, ihre Treiben-Stände und die Sitzordnung'
      : 'ihren Stand und ihre Treiben-Stände'

  return (
    <>
      <div className="jagd-verteilen-freigabe">
        <p className="zentrale-hinweis">
          {offenOhneSchalter
            ? `Zugesagte Schützen sehen ${was} — ab einer Stunde vor Jagdbeginn oder nach dem Start. `
            : daten.mapOpen
              ? `Stände für Schützen freigegeben: zugesagte Schützen sehen ${was}. ${freigabeKarteFrei(daten.schuetzenSicht)} `
              : `Stände für Schützen verborgen — bis zur Freigabe sieht nur die Leitung die Einteilung. ${freigabeHinweis(daten.scheduledFor, jetzt)} `}
          Den Stand eines Treibens nennt der Banner in der App erst beim Start.
        </p>
        {!offenOhneSchalter && !fragt && (
          <div className="jagd-treiben-knoepfe">
            <button
              ref={knopf}
              type="button"
              className={daten.mapOpen ? 'zentrale-abbrechen' : 'zentrale-knopf'}
              disabled={gesperrt}
              onClick={() => (daten.mapOpen ? void setzen(false) : setFrage(true))}
            >
              {daten.mapOpen ? 'Freigabe zurücknehmen' : 'Stände freigeben'}
            </button>
          </div>
        )}
      </div>

      {fragt && (
        <div className="jagd-verteilen-frage" role="alertdialog" aria-labelledby="jagd-freigabe-frage-text">
          <p id="jagd-freigabe-frage-text">
            {freigabeRueckfrage(daten.schuetzenSicht, daten.scheduledFor, jetzt)}
          </p>
          <div className="jagd-treiben-knoepfe">
            <button type="button" className="zentrale-knopf" onClick={() => void setzen(true)} disabled={gesperrt}>
              Freigeben
            </button>
            {/* autoFocus: der auslösende Knopf verschwindet beim Öffnen (Codex
                Punkt 8) — auf „Abbrechen", nicht „Freigeben", sonst gibt ein
                doppeltes Enter ungelesen frei (Schlusslesung F1). */}
            <button type="button" className="zentrale-abbrechen" onClick={abbrechen} disabled={gesperrt} autoFocus>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {fehlerText && (
        <p className="zentrale-fehler" role="alert">
          {fehlerText}
        </p>
      )}
    </>
  )
}
