'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { polygonAreaHectares } from '@/lib/geo-utils'
import { useBoundaryEditor } from '@/hooks/useBoundaryEditor'
import type { KarteProps } from './revierkarte-map'
import { darfSchreiben, schreibe } from './schreiben'
import { ewktAus, nurEinRing, pruefeGrenze } from './grenze'

// react-leaflet fasst beim Import `window` an — ssr:false ist Pflicht, und
// next/dynamic mit ssr:false geht nur aus einer Client-Komponente heraus.
// Deshalb dieser dünne Mantel zwischen Server-Seite und Karte.
const Karte = dynamic(() => import('./revierkarte-map'), {
  ssr: false,
  loading: () => <div className="zentrale-karte-lade">Karte lädt …</div>,
})

/** Handler-Platzhalter, während ein Write läuft — der Entwurf bleibt sichtbar,
 *  darf sich aber nicht mehr ändern. Modulweit, damit die Referenz stabil ist. */
const nichts = () => {}

/**
 * Drei Größen, wie bei YouTube: eingebettet · Kinomodus · Vollbild.
 *
 * Vollbild über die native Fullscreen-API — ESC, Zustandsverwaltung und
 * Bildschirmgröße macht der Browser. Kinomodus ist dagegen bewusst nur eine
 * CSS-Klasse: die Karte bleibt in der Seite, wird aber deutlich höher. Leaflet
 * misst sich bei beidem über den ResizeObserver in der Karte neu.
 *
 * Dazu seit Phase 3 der Editierzustand der Reviergrenze. Er liegt hier und nicht
 * in der Karte, weil er das Speichern kennt — die Karte stellt nur dar.
 */
export default function Revierkarte({
  grenze,
  punkte,
  revierId,
}: KarteProps & { revierId: string }) {
  const kasten = useRef<HTMLDivElement>(null)
  const [voll, setVoll] = useState(false)
  const [kino, setKino] = useState(false)

  const router = useRouter()
  const zeichner = useBoundaryEditor()
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [loeschFrage, setLoeschFrage] = useState(false)

  /**
   * Was zuletzt erfolgreich geschrieben wurde — `undefined` heißt „noch nichts".
   *
   * `router.refresh()` gibt kein Promise zurück, das Nachziehen der
   * Server-Komponente ist also nicht abwartbar. Ohne diesen Zwischenspeicher
   * zeigte die `grenze`-Prop unmittelbar nach dem Speichern noch den **alten**
   * Stand: ein sofortiger Klick auf „Grenze bearbeiten" lud die alte Geometrie,
   * und das nächste „Fertig" hätte den eigenen Speichervorgang zurückgedreht.
   * Nach einem Löschen hätte derselbe Ablauf die Grenze wieder auferstehen
   * lassen. Von Codex gefunden, 27.07.2026.
   *
   * Ein Revierwechsel setzt das zurück, weil `page.tsx` die Komponente mit
   * `key={revier.id}` neu aufbaut.
   */
  const [gespeichert, setGespeichert] = useState<[number, number][][] | null | undefined>(
    undefined,
  )
  const aktuelleGrenze = gespeichert !== undefined ? gespeichert : grenze

  // Nur abonnieren, nicht ableiten: der Zustand kommt aus dem Browser, auch
  // wenn ESC das Vollbild verlässt, ohne dass der Knopf beteiligt war.
  useEffect(() => {
    const wechsel = () => setVoll(document.fullscreenElement === kasten.current)
    document.addEventListener('fullscreenchange', wechsel)
    return () => document.removeEventListener('fullscreenchange', wechsel)
  }, [])

  const umschalten = () => {
    if (voll) {
      document.exitFullscreen().catch(() => {})
    } else {
      // Kann vom Browser abgelehnt werden (Berechtigung, iframe) — dann bleibt
      // es beim eingebetteten Kasten, ohne unbehandelte Rejection.
      kasten.current?.requestFullscreen().catch(() => {})
    }
  }

  const offen = darfSchreiben(revierId)

  const starten = () => {
    // Mehrringige Grenzen kann der Zeichen-Hook nicht — er nähme nur den ersten
    // Ring und würde die Enklaven beim Speichern verlieren. Lieber ablehnen.
    if (!nurEinRing(aktuelleGrenze)) {
      setFehler(
        'Diese Grenze enthält Enklaven (mehrere Ringe). Der Editor kann bisher nur ' +
          'einen Ring und würde die Löcher beim Speichern verlieren.',
      )
      return
    }
    setFehler(null)
    setLoeschFrage(false)
    zeichner.startEditing(aktuelleGrenze)
  }

  const abbrechen = () => {
    setFehler(null)
    zeichner.stopEditing()
    zeichner.reset()
  }

  /**
   * Speichern. Zwei Dinge bewusst anders als im mobilen Pfad:
   * - Vorher prüfen (Punktzahl, Selbstüberschneidung), statt PostGIS ein kaputtes
   *   Polygon zu geben.
   * - Bei Fehler **bleibt der Entwurf stehen** (Backlog E-R2). Im mobilen Pfad
   *   wird er verworfen und die gezeichnete Grenze ist weg.
   *
   * **`area_ha` wird nicht geschrieben und darf es nicht.** Die Spalte ist
   * `GENERATED ALWAYS AS (st_area(boundary::geography) / 10000)` — Postgres
   * lehnt jeden Schreibversuch mit
   * `column "area_ha" can only be updated to DEFAULT` ab. Die Fläche rechnet
   * damit die DB, geodätisch und immer passend zur Grenze; veralten kann sie
   * nicht. Der Client-Helfer `polygonAreaHectares` rechnet auf der Kugel und
   * liegt konstant 0,41 % darunter — er ist deshalb nur für die laufende Anzeige
   * im Entwurf gut, nie für einen Schreibwert.
   */
  const speichern = async () => {
    const problem = pruefeGrenze(zeichner.drawPoints)
    if (problem) {
      setFehler(problem)
      return
    }

    setLaeuft(true)
    setFehler(null)
    try {
      const ewkt = ewktAus(zeichner.drawPoints)
      await schreibe(revierId, 'Reviergrenze', () =>
        createClient()
          .from('districts')
          .update({ boundary: ewkt })
          .eq('id', revierId)
          .select('id, area_ha'),
      )
      // Erst den Zwischenspeicher setzen, dann zurücksetzen: ab hier ist die neue
      // Grenze die Wahrheit, auch wenn die Server-Komponente noch nachzieht.
      const ring = [...zeichner.drawPoints, zeichner.drawPoints[0]].map(
        (p) => [p.lat, p.lng] as [number, number],
      )
      setGespeichert([ring])
      zeichner.stopEditing()
      zeichner.reset()
      // Die Kennzahlen kommen aus der Server-Komponente — die muss nachrechnen,
      // insbesondere `area_ha`, das die DB selbst erzeugt.
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Speichern.')
    } finally {
      setLaeuft(false)
    }
  }

  /**
   * Löschen mit Rückfrage — im mobilen Pfad genügt ein Druck (Backlog E-R3).
   *
   * Nur `boundary`, nicht `area_ha`: die Spalte ist generiert und fällt von
   * selbst auf NULL, wenn die Grenze weg ist. Der mobile Pfad setzt hier
   * zusätzlich `area_ha: null` und **scheitert deshalb immer** — siehe Backlog.
   */
  const loeschen = async () => {
    setLaeuft(true)
    setFehler(null)
    try {
      await schreibe(revierId, 'Reviergrenze', () =>
        createClient()
          .from('districts')
          .update({ boundary: null })
          .eq('id', revierId)
          .select('id, area_ha'),
      )
      setGespeichert(null)
      setLoeschFrage(false)
      zeichner.stopEditing()
      zeichner.reset()
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Löschen.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div ref={kasten} className={`zentrale-karte-kasten${kino ? ' kino' : ''}`}>
      <div className="zentrale-karte-knoepfe">
        {offen && !zeichner.editMode && (
          <button type="button" onClick={starten} disabled={laeuft}>
            {aktuelleGrenze ? 'Grenze bearbeiten' : 'Grenze zeichnen'}
          </button>
        )}

        {offen && zeichner.editMode && (
          <>
            <button type="button" onClick={speichern} disabled={laeuft}>
              {laeuft ? 'Speichert …' : 'Fertig'}
            </button>
            <button type="button" onClick={zeichner.undo} disabled={laeuft || !zeichner.drawPoints.length}>
              Punkt zurück
            </button>
            <button type="button" onClick={abbrechen} disabled={laeuft}>
              Abbrechen
            </button>
          </>
        )}

        {offen && !zeichner.editMode && aktuelleGrenze && !loeschFrage && (
          <button type="button" onClick={() => setLoeschFrage(true)} disabled={laeuft}>
            Grenze löschen
          </button>
        )}
        {offen && !zeichner.editMode && aktuelleGrenze && loeschFrage && (
          <>
            <button type="button" onClick={loeschen} disabled={laeuft}>
              {laeuft ? 'Löscht …' : 'Wirklich löschen'}
            </button>
            <button type="button" onClick={() => setLoeschFrage(false)} disabled={laeuft}>
              Behalten
            </button>
          </>
        )}

        {/* Im Vollbild sinnlos — die Zwischengröße ist dort keine Größe mehr. */}
        {!voll && (
          <button type="button" onClick={() => setKino((k) => !k)}>
            {kino ? 'Kleiner' : 'Kinomodus'}
          </button>
        )}
        <button type="button" onClick={umschalten}>
          {voll ? 'Vollbild beenden' : 'Vollbild'}
        </button>
      </div>

      {zeichner.editMode && (
        <p className="zentrale-karte-hinweis">
          In die Karte klicken setzt Punkte · Punkte ziehen verschiebt sie · kleine
          Punkte dazwischen fügen ein · Klick auf einen Punkt löscht ihn (ab 4)
          {/* „≈", weil der Client-Helfer auf der Kugel rechnet und rund 0,4 %
              unter dem geodätischen Wert liegt, den die generierte Spalte
              `area_ha` nach dem Speichern anzeigt. Ohne das Zeichen sähe der
              kleine Sprung beim Speichern wie ein Fehler aus. Genauer geht am
              Entwurf nicht — die DB kennt ein ungespeichertes Polygon nicht. */}
          {zeichner.drawPoints.length >= 3 &&
            ` · ≈ ${polygonAreaHectares(zeichner.drawPoints).toFixed(1)} ha`}
        </p>
      )}

      {fehler && (
        <p className="zentrale-karte-fehler" role="alert">
          {fehler}
        </p>
      )}

      <Karte
        grenze={aktuelleGrenze}
        punkte={punkte}
        zeichnen={
          zeichner.editMode
            ? {
                punkte: zeichner.drawPoints,
                // Während eines laufenden Writes bleibt der Entwurf sichtbar, ist
                // aber eingefroren. `laeuft` sperrte vorher nur die Knöpfe: wer bei
                // langsamer Verbindung nach „Fertig" noch einen Punkt zog, sah
                // seine Änderung anschließend kommentarlos verschwinden, weil das
                // EWKT den Stand von vorher trug und danach alles zurückgesetzt
                // wurde. Von Codex gefunden, 27.07.2026.
                aufKlick: laeuft ? nichts : zeichner.addPoint,
                aufZug: laeuft ? nichts : zeichner.dragVertex,
                aufLoeschen: laeuft ? nichts : zeichner.deleteVertex,
                aufEinfuegen: laeuft ? nichts : zeichner.insertMidpoint,
              }
            : undefined
        }
      />
    </div>
  )
}
