'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../../schreiben'
import { VORBEREITBARE_STATUS } from '../jagden'
import FreigabeEditor from './freigabe-editor'
import JagdregelnEditor from './jagdregeln-editor'
import {
  freigabeBloecke,
  hatGewicht,
  pruefeFreigabe,
  pruefeFreigabeRegeln,
  pruefeFreigabeVersion,
  pruefeJagdregeln,
  regelPunkte,
  SCHUETZEN_SICHTEN,
  sichtAusZeile,
  sichtEnthaelt,
  sichtLesetext,
  sichtSpalte,
  umkreisOptionen,
  type KatalogArt,
  type SichtAenderung,
} from './regeln'

/** Die Spalten der Jagd, so roh, wie sie aus `hunts` kommen. */
export interface RegelnRoh {
  freigabe: unknown
  freigabe_regeln: unknown
  freigabe_version: unknown
  jagdregeln: unknown
  schuetzen_sicht: unknown
  sicht_umkreis_m: unknown
  gruppenleiter_sicht: unknown
}

/**
 * Eine globale Art aus `wildarten` (096, 097) — für die Blöcke der Anzeige
 * und, seit P1c, für die Auswahl im Freigabe-Editor.
 */
export interface Katalogzeile {
  id: string
  name: string
  eltern_id: string | null
  geschlecht_implizit: string | null
  bejagdbar: boolean
  suchbegriffe: string[]
}

/** Welcher Editor offen ist — immer höchstens einer (E7). */
type Editor = 'freigabe' | 'jagdregeln'

/**
 * Freigabe, Jagdregeln und „Was Schützen sehen" einer Jagd (Fahrplan P1a).
 *
 * **Jagdregeln (P1b) und Freigabe (P1c) sind bearbeitbar**
 * (`jagdregeln-editor.tsx`, `freigabe-editor.tsx`), unter `regelnBearbeitbar`
 * (Bauplan Portal Freigabe/Regeln V2.1, E7); die Freigabe zusätzlich nur, wenn
 * Freigabe, Regeln je Wildart UND Version lesbar sind — sonst ginge
 * unbekannter Inhalt beim Speichern verloren.
 * Die Darstellung ist die der App (`regeln.ts`, Kopie aus `freigabe.ts`):
 * je Wildart ein Block, darunter, was frei ist, und die Regeln dieser Art.
 *
 * **Die Sicht ist einstellbar**, wie nativ: je Wahl genau EINE Spalte, ohne
 * Compare-and-Swap — die letzte Wahl gilt, jede ist für sich vollständig
 * (`speichereJagdSicht()` in der App). Erfolg zählt nur, wenn der Server den
 * gewählten Wert zurückgibt. Anders als nativ nur, solange die Jagd
 * vorbereitet wird (`schreibbar`): eine laufende Jagd ist im Portal
 * read-only (Konzept Revierzentrale §3), die App erlaubt die Sicht auch dann.
 *
 * **Unbekannt ist nicht leer** (S4): eine Spalte, die sich nicht lesen lässt,
 * steht als „nicht lesbar" da — nie als „noch nichts eingetragen".
 */
export default function RegelnBereich({
  jagdId,
  roh,
  katalog,
  schreibbar,
  regelnBearbeitbar,
  nutzerId,
}: {
  jagdId: string
  roh: RegelnRoh
  katalog: Katalogzeile[]
  schreibbar: boolean
  /** Leitung, Jagd in Vorbereitung und nicht beendet (E7) — strenger als die App. */
  regelnBearbeitbar: boolean
  nutzerId: string
}) {
  const router = useRouter()
  const [fehler, setFehler] = useState<string | null>(null)
  /**
   * Welcher Editor offen ist — **als Zustand, nicht aus den Props** (E6):
   * kippt `regelnBearbeitbar` nach einem Nachladen auf falsch, bleibt der
   * offene Entwurf stehen; sein Speichern prallt dann an 0 Zeilen ab.
   */
  const [editorOffen, setEditorOffen] = useState<Editor | null>(null)
  /**
   * Was ein Editor beim Schließen meldet („Gespeichert.", „Doch gespeichert"
   * …), unter dem Abschnitt, aus dem er kam. **Weg bei der nächsten Aktion**
   * (Sicht ändern, einen Editor öffnen) — sonst stünde „Gespeichert." über
   * einem Stand, den spätere Writes längst geändert haben (Schlusslesung P1b,
   * Randnotiz).
   */
  const [hinweis, setHinweis] = useState<{ bei: Editor; text: string } | null>(null)
  const oeffne = (editor: Editor) => {
    setHinweis(null)
    setEditorOffen(editor)
  }
  const schliesse = (editor: Editor) => (text: string | null) => {
    setEditorOffen(null)
    setHinweis(text === null ? null : { bei: editor, text })
    starteRefresh(() => router.refresh())
  }
  const [laedtNach, starteRefresh] = useTransition()
  const [laeuft, setLaeuft] = useState(false)
  // Riegel als Ref, nicht als State: zwischen Klick und sperrendem Render
  // sähe ein zweiter Klick sonst noch `false` (S5).
  const inArbeit = useRef(false)
  /**
   * Die gerade gewählte, noch nicht bestätigte Sicht — **nur fürs Anzeigen,
   * solange geschrieben und nachgeladen wird** (Schlusslesung 26.10.2026, B5).
   * Ohne sie sprang das Feld nach der Wahl auf den alten Prop-Wert zurück und
   * zeigte die eigene Wahl erst nach dem Refresh: „Nur eigener Stand"
   * gewählt, „Alles" ausgegraut gesehen — das las sich wie abgelehnt. Danach
   * gilt wieder der Server-Stand (auch nach einem Fehler).
   */
  const [ausstehend, setAusstehend] = useState<SichtAenderung | null>(null)

  const freigabe = pruefeFreigabe(roh.freigabe)
  const jeArt = pruefeFreigabeRegeln(roh.freigabe_regeln)
  const version = pruefeFreigabeVersion(roh.freigabe_version)
  const jagdregeln = pruefeJagdregeln(roh.jagdregeln)
  const sicht = sichtAusZeile(roh)

  const katalogNachId = new Map<string, KatalogArt>(
    katalog.map((a) => [a.id, { name: a.name, elternId: a.eltern_id }]),
  )
  const bloecke =
    freigabe === undefined || jeArt === undefined ? null : freigabeBloecke(freigabe ?? [], katalogNachId, jeArt ?? [])
  // E7: Freigabe, Regeln je Wildart UND Version lesbar — wie die App
  // (`FreigabeAnsicht.tsx:127`), sonst ginge unbekannter Inhalt verloren.
  const freigabeLesbar =
    regelnBearbeitbar && freigabe !== undefined && jeArt !== undefined && version !== undefined
  // Ein leerer Katalog sähe im Editor aus wie „keine Art gefunden" (S4,
  // Codex P1c C-F3) — dann kein Editor, sondern der Grund.
  const freigabeAenderbar = freigabeLesbar && katalog.length > 0

  const gesperrt = laeuft || laedtNach
  const angezeigt =
    sicht && ausstehend && gesperrt ? { ...sicht, [ausstehend.feld]: ausstehend.wert } : sicht

  const sichtAendern = async (aenderung: SichtAenderung) => {
    if (inArbeit.current) return
    inArbeit.current = true
    setAusstehend(aenderung)
    setLaeuft(true)
    setFehler(null)
    setHinweis(null)
    try {
      // **Der Statusfilter ist der Riegel gegen eine inzwischen gestartete
      // Jagd** (Fremdprüfung 26.10.2026, F1) — dieselbe Bauform wie beim
      // Bearbeiten der Jagd in `detail.tsx`: startet jemand die Jagd in der
      // App, nachdem diese Seite geladen hat, trifft das UPDATE 0 Zeilen, und
      // `schreibe()` macht daraus einen Fehler. Ohne ihn schriebe ein offener
      // Browser in eine laufende Feldsituation (Konzept §3).
      const zurueck = await schreibe('Die Sicht', () =>
        createClient()
          .from('hunts')
          .update(sichtSpalte(aenderung))
          .eq('id', jagdId)
          .in('status', VORBEREITBARE_STATUS)
          .select('schuetzen_sicht, sicht_umkreis_m, gruppenleiter_sicht')
      )
      // Geschrieben, aber nicht so zurückgekommen — dann ist der Stand
      // unbekannt, und das soll man sehen (wie nativ).
      const neu = sichtAusZeile(zurueck as Record<string, unknown>)
      if (!neu || !sichtEnthaelt(neu, aenderung)) {
        throw new Error('Die Sicht wurde gespeichert, kam aber nicht wie gewählt zurück. Die Seite lädt neu.')
      }
    } catch (err) {
      // Abgelehnt: die Überlagerung sofort weg, nicht erst nach dem Refresh —
      // sonst zeigte das Feld den abgelehnten Wert neben „nicht gespeichert"
      // (Schlusslesung 26.10.2026, H1).
      setAusstehend(null)
      const text = err instanceof Error ? err.message : 'Unbekannter Fehler beim Speichern der Sicht.'
      // 0 Zeilen heißt hier: die Jagd läuft inzwischen, ist gelöscht, oder
      // die Leitung liegt nicht mehr bei dir — RLS und der Statusfilter
      // melden alles gleich. Der Refresh danach zeigt, welches.
      setFehler(
        text.includes('kein Datensatz betroffen')
          ? 'Die Sicht wurde nicht gespeichert: die Jagd läuft inzwischen, ist gelöscht, oder du leitest sie nicht mehr. Die Seite lädt den neuen Stand.'
          : text
      )
    } finally {
      inArbeit.current = false
      setLaeuft(false)
      starteRefresh(() => router.refresh())
    }
  }

  return (
    <section className="jagd-regeln">
      <h2 className="jagden-abschnitt">Freigabe &amp; Regeln</h2>

      <h3 className="jagd-regeln-titel">Freigabe</h3>
      {editorOffen === 'freigabe' ? (
        <FreigabeEditor
          jagdId={jagdId}
          // Nach dem Öffnen liest der Editor diese Werte nicht mehr (Basis
          // eingefroren, E9); geöffnet wird er nur, wenn alle drei lesbar
          // waren (`freigabeAenderbar`). Die Ersatzwerte greifen also nie beim
          // Öffnen — und ein späteres Nachladen schließt den Entwurf nicht
          // (E6), wie in der App (`FreigabeAnsicht.tsx:121`).
          basis={{ freigabe: freigabe ?? null, regeln: jeArt ?? null, version: version ?? -1 }}
          katalog={katalog}
          nutzerId={nutzerId}
          onSchliessen={schliesse('freigabe')}
        />
      ) : bloecke === null ? (
        <p className="zentrale-hinweis">Die Freigabe ließ sich nicht lesen.</p>
      ) : bloecke.length === 0 ? (
        <p className="zentrale-hinweis">Noch keine Freigabe eingetragen.</p>
      ) : (
        <>
          <ul className="jagd-regeln-bloecke">
            {/* Schlüssel mit Index wie in der App (`FreigabeAnsicht`): zwei
                Blöcke gleichen Titels sind möglich, wenn eine Regel keinen
                Block findet (Schlusslesung 26.10.2026, S9). */}
            {bloecke.map((b, i) => (
              <li key={`${b.titel}-${i}`}>
                <strong>{b.titel}</strong>
                {b.zeilen.length > 0 ? <span className="jagd-regeln-frei"> — {b.zeilen.join(', ')}</span> : null}
                {b.regeln.length > 0 ? (
                  <ul className="jagd-regeln-punkte">
                    {b.regeln.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {freigabe && hatGewicht(freigabe) ? <p className="zentrale-hinweis">Gewichte: aufgebrochen</p> : null}
        </>
      )}
      {editorOffen === 'freigabe' ? null : (
        <>
          {hinweis?.bei === 'freigabe' ? (
            <p className="zentrale-hinweis" role="status">
              {hinweis.text}
            </p>
          ) : null}
          {freigabeAenderbar ? (
            <button
              type="button"
              className="zentrale-knopf"
              disabled={laedtNach || editorOffen !== null}
              onClick={() => oeffne('freigabe')}
            >
              {freigabe === null ? 'Freigabe eintragen' : 'Freigabe ändern'}
            </button>
          ) : freigabeLesbar ? (
            <p className="zentrale-hinweis">
              Der Wildartenkatalog kam leer an — die Freigabe lässt sich gerade nicht bearbeiten. Seite neu laden.
            </p>
          ) : null}
        </>
      )}

      <h3 className="jagd-regeln-titel">Jagdregeln</h3>
      {editorOffen === 'jagdregeln' ? (
        <JagdregelnEditor
          jagdId={jagdId}
          // Nach dem Öffnen liest der Editor diesen Wert nicht mehr (Basis
          // eingefroren); geöffnet wird er nur, wenn er lesbar war.
          basis={jagdregeln ?? null}
          nutzerId={nutzerId}
          onSchliessen={schliesse('jagdregeln')}
        />
      ) : (
        <>
          {jagdregeln === undefined ? (
            <p className="zentrale-hinweis">Die Jagdregeln ließen sich nicht lesen.</p>
          ) : jagdregeln === null ? (
            <p className="zentrale-hinweis">Noch keine Jagdregeln eingetragen.</p>
          ) : (
            <ul className="jagd-regeln-punkte">
              {regelPunkte(jagdregeln).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {hinweis?.bei === 'jagdregeln' ? (
            <p className="zentrale-hinweis" role="status">
              {hinweis.text}
            </p>
          ) : null}
          {/* Nur lesbare Jagdregeln öffnen den Editor (E7): unbekannter Inhalt
              ginge beim Speichern verloren. */}
          {regelnBearbeitbar && jagdregeln !== undefined ? (
            <button
              type="button"
              className="zentrale-knopf"
              disabled={laedtNach || editorOffen !== null}
              onClick={() => oeffne('jagdregeln')}
            >
              {jagdregeln === null ? 'Jagdregeln eintragen' : 'Jagdregeln ändern'}
            </button>
          ) : null}
        </>
      )}

      <h3 className="jagd-regeln-titel">Was Schützen sehen</h3>
      {sicht === undefined || angezeigt === undefined ? (
        <p className="zentrale-hinweis">Die Sicht ließ sich nicht lesen.</p>
      ) : !schreibbar ? (
        <p>{sichtLesetext(sicht)}</p>
      ) : (
        <div className="jagd-regeln-sicht">
          <label>
            Schützen sehen{' '}
            <select
              value={angezeigt.schuetzen}
              disabled={gesperrt}
              onChange={(e) =>
                void sichtAendern({ feld: 'schuetzen', wert: e.target.value as typeof angezeigt.schuetzen })
              }
            >
              {SCHUETZEN_SICHTEN.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {angezeigt.schuetzen === 'umkreis' ? (
            <label>
              Umkreis um den eigenen Stand{' '}
              <select
                value={angezeigt.umkreisM}
                disabled={gesperrt}
                onChange={(e) => void sichtAendern({ feld: 'umkreisM', wert: Number(e.target.value) })}
              >
                {umkreisOptionen(angezeigt.umkreisM).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={angezeigt.gruppenleiter === 'alles'}
              disabled={gesperrt}
              onChange={(e) =>
                void sichtAendern({ feld: 'gruppenleiter', wert: e.target.checked ? 'alles' : 'wie_schuetzen' })
              }
            />{' '}
            Gruppenleiter sehen alles
          </label>
          {/* Die App zählt die Schützen ohne Stand (`schuetzenOhneStand`);
              das Portal hat die Sitzordnung erst mit P2 — bis dahin die
              Regel als Satz, sinngemäß wie die App. */}
          {/* Gruppenleiter mit „sehen alles" brauchen keinen Stand — wie
              `schuetzenOhneStand()` der App sie ausnimmt (Fremdprüfung
              26.10.2026, F2). */}
          {angezeigt.schuetzen !== 'alles' ? (
            <p className="zentrale-hinweis">
              Schützen ohne Stand sehen bei dieser Stufe nichts.
              {angezeigt.gruppenleiter === 'alles' ? ' Gruppenleiter sehen weiter alles.' : ''}
            </p>
          ) : null}
        </div>
      )}

      {fehler ? (
        <p className="zentrale-inspektor-fehler" role="alert">
          {fehler}
        </p>
      ) : null}
    </section>
  )
}
