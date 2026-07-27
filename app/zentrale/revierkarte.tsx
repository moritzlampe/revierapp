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
    if (!nurEinRing(grenze)) {
      setFehler(
        'Diese Grenze enthält Enklaven (mehrere Ringe). Der Editor kann bisher nur ' +
          'einen Ring und würde die Löcher beim Speichern verlieren.',
      )
      return
    }
    setFehler(null)
    setLoeschFrage(false)
    zeichner.startEditing(grenze)
  }

  const abbrechen = () => {
    setFehler(null)
    zeichner.stopEditing()
    zeichner.reset()
  }

  /**
   * Speichern. Drei Dinge bewusst anders als im mobilen Pfad:
   * - Vorher prüfen (Punktzahl, Selbstüberschneidung), statt PostGIS ein kaputtes
   *   Polygon zu geben.
   * - `area_ha` mitschreiben. Kein Trigger rechnet sie, und **kein lebender
   *   Codepfad** setzt sie beim Speichern — auch der Setup-Flow schreibt nur
   *   `boundary`. Ohne diese Zeile zeigt die Kennzahl „Fläche" nach dem ersten
   *   Bearbeiten dauerhaft die alte Zahl.
   *
   *   Achtung, gemessen am 27.07.2026: `polygonAreaHectares` rechnet auf der
   *   Kugel (R = 6371 km), PostGIS `::geography` auf dem WGS84-Ellipsoid. Bei
   *   53° N ergibt das konstant **−0,41 %** — über alle sieben echten Reviere
   *   gleich, von 38 bis 1.404 ha. Die heute gespeicherten Werte stammen aus
   *   einem serverseitigen Backfill und liegen deshalb 0,41 % höher als das, was
   *   jeder Bildschirm der App anzeigt. Beim ersten Bearbeiten rückt die Spalte
   *   also auf den App-Wert (Brockwinel 105,8 → 105,3). Bewusst so: die Spalte
   *   soll mit der App übereinstimmen, nicht mit einem Backfill, den kein
   *   Codepfad pflegt. Sauber wäre eine berechnete Spalte in der DB — das ist
   *   DDL und damit nativer Track (R2).
   * - Bei Fehler **bleibt der Entwurf stehen** (Backlog E-R2). Im mobilen Pfad
   *   wird er verworfen und die gezeichnete Grenze ist weg.
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
      const ha = Math.round(polygonAreaHectares(zeichner.drawPoints) * 10) / 10
      await schreibe(revierId, 'Reviergrenze', () =>
        createClient()
          .from('districts')
          .update({ boundary: ewkt, area_ha: ha })
          .eq('id', revierId)
          .select('id'),
      )
      zeichner.stopEditing()
      zeichner.reset()
      // Die Zahlen und die Grenze kommen aus der Server-Komponente — sie neu
      // rechnen zu lassen ist billiger und ehrlicher, als hier einen zweiten
      // Zustand mitzuführen, der auseinanderlaufen kann.
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Speichern.')
    } finally {
      setLaeuft(false)
    }
  }

  /** Löschen mit Rückfrage — im mobilen Pfad genügt ein Druck (Backlog E-R3). */
  const loeschen = async () => {
    setLaeuft(true)
    setFehler(null)
    try {
      await schreibe(revierId, 'Reviergrenze', () =>
        createClient()
          .from('districts')
          .update({ boundary: null, area_ha: null })
          .eq('id', revierId)
          .select('id'),
      )
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
            {grenze ? 'Grenze bearbeiten' : 'Grenze zeichnen'}
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

        {offen && !zeichner.editMode && grenze && !loeschFrage && (
          <button type="button" onClick={() => setLoeschFrage(true)} disabled={laeuft}>
            Grenze löschen
          </button>
        )}
        {offen && !zeichner.editMode && grenze && loeschFrage && (
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
          {zeichner.drawPoints.length >= 3 &&
            ` · ${polygonAreaHectares(zeichner.drawPoints).toFixed(1)} ha`}
        </p>
      )}

      {fehler && (
        <p className="zentrale-karte-fehler" role="alert">
          {fehler}
        </p>
      )}

      <Karte
        grenze={grenze}
        punkte={punkte}
        zeichnen={
          zeichner.editMode
            ? {
                punkte: zeichner.drawPoints,
                aufKlick: zeichner.addPoint,
                aufZug: zeichner.dragVertex,
                aufLoeschen: zeichner.deleteVertex,
                aufEinfuegen: zeichner.insertMidpoint,
              }
            : undefined
        }
      />
    </div>
  )
}
