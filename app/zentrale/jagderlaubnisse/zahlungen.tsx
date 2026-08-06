'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../schreiben'
import {
  alsDatum,
  alsEuro,
  betragAlsZahl,
  betragFehler,
  letzteZahlung,
  zahlungenSumme,
  type Zahlung,
} from './scheine'

/**
 * Das Zahlungsjournal eines Begehungsscheins (Migration 109).
 *
 * **Wofür.** Moritz, 05.08.2026: „wenn der aussteller das geld erhalten hat für
 * den begehungsschein kann er den zahlungseingang bestätigen." Eine Zeile je
 * Eingang, weil `entgelt_intervall` aus 105 wiederkehrende Zahlungen kennt —
 * bei „jährlich" gibt es nicht *einen* Zahlungseingang, sondern jedes Jahr
 * einen.
 *
 * **Eigene Datei, obwohl es in `formular.tsx` passen würde.** Die Datei hat
 * 1004 Zeilen und trägt zwei Compare-and-Swap-Pfade; jede Zeile darin ist eine
 * Zeile, die beim nächsten Konflikt mitgelesen werden muss. Der Zahlungspfad
 * hat mit dem Schein-Update nichts gemeinsam — er schreibt in eine andere
 * Tabelle, kennt keinen Vergleichsstand und kann nicht kollidieren.
 *
 * **Kein Compare-and-Swap, und das ist der Unterschied zum Schein.** Dort
 * ändern zwei Menschen dieselbe Zeile; hier legt jeder eine eigene an. Zwei
 * gleichzeitig eingetragene Zahlungen sind zwei Zahlungen, kein Konflikt — und
 * zwei gleiche Beträge am selben Tag sind legitim (Anzahlung und Rest). Ein
 * Dedup-Riegel wäre hier falsch.
 *
 * **Was RLS tut (109):** schreiben darf nur der Revierbesitzer, lesen
 * zusätzlich der Scheininhaber. Diese Seite zeigt ohnehin nur eigene Reviere,
 * die Policy ist also nicht die Anzeigegrenze, sondern das Netz darunter —
 * dieselbe Lage wie bei 079 in `page.tsx`.
 */
export default function Zahlungen({
  scheinId,
  zahlungen,
  heute,
}: {
  scheinId: string
  zahlungen: Zahlung[]
  /** Der Tag vom SERVER, wie überall auf dieser Seite (`heuteUtc()`).
   *
   *  **Benannter Randfall:** der Container läuft auf UTC, Berlin ist ihm ein
   *  bis zwei Stunden voraus. Zwischen Mitternacht und 01:00 (Winter) bzw.
   *  02:00 (Sommer) Ortszeit schlägt das Feld deshalb den Vortag vor. Das ist
   *  hingenommen und kein Fehler: 109 hat bewusst keinen Riegel auf
   *  `erhalten_am`, das Feld ist frei änderbar, und ein im Browser bestimmtes
   *  Datum brächte ein Hydration-Mismatch für einen Fall, der zwei Stunden am
   *  Tag betrifft. */
  heute: string
}) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [betrag, setBetrag] = useState('')
  const [datum, setDatum] = useState(heute)
  const [notiz, setNotiz] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  // Ref, nicht State: ein State-Riegel wird erst nach dem Rendern wirksam, zwei
  // schnelle Tipps kommen beide durch. Dieselbe Bauform wie in `formular.tsx`
  // und der Befund, der 088 an `handleDecline` gefunden hat.
  const inArbeit = useRef(false)
  // **Die id kommt vom Client, damit ein Wiederholungsversuch keine zweite
  // Zahlung anlegt** (Fremdpruefung 06.08.2026, [high]). Der Fall: Postgres
  // committet den INSERT, die Antwort geht auf dem Rueckweg verloren, der Code
  // landet im Fehlerpfad und behaelt die Eingabe. Wer dann noch einmal tippt,
  // haette bisher eine zweite Zeile bekommen — und die Summe wiese unbemerkt zu
  // viel aus. Mit fester id prallt der zweite Versuch am Primaerschluessel ab
  // (`23505`), und der Nutzer bekommt gesagt, dass die Zahlung schon steht.
  // Erst nach einem BESTAETIGTEN Erfolg wird eine neue id gezogen.
  const entwurfId = useRef(crypto.randomUUID())

  const summe = zahlungenSumme(zahlungen)
  const letzte = letzteZahlung(zahlungen)

  async function eintragen() {
    if (inArbeit.current) return
    const text = betragFehler(betrag)
    if (text) return setFehler(text)
    const zahl = betragAlsZahl(betrag)
    if (zahl === null) return setFehler('Der Betrag fehlt.')
    // Sonst prallte „0" erst am DB-CHECK `betrag > 0` ab, und der Nutzer läse
    // den rohen Constraint-Namen statt eines Satzes (Schlusslesung 06.08.2026).
    if (zahl <= 0) return setFehler('Der Betrag muss größer als null sein.')
    if (!datum) return setFehler('Das Datum des Eingangs fehlt.')

    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      // `.select()` ist Pflicht — ohne es meldet `schreibe()` jeden Write als
      // Fehlschlag, und ein RLS-gefilterter 0-Zeilen-Write wäre von einem
      // Erfolg nicht zu unterscheiden.
      await schreibe('Zahlung', () =>
        createClient()
          .from('schein_zahlungen')
          .insert({
            id: entwurfId.current,
            hunting_license_id: scheinId,
            betrag: zahl,
            erhalten_am: datum,
            notiz: notiz.trim() || null,
          })
          .select('id'),
      )
      entwurfId.current = crypto.randomUUID()
      setBetrag('')
      setNotiz('')
      setDatum(heute)
      setOffen(false)
      router.refresh()
    } catch (e) {
      const text = e instanceof Error ? e.message : ''
      // `23505` heisst hier NICHT „schon jemand anders", sondern „dein eigener
      // erster Versuch ist doch angekommen". Die Eingabe bleibt trotzdem
      // stehen, damit niemand sie neu tippt, falls die Meldung irrt.
      // **Nur auf `duplicate key`, nicht auf den SQLSTATE `23505`:** PostgREST
      // führt den Code in einem eigenen Feld, und `schreibe()` reicht allein
      // die Message durch — eine Prüfung auf „23505" wäre toter Code
      // (Schlusslesung 06.08.2026, sie stand hier eine Fassung lang).
      // Falsch-positiv ausgeschlossen: 109 hat als einzigen Unique-Constraint
      // den Primärschlüssel, und dessen Wert erzeugt nur dieser Client.
      setFehler(
        text.includes('duplicate key')
          ? 'Diese Zahlung steht bereits — der erste Versuch war doch erfolgreich. Lade die Seite neu.'
          : text || 'Die Zahlung konnte nicht eingetragen werden.',
      )
    } finally {
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  async function loeschen(z: Zahlung) {
    if (inArbeit.current) return
    // Rückfrage vor dem Löschen: die Zeile ist nicht wiederherstellbar, und
    // 109 legt bewusst keinen Papierkorb an. Der Betrag steht im Text, damit
    // die Frage beantwortbar ist, ohne dahinter zu schauen.
    const euro = alsEuro(z.betrag) ?? 'diese Zahlung'
    if (!confirm(`${euro} vom ${alsDatum(z.erhalten_am)} löschen? Das lässt sich nicht rückgängig machen.`)) {
      return
    }
    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await schreibe('Zahlung', () =>
        createClient().from('schein_zahlungen').delete().eq('id', z.id).select('id'),
      )
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Zahlung konnte nicht gelöscht werden.')
    } finally {
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  return (
    <div className="jes-zahlungen">
      <p className="jes-zahlungen-summe">
        {summe === null ? (
          zahlungen.length > 0 ? (
            // `zahlungenSumme` liefert `null`, wenn EINE Zeile unlesbar ist —
            // lieber keine Zahl als eine falsche. Dann muss dastehen, dass es
            // Zahlungen gibt, sonst liest sich der Fehler als „nichts gezahlt".
            <span className="jes-fehlt">
              {zahlungen.length} Zahlungen erfasst — die Summe ist nicht bestimmbar
            </span>
          ) : (
            <span className="jes-fehlt">Noch kein Zahlungseingang erfasst</span>
          )
        ) : (
          <>
            <strong>{alsEuro(summe)}</strong> eingegangen
            {letzte ? ` · zuletzt am ${alsDatum(letzte)}` : null}
          </>
        )}
      </p>

      {zahlungen.length > 0 ? (
        <ul className="jes-zahlungen-liste">
          {zahlungen.map((z) => (
            <li key={z.id}>
              <span className="bet">{alsEuro(z.betrag) ?? <span className="jes-fehlt">unlesbar</span>}</span>
              <span className="dat">{alsDatum(z.erhalten_am)}</span>
              {z.notiz ? <span className="not">{z.notiz}</span> : null}
              <button type="button" onClick={() => loeschen(z)} disabled={laeuft}>
                Löschen
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Eine Stelle fuer den Fehler, nicht je Zweig eine: der Text ueberlebt
          damit auch das Zuklappen des Formulars. */}
      {fehler ? <p className="jes-fehler">{fehler}</p> : null}

      {offen ? (
        <div className="jes-zahlungen-formular">
          <div className="jes-feld">
            <label htmlFor={`zahlung-betrag-${scheinId}`}>Betrag</label>
            <input
              id={`zahlung-betrag-${scheinId}`}
              type="text"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              placeholder="500 oder 1.500,50"
              inputMode="decimal"
              autoFocus
            />
          </div>
          <div className="jes-feld">
            <label htmlFor={`zahlung-datum-${scheinId}`}>Eingegangen am</label>
            <input
              id={`zahlung-datum-${scheinId}`}
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </div>
          {/* **Die Warnung steht IN der Beschriftung, nicht darunter**
              (Fremdpruefung 06.08.2026): ein Hinweis hinter dem Feld wird auf
              einem schmalen Bildschirm und mit Vorlesesoftware erst gelesen,
              wenn der Vermerk schon getippt ist. Der Scheininhaber liest die
              Zeile ueber `schein_zahlungen_select` mit — die Notiz ist KEIN
              interner Vermerk, und das muss dastehen, bevor jemand tippt. */}
          <div className="jes-feld">
            <label htmlFor={`zahlung-notiz-${scheinId}`}>
              Notiz — für den Scheininhaber sichtbar
            </label>
            <input
              id={`zahlung-notiz-${scheinId}`}
              type="text"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="optional"
            />
          </div>
          <div className="jes-zahlungen-knoepfe">
            <button type="button" className="haupt" onClick={eintragen} disabled={laeuft}>
              {laeuft ? 'Wird eingetragen …' : 'Eintragen'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOffen(false)
                setFehler(null)
              }}
              disabled={laeuft}
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            // **Der Tag wird beim OEFFNEN gesetzt, nicht nur beim Mount**
            // (Fremdpruefung 06.08.2026): eine Seite, die ueber Mitternacht
            // offen bleibt, behielte sonst den State von gestern und buchte
            // weitere Eingaenge unbemerkt auf den Vortag. `heute` kommt bei
            // jedem `router.refresh()` frisch vom Server.
            setDatum(heute)
            setOffen(true)
          }}
          disabled={laeuft}
        >
          Zahlungseingang bestätigen
        </button>
      )}
    </div>
  )
}
