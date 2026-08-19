'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  TileLayer,
  Polygon,
  Rectangle,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { BKG_TOPPLUS } from '@/lib/map/tiles'
import BoundaryDrawLayer from '@/components/map/BoundaryDrawLayer'
import type { DrawPoint } from '@/hooks/useBoundaryEditor'
import { istStand, type Ort } from './objekte'

/**
 * Ein Kartenobjekt, so wie der Browser es braucht. Heißt weiter `Punkt`, weil es
 * auf der Karte einer ist — trägt seit Schritt 3 aber alles, was der Inspektor
 * anzeigt, damit es keine zweite Ladung und keine Parallelliste braucht.
 */
export type Punkt = {
  id: string
  name: string
  typ: string
  lat: number
  lng: number
  beschreibung: string | null
  fotoUrl: string | null
}

export type KarteProps = {
  /** Reviergrenze als Leaflet-Ringe ([lat,lng][]), serverseitig geparst. */
  grenze: [number, number][][] | null
  punkte: Punkt[]
}

/**
 * Zeichenzustand, wenn die Grenze bearbeitet wird. Kommt aus `revierkarte.tsx`
 * — die Karte hält keinen eigenen Editierzustand, sie stellt ihn nur dar.
 */
export type ZeichenProps = {
  punkte: DrawPoint[]
  aufKlick: (p: DrawPoint) => void
  aufZug: (index: number, p: DrawPoint) => void
  aufLoeschen: (index: number) => void
  aufEinfuegen: (nachIndex: number, p: DrawPoint) => void
}

/**
 * Setzmodus für eine Objektposition (Schritt 3b) — Verschieben und Anlegen
 * benutzen denselben.
 *
 * Auch dieser Zustand liegt in `revierkarte.tsx`: die Karte nimmt den Klick auf
 * und zeichnet, was sie bekommt. Sie weiß nicht, ob daraus ein UPDATE oder ein
 * INSERT wird, und soll es nicht wissen.
 */
export type SetzProps = {
  /** Die noch nicht gespeicherte Position, oder `null` vor dem ersten Klick. */
  kandidat: Ort | null
  /** Woher das Objekt kommt — nur beim Verschieben, beim Anlegen `null`. */
  ursprung: Ort | null
  aufOrt: (ort: Ort) => void
}

/**
 * Rechteckauswahl für Standgruppen (C-45, 18.08.2026).
 *
 * **Kein eigener Modus, und das ist Moritz' Entscheidung vom 19.08.2026**
 * (*„kann man nicht einfach wenn man die stände anklickt zum auswählen auch
 * ermöglichen da einfach ein rechteck zu ziehen? kein extra modus dafür"*).
 * Der erste Entwurf hatte einen Knopf „Rechteck wählen" samt Zustand — und
 * damit einen weiteren Riegel, der beim nächsten Umbau hätte mitwandern
 * müssen. Sieben davon sind am 18.08.2026 nicht mitgewandert. Die Geste hängt
 * jetzt an derselben Bedingung wie der Klick, den sie ergänzt: kein Zustand,
 * kein Knopf, keine zweite Wahrheit darüber, was die Karte gerade tut.
 *
 * **Unterschieden wird an einer Pixelschwelle, nicht an einem Schalter:** ein
 * Tipp bleibt ein Tipp (der Marker schaltet seine Mitgliedschaft um), ein Zug
 * wird ein Rechteck. Genau diese Schwelle ist zugleich der Riegel gegen die
 * doppelte Wirkung — ohne sie erzeugte jeder Klick ein Rechteck ohne Fläche.
 *
 * **Gemeldet werden die beiden ECKEN des Zugs, nicht eine fertige Menge.** Die
 * Karte weiß nicht, welcher Punkt ein wählbarer Stand ist (ein Parkplatz ist
 * einer, ein Papierkorb-Objekt nicht) — und sie soll es nicht wissen. Wer
 * drinliegt, rechnet `imRechteck()` beim Aufrufer, wo `waehlbar` ohnehin liegt
 * und wo ein Selbsttest hinsieht.
 */

/**
 * Ab wie vielen Pixeln aus einem Tipp ein Zug wird.
 *
 * Dieselbe Größenordnung wie Leaflets eigener `Draggable` (3 px). Darunter
 * bleibt das Ereignis ein Klick und der Marker schaltet um; darüber entsteht
 * ein Rechteck.
 *
 * **Was ohne die Schwelle geschähe, stand hier zuerst falsch** (Schlusslesung
 * 19.08.2026, F7). Behauptet war „derselbe Tipp hätte zwei Wirkungen — der
 * Marker nähme den Stand heraus, das Rechteck legte ihn zurück". Tatsächlich
 * feuert `pointerup` VOR `click`: ohne Schwelle setzte jeder Tipp `gezogen`,
 * der Klick-Riegel verschluckte den Markerklick, und ein Tipp könnte nur noch
 * HINZUFÜGEN — abwählen ginge nie wieder. Die Schwelle ist also nötiger, als
 * die alte Begründung sagte, und aus einem anderen Grund.
 */
const ZUG_SCHWELLE = 4

const ACCENT = '#4A5A2A'
const NEUTRAL = '#8B8775'
/** Bronze aus den Design Locks. Bewusst nicht der Grün-Akzent: „ausgewählt" soll
 *  sich von „ist ein Sitz" unterscheiden lassen, nicht mit ihm verschwimmen. */
const BRONZE = '#C08E48'

/**
 * Forest aus den Design Locks — die Standgruppe (18.08.2026).
 *
 * **Bewusst nicht Bronze:** die trägt bereits die Einzelauswahl des
 * Inspektors, und beide nebeneinander müssen unterscheidbar bleiben. Heller als
 * `ACCENT`, damit ein Gruppenstand sich von der normalen Sitzfüllung abhebt,
 * ohne die Karte umzufärben.
 */
const FOREST = '#6E8A52'

/**
 * Wie stark alles zurücktritt, was NICHT zur gezeigten Standgruppe gehört.
 *
 * **Abblenden statt ausblenden**, und das ist der Punkt: im Bearbeiten-Modus
 * muss man die übrigen Stände noch sehen, um sie hinzuzufügen. Ein Stand, den
 * die Anzeige versteckt, ist einer, den niemand in die Gruppe holen kann.
 */
const GEDIMMT = 0.25

/**
 * Ab dieser Zoomstufe stehen die Namen dauerhaft an den Punkten, darunter nur
 * beim Überfahren. Grund: Revier Söder hat 196 Objekte — dauerhaft beschriftet
 * wäre die Übersicht ein Schrifthaufen, in dem nichts mehr lesbar ist.
 * ponytail: Schwelle nach Augenmaß gesetzt. Hier drehen, wenn es zu dicht oder
 * zu spät wirkt — 15 zeigt früher, 17 später.
 */
const NAMEN_AB_ZOOM = 16

/**
 * Ausschnitt auf den vorhandenen Bestand legen, und Leaflet neu vermessen,
 * sobald sich der Container ändert.
 *
 * Bewusst ein ResizeObserver statt des sonst üblichen `useInvalidateOnResize`
 * (window-resize): die Karte ändert ihre Größe hier auch ohne Fensteränderung.
 * Der Kinomodus schaltet nur eine CSS-Höhe um, und Vollbild hängt am Element,
 * nicht am Fenster — bei beidem feuert kein resize. Leaflet würde in den alten
 * Ausmaßen weiterrendern (graue Streifen am Rand). Ein Observer deckt alle drei
 * Fälle ab, inklusive Fensteränderung, und ist damit weniger, nicht mehr Code.
 */
function Ausschnitt({
  grenze,
  punkte,
  randRechts,
}: KarteProps & { randRechts: number }) {
  const map = useMap()
  const hatGefittet = useRef(false)

  useEffect(() => {
    const beobachter = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    beobachter.observe(map.getContainer())
    return () => beobachter.disconnect()
  }, [map])

  useEffect(() => {
    map.invalidateSize()

    // **Genau einmal fitten, danach nie wieder.**
    //
    // Vorher stand hier eine Signatur aus allen sortierten Koordinaten, die neu
    // fittete, sobald sich eine Lage geändert hatte. Das war für Schritt 3a
    // richtig (Umbenennen darf den Zoom nicht zurücksetzen), fiel mit Schritt 3b
    // aber zwangsläufig um: Verschieben und Anlegen ÄNDERN eine Lage, die
    // Signatur wechselt also immer, und der Zoom des Nutzers wäre nach jedem
    // gesetzten Punkt auf das ganze Revier zurückgesprungen — mitten aus der
    // Arbeit heraus, für die er hineingezoomt hat.
    //
    // Ein Zähler statt einer Signatur ist möglich, weil ein Revierwechsel diese
    // Komponente ohnehin neu aufbaut: `page.tsx` gibt der Karte `key={revier.id}`.
    // „Einmal pro Revier" und „einmal pro Montage" sind damit dasselbe, und der
    // ganze Sortier- und Vergleichsapparat fällt weg.
    if (hatGefittet.current) return

    // Grenze UND Objekte: Stände können außerhalb der gezeichneten Grenze
    // liegen (nicht jedes Revier ist sauber vermessen) und wären sonst
    // beim ersten Blick nicht im Bild.
    const ecken: [number, number][] = [
      ...(grenze?.flat() ?? []),
      ...punkte.map((p) => [p.lat, p.lng] as [number, number]),
    ]
    // Noch nichts da heißt noch nicht gefittet: der erste Lauf kann vor den
    // Daten kommen, und dann muss der nächste ihn nachholen.
    if (ecken.length === 0) return
    hatGefittet.current = true

    // Rechts so viel aussparen, wie die Objektspalte überdeckt. Sie liegt seit
    // dem 28.07.2026 ÜBER der Karte statt neben ihr — der Kartencontainer reicht
    // also unter sie, und ohne diesen Zuschlag landete bei Söder ein gutes
    // Sechstel der Stände hinter dem Panel.
    //
    // Gedeckelt, damit immer ein nutzbarer Streifen übrig bleibt: wäre das
    // Padding breiter als der Container, rechnete Leaflet mit einer negativen
    // Fläche und fitBounds könnte mit nicht-endlichen Werten scheitern (Codex,
    // 28.07.2026). Der Aufrufer begrenzt schon, das hier ist der Riegel an der
    // Stelle, an der es tatsächlich bräche.
    const rand = Math.max(0, Math.min(randRechts, map.getSize().x - 80))
    map.fitBounds(L.latLngBounds(ecken), {
      paddingTopLeft: [24, 24],
      paddingBottomRight: [24 + rand, 24],
    })
  }, [map, grenze, punkte, randRechts])
  return null
}

/**
 * Der Setzmodus: ein Kartenklick wird zur Position, nicht zur Auswahl.
 *
 * Eigene Komponente aus demselben Grund wie `Objekte` — `useMapEvents` braucht
 * den Kartenkontext, und den gibt es erst unterhalb von `MapContainer`.
 *
 * Der Ursprung bleibt beim Verschieben blass stehen. Ohne ihn wüsste niemand
 * mehr, wo das Objekt herkam, und „Abbrechen" wäre ein Sprung ins Dunkle.
 */
function SetzLage({
  kandidat,
  ursprung,
  aufOrt,
}: {
  kandidat: Ort | null
  ursprung: Ort | null
  aufOrt: (ort: Ort) => void
}) {
  // Bewusst NICHT gewickelt: der Kandidat soll genau dort erscheinen, wo
  // geklickt wurde. Den Bereich richtet `pruefeOrt` erst beim Schreiben, und nur
  // dann, wenn die Karte tatsächlich eine Weltumrundung hinter sich hat.
  useMapEvents({ click: (e) => aufOrt({ lat: e.latlng.lat, lng: e.latlng.lng }) })

  return (
    <>
      {ursprung && (
        <CircleMarker
          center={[ursprung.lat, ursprung.lng]}
          radius={7}
          interactive={false}
          pathOptions={{ color: NEUTRAL, weight: 1.5, dashArray: '3 3', fill: false }}
        />
      )}
      {kandidat && (
        <CircleMarker
          center={[kandidat.lat, kandidat.lng]}
          radius={8}
          interactive={false}
          pathOptions={{
            color: '#FFFFFF',
            weight: 2,
            fillColor: BRONZE,
            fillOpacity: 1,
          }}
        />
      )}
    </>
  )
}

/**
 * Der Zug, aus dem ein Rechteck wird — die zweite Hälfte von C-45.
 *
 * **Gehorcht dem Container, nicht der Karte, und das ist der tragende Befund
 * des Recon.** Ein `useMapEvents({ mousedown })` hätte hier ein Loch: Leaflet
 * gibt ein Kartenereignis nur weiter, wenn kein interaktiver Layer getroffen
 * wurde — bei Söder liegen 196 CircleMarker im Weg, und ein Zug, der auf einem
 * Stand beginnt (also der Normalfall, wenn man eine Traube einrahmt), käme nie
 * an. Leaflets eigener `Map.BoxZoom` hängt aus genau diesem Grund am Container
 * (`map._container`), und diese Komponente ist sein Nachbau ohne das
 * abschließende `fitBounds`.
 *
 * **Ziehen verschiebt die Karte nicht mehr, solange dieser Layer steht** —
 * dieselbe Geste kann nicht zwei Dinge tun. Der Preis ist benannt und von
 * Moritz am 19.08.2026 angenommen; er trägt, weil das Mausrad bei Leaflet
 * **auf den Zeiger** zoomt und damit das Schwenken ersetzt, und weil der Layer
 * nur während „Stände bearbeiten" existiert. `boxZoom` geht mit aus: sonst
 * zöge Shift+Ziehen gleichzeitig ein Auswahlrechteck und eine Zoombox.
 *
 * **Beide Handler werden nur zurückgegeben, wie sie vorgefunden wurden.** Ein
 * bedingungsloses `enable()` im Aufräumen wäre der Fall, den dieses Repo am
 * 18.08.2026 siebenmal hatte: ein Riegel, der beim Umzug nicht mitwandert —
 * nur umgekehrt, als Schalter, der etwas einschaltet, das vorher aus war.
 *
 * **Pointer- statt Mausereignisse**, anders als bei Leaflets BoxZoom (der auf
 * `e.which`/`e.button` prüft und damit reine Maus ist). Es kostet nichts und
 * lässt die Geste auf einem Zeigegerät überhaupt entstehen. **Belegt ist sie
 * dort nicht:** Leaflets eigenes CSS setzt `touch-action: pan-x pan-y` auf dem
 * Container, auf dem iPad schiebt der Browser also womöglich die Seite, statt
 * einen Zug zu liefern. Das steht als ungeprüft in der Übergabe, nicht als
 * Zusage.
 */
function RechteckWahl({ aufWahl }: { aufWahl: (a: Ort, b: Ort) => void }) {
  const map = useMap()
  const [box, setBox] = useState<[[number, number], [number, number]] | null>(null)

  /**
   * Der Rückkanal als Ref, damit der Effekt unten ihn LESEN kann, ohne auf ihn
   * zu HÖREN — dieselbe Überlegung wie bei `modusRef` im Arbeitsbereich:
   * `aufWahl` ist bei jedem Rendern eine neue Funktion. Stünde sie in den
   * Abhängigkeiten, liefe der Effekt bei jedem Tipp neu und schaltete dabei
   * `dragging` und `boxZoom` aus und wieder an — mitten im Ziehen.
   *
   * **Nachgezogen wird im Effekt, nicht beim Rendern**, obwohl der
   * Arbeitsbereich es dort tut: `react-hooks/refs` schlägt auf die
   * Zuweisung im Rumpf an, und die Regel hat recht — ein Ref, der beim Rendern
   * geschrieben wird, ist bei einem verworfenen Renderlauf schon geändert.
   *
   * **`useLayoutEffect`, nicht `useEffect`** (Fremdprüfung Codex 19.08.2026,
   * P4, `[medium]`): ein passiver Effekt läuft erst NACH dem Paint. Endet ein
   * Zug in diesem Fenster, ruft `beiLos()` noch den Rückkanal des vorigen
   * Renderns auf — mit dessen `waehltStaende` aus dem Closure. Der Modus wäre
   * dann schon zu und die Auswahl liefe trotzdem in den Entwurf. Ein
   * Layout-Effekt ist commit-synchron, das Fenster gibt es nicht mehr.
   */
  const aufWahlRef = useRef(aufWahl)
  useLayoutEffect(() => {
    aufWahlRef.current = aufWahl
  }, [aufWahl])

  // Ebenfalls commit-synchron, aus demselben Grund (Codex P4): beim Unmount
  // überlebte ein passives Cleanup den beendeten Modus um ein Paint, und der
  // Dokument-Listener wertete in diesem Fenster noch einen Zug aus.
  useLayoutEffect(() => {
    const container = map.getContainer()
    const zogVorher = map.dragging.enabled()
    const zoomteVorher = map.boxZoom.enabled()
    map.dragging.disable()
    map.boxZoom.disable()
    // Leaflets eigene Klasse — sie färbt auch `.leaflet-interactive`, der
    // Zeiger bleibt also über den Markern derselbe. Genau richtig: dort gilt
    // die Geste ebenso.
    L.DomUtil.addClass(container, 'leaflet-crosshair')

    /**
     * Wo der Zug begann — **geografisch, nicht in Containerpixeln**. `null`
     * heißt: es zieht niemand.
     *
     * **Das ist der offene Punkt der Schlusslesung** (Fable 5, 19.08.2026,
     * F8), und die Falle stammt aus dem eigenen Text: die Hinweiszeile fordert
     * den Nutzer ausdrücklich auf, in diesem Modus am Rad zu zoomen, weil das
     * Kartenziehen belegt ist. Das Rad wirkt auch MITTEN im Zug. Ein
     * Pixel-Anker zeigt danach auf einen anderen Ort — das gezeichnete
     * Rechteck (aus geo-stabilen Ecken) und das ausgewertete (aus dem alten
     * Pixel, neu projiziert) fielen auseinander, und ausgewählt würde nicht,
     * was zu sehen war.
     *
     * Pixel braucht nur die Schwelle, und die projiziert deshalb bei jedem
     * Vergleich frisch — in der Ansicht, die gerade gilt.
     */
    let start: L.LatLng | null = null
    /**
     * Welcher Zeiger zieht gerade?
     *
     * **Ohne diese Zahl übernimmt ein zweiter Finger den laufenden Zug**
     * (Fremdprüfung Codex 19.08.2026, P9, `[medium]`): jedes `pointermove`
     * würde das Rechteck bewegen, egal von welchem Gerät es kommt, und ein
     * beliebiges `pointerup` würde es auswerten. `isPrimary` hält den zweiten
     * Finger schon am Anfang draußen, die Id hält ihn während des Zugs
     * draußen — beides ist nötig, weil ein Zeiger auch nach dem Start
     * dazukommen kann.
     */
    let zeigerId: number | null = null
    /**
     * Hat DIESE Instanz Textauswahl und Bildziehen gesperrt?
     *
     * **Sonst gibt das Aufräumen etwas frei, das ein anderer gesperrt hat**
     * (Fremdprüfung Codex 19.08.2026, P1, `[low]`): `L.DomUtil` führt beide
     * Sperren global, nicht je Karte. Ein `loesen()` ohne laufenden Zug —
     * und der Cleanup ruft genau das — hätte die Sperre eines fremden
     * Leaflet-Handlers aufgehoben.
     */
    let sperrt = false
    /**
     * Ist die Schwelle überschritten? Nur für die ANZEIGE — was ausgewertet
     * wird, entscheidet `beiLos` am Loslasspunkt (Codex P7).
     */
    let ueberSchwelle = false
    /**
     * Gerade ein Rechteck fertig gezogen?
     *
     * **Der Riegel gegen die doppelte Wirkung, zweite Stufe.** Leaflet
     * unterdrückt einen Klick nach einem Zug über `dragging.moved()` — das ist
     * hier ausgeschaltet, der Klick käme also durch. Ein kleines Rechteck über
     * einem Marker hätte ihn dann per Rechteck aufgenommen und per Klick
     * gleich wieder entfernt.
     */
    let gezogen = false
    /** Frist, nach der der Klick-Riegel von selbst fällt — s. `beiLos`. */
    let riegelFrist = 0

    /**
     * Liegt der Zeiger weit genug vom Startpunkt entfernt, dass aus dem Tipp
     * ein Zug wird?
     *
     * Gerechnet wird in Containerpixeln der AKTUELLEN Ansicht: der
     * geografische Anker wird dafür jedes Mal frisch projiziert. Damit
     * überlebt die Schwelle ein Zoomen mitten im Zug — sie misst, was der
     * Nutzer sieht, nicht was er vor drei Zoomstufen sah.
     */
    function weitGenug(e: PointerEvent): boolean {
      if (!start) return false
      const hier = map.mouseEventToContainerPoint(e)
      return hier.distanceTo(map.latLngToContainerPoint(start)) >= ZUG_SCHWELLE
    }

    /**
     * Den unmittelbar folgenden Klick unterdrücken.
     *
     * **Der Riegel gilt nur für diesen einen Klick** — Leaflets eigenes Muster
     * (`Map.BoxZoom._resetStateTimeout`). Ohne die Frist bliebe das Flag
     * stehen, wenn auf das Loslassen gar kein Klick folgt (außerhalb des
     * Fensters losgelassen, Touch ohne Click), und verschluckte irgendwann
     * einen völlig unabhängigen Tipp (Schlusslesung 19.08.2026, F1).
     */
    function riegleKlick() {
      gezogen = true
      window.clearTimeout(riegelFrist)
      riegelFrist = window.setTimeout(() => {
        gezogen = false
      }, 0)
    }

    function loesen() {
      document.removeEventListener('pointermove', beiZug)
      document.removeEventListener('pointerup', beiLos)
      document.removeEventListener('pointercancel', loesen)
      document.removeEventListener('keydown', beiTaste)
      if (sperrt) {
        L.DomUtil.enableTextSelection()
        L.DomUtil.enableImageDrag()
        sperrt = false
      }
      start = null
      ueberSchwelle = false
      zeigerId = null
      setBox(null)
    }

    function beiDruck(e: PointerEvent) {
      // Nur die primäre Taste. Rechtsklick gehört dem Kontextmenü, und die
      // mittlere schiebt in manchen Browsern die Seite.
      if (e.button !== 0 || !e.isPrimary) return
      start = map.mouseEventToLatLng(e)
      ueberSchwelle = false
      zeigerId = e.pointerId
      L.DomUtil.disableTextSelection()
      L.DomUtil.disableImageDrag()
      sperrt = true
      document.addEventListener('pointermove', beiZug)
      document.addEventListener('pointerup', beiLos)
      // Ein abgebrochener Zeiger (Systemgeste, Stift abgesetzt) räumt nur auf
      // und wählt nichts — er hinterlässt sonst ein Rechteck, das niemand
      // losgelassen hat.
      document.addEventListener('pointercancel', loesen)
      document.addEventListener('keydown', beiTaste)
    }

    function beiZug(e: PointerEvent) {
      if (!start || e.pointerId !== zeigerId) return
      // Die Schwelle gilt nur für den ERSTEN Ausschlag. Danach folgt das
      // Rechteck dem Zeiger, auch wenn er wieder in die Nähe des Starts kommt —
      // sonst flackerte es beim Zurückziehen.
      if (!ueberSchwelle && weitGenug(e)) ueberSchwelle = true
      if (!ueberSchwelle) return
      const jetzt = map.mouseEventToLatLng(e)
      setBox([
        [start.lat, start.lng],
        [jetzt.lat, jetzt.lng],
      ])
    }

    function beiLos(e: PointerEvent) {
      if (e.button !== 0 || e.pointerId !== zeigerId) return
      const a = start
      // Vor `loesen()` messen: danach sind Anker und Anzeigezustand weg.
      const weit = weitGenug(e)
      const zugLief = ueberSchwelle
      loesen()
      if (!a) return

      // **Der Endpunkt kommt aus dem Loslassen, nicht aus dem letzten
      // `pointermove`** (Fremdprüfung Codex 19.08.2026, P7, `[medium]`).
      // Zwei Gründe, und der zweite ist der wichtigere:
      //
      // (1) Wer zum Schluss schnell zieht, lässt weiter außen los, als das
      //     letzte Move meldet — das ausgewertete Rechteck wäre kleiner als
      //     die gemeinte Fläche.
      // (2) Blieben Auswertung und Schwelle am Move hängen, endete ein Zug
      //     ohne zugestelltes Move jenseits der Schwelle LAUTLOS: der Nutzer
      //     zieht, lässt los, und nichts passiert. Das ist S4 in Reinform.
      //
      // `ueberSchwelle` trägt seither nur noch die ANZEIGE während des Zugs.
      //
      // **Zwei verschiedene Fälle enden hier ohne Auswahl, und der zweite ist
      // der Grund für `zugLief`** (Delta-Durchgang 19.08.2026, Punkt 4):
      //
      // (a) Es wurde nie gezogen — ein Tipp. Der gehört dem Marker darunter,
      //     der Klick muss also durch.
      // (b) Es wurde gezogen und der Zeiger kam zum Start ZURÜCK. Das ist ein
      //     Abbruch, und wer abbricht, will keine Wirkung. Ohne diese
      //     Unterscheidung schaltete der nachfolgende Klick den Stand unter
      //     dem Startpunkt um — und Züge beginnen laut Entwurf regelmäßig auf
      //     einem Stand. Ein Mitglied wäre dabei aus der Gruppe geflogen.
      if (!weit) {
        if (zugLief) riegleKlick()
        return
      }

      riegleKlick()
      const b = map.mouseEventToLatLng(e)
      aufWahlRef.current({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng })
    }

    function beiTaste(e: KeyboardEvent) {
      // Wie bei Leaflets BoxZoom: Escape nimmt den laufenden Zug zurück.
      if (e.key === 'Escape') loesen()
    }

    /**
     * Den Klick nach einem Zug abfangen.
     *
     * **Capture, nicht Bubble:** Leaflet hört den Klick am Container in der
     * Bubble-Phase; ein Capture-Listener kommt davor und kann ihn abfangen,
     * bevor daraus ein Markerklick wird.
     *
     * **Am DOKUMENT, nicht am Container — und das war der schwerste Befund des
     * Tages** (Fremdprüfung Codex 19.08.2026, P12, offener Punkt, `[medium]`).
     * Am Container hing der Riegel an einer Bedingung, die der Nutzer selbst
     * verletzt: **endet der Zug außerhalb der Karte** — über der Objektspalte,
     * über der Optionenzeile, neben dem Browserfenster —, kommt dort nie ein
     * Klick an. `gezogen` bliebe gesetzt und verschluckte den NÄCHSTEN, völlig
     * unabhängigen Klick. Der Nutzer tippt einen Stand an, und nichts passiert.
     *
     * Am Dokument wird das Flag IMMER zurückgesetzt; gestoppt wird nur, wenn
     * der Klick tatsächlich in die Karte ging.
     */
    function beiKlick(e: MouseEvent) {
      if (!gezogen) return
      gezogen = false
      if (e.target instanceof Node && container.contains(e.target)) {
        e.stopPropagation()
      }
    }

    container.addEventListener('pointerdown', beiDruck)
    document.addEventListener('click', beiKlick, true)

    return () => {
      container.removeEventListener('pointerdown', beiDruck)
      document.removeEventListener('click', beiKlick, true)
      window.clearTimeout(riegelFrist)
      loesen()
      L.DomUtil.removeClass(container, 'leaflet-crosshair')
      if (zogVorher) map.dragging.enable()
      if (zoomteVorher) map.boxZoom.enable()
    }
  }, [map])

  if (!box) return null
  return (
    <Rectangle
      bounds={box}
      // Kein Klickziel: das Rechteck entsteht während des Zugs und läge sonst
      // über den Markern, die es einsammeln soll.
      interactive={false}
      // Forest wie die Gruppenzugehörigkeit — das Rechteck sagt „diese kommen
      // hinein", nicht „diese sind ausgewählt". Gestrichelt, weil es ein
      // Entwurf ist, den das Loslassen erst wahr macht.
      pathOptions={{
        color: FOREST,
        weight: 1.5,
        dashArray: '4 4',
        fillColor: FOREST,
        fillOpacity: 0.1,
      }}
    />
  )
}

/**
 * Holt ein ausgewähltes Objekt ins Bild, wenn es gerade nicht darin ist.
 *
 * Bewusst eine Regel statt zweier Codepfade: bei einem Klick auf den Marker
 * liegt das Objekt schon im Bild, also passiert nichts. Kam die Auswahl aus der
 * Liste und liegt außerhalb, schwenkt die Karte hin — ohne den Zoom anzufassen,
 * denn die Zoomstufe hat der Nutzer selbst gewählt.
 */
function ZuAuswahl({ id, lat, lng }: { id: string | null; lat?: number; lng?: number }) {
  const map = useMap()
  // Bewusst Einzelwerte statt des Objekts als Abhängigkeit: `punkte.find(…)`
  // liefert bei jedem Rendern eine neue Referenz, der Effekt liefe also jedes
  // Mal. Wer dann bei ausgewähltem, gerade weggeschobenem Objekt irgendetwas
  // auslöst, das ein Rendern anstößt, bekäme die Karte ungefragt zurückgezogen.
  // Mit id/lat/lng feuert er genau bei echtem Auswahlwechsel.
  useEffect(() => {
    if (!id || lat === undefined || lng === undefined) return
    const wo = L.latLng(lat, lng)
    if (!map.getBounds().contains(wo)) map.panTo(wo)
  }, [map, id, lat, lng])
  return null
}

/**
 * Eigene Komponente, weil `useMapEvents` einen Kartenkontext braucht — den gibt
 * es erst unterhalb von MapContainer, nicht in RevierkarteMap selbst.
 */
function Objekte({
  punkte,
  auswahlId,
  markiert,
  gruppe,
  aufAuswahl,
}: {
  punkte: Punkt[]
  auswahlId: string | null
  /**
   * Die Standgruppen des Reviers, wenn ihr Reiter offen ist (18.08.2026).
   *
   * **Additiv neben `markiert`, nicht an dessen Stelle** — die Treiben-Karte
   * benutzt `markiert` weiterhin und bleibt unberührt. Die beiden sehen ähnlich
   * aus, meinen aber Verschiedenes: `markiert` ist eine AUSWAHL im Editor,
   * `gruppe` eine dauerhafte Zugehörigkeit, die man auch nur ansehen kann. Sie
   * schaltet deshalb keine Namensschilder ein.
   *
   * **Zwei Mengen statt einer, seit dem Reiter-Umbau** (Moritz, 18.08.2026:
   * „grundlegend alle gleichzeitig sichtbar"). Vorher zeigte die Karte genau die
   * eine angewählte Gruppe und blendete alles andere ab — bei vier Söder-Mengen
   * hätte man vier Mal umschalten müssen, um zu sehen, welcher Stand schon
   * vergeben ist.
   *
   * - `alle` — jeder Stand, der in IRGENDEINER Gruppe liegt. Leuchtet.
   * - `staende` — die angewählte Gruppe, beim Bearbeiten der Entwurf. Hebt sich
   *   zusätzlich ab, über einen eigenen Ring.
   *
   * **Zwei Stufen, keine vier Farben** (ebenfalls Moritz): bei überlappenden
   * Mengen konkurrierten sonst mehrere Farben um denselben Punkt, und ein Stand
   * in drei Gruppen hätte keine eindeutige. Die Frage „in welchen Gruppen liegt
   * dieser Stand?" beantwortet die Spalte, nicht die Karte.
   */
  gruppe?: {
    alle: ReadonlySet<string>
    staende: ReadonlySet<string>
    bearbeiten: boolean
  }
  /**
   * Mehrfachauswahl (Phase 4b): die Stände, die zu einem Treiben gehören.
   *
   * Additiv neben `auswahlId`, nicht an dessen Stelle. Die Revierkarte wählt
   * genau EIN Objekt für ihren Inspektor; die Treiben-Karte wählt eine MENGE
   * und hat keinen Inspektor. Beides in `auswahlId` zu pressen hieße, den
   * Einzelfall im Sonderfall auszudrücken — und den live genutzten Lesepfad der
   * Revierkarte für eine Seite anzufassen, die es gestern noch nicht gab.
   */
  markiert?: ReadonlySet<string>
  /** `undefined`, solange die Grenze gezeichnet wird — dann sind Klicks Punkte. */
  aufAuswahl?: (id: string) => void
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })

  const namenFest = zoom >= NAMEN_AB_ZOOM

  return (
    <>
      {punkte.map((p) => {
        const gewaehlt = p.id === auswahlId || !!markiert?.has(p.id)
        /** In der ANGEWÄHLTEN Gruppe — beim Bearbeiten: im Entwurf. */
        const inGruppe = !!gruppe?.staende.has(p.id)
        /** In irgendeiner Gruppe des Reviers. Schließt `inGruppe` ein. */
        const inIrgendeiner = inGruppe || !!gruppe?.alle.has(p.id)
        /**
         * **Abgeblendet wird nur noch beim BEARBEITEN** (Reiter-Umbau
         * 18.08.2026).
         *
         * Dort ist es weiterhin richtig und der Grund unverändert: man muss die
         * übrigen Stände sehen, um sie hinzuzufügen — ein Stand, den die Anzeige
         * versteckt, ist einer, den niemand in die Gruppe holen kann; deshalb
         * abblenden statt ausblenden.
         *
         * **Beim bloßen Ansehen NICHT, und das ist die Änderung.** Vorher trat
         * alles zurück, sobald eine Gruppe auf der Karte lag — der Revierinhaber
         * sah dann 52 leuchtende Stände in einem Revier, das zu 75 % blass war,
         * und konnte gerade die Frage nicht beantworten, für die er hinsieht:
         * welcher Stand ist noch frei? Mit `alle` leuchtet die Zugehörigkeit
         * ohnehin; das Abblenden wäre eine zweite, schwächere Aussage über
         * dieselbe Sache.
         */
        const gedimmt = !!gruppe?.bearbeiten && !inGruppe
        /**
         * Der Name des ausgewählten Objekts steht immer, auch weit herausgezoomt:
         * sonst wäre die Auswahl unter Zoom 16 nur ein Ring ohne Auskunft.
         *
         * **Gruppenmitgliedschaft zählt hier ausdrücklich NICHT** (18.08.2026).
         * Sie ist eine MENGE, keine Auswahl: bei „Sauberg" wären das 52
         * dauerhafte Namensschilder gleichzeitig, und die Karte, die diese
         * Schwelle überhaupt erst eingeführt hat (196 Objekte in Söder), wäre
         * genau dort wieder unlesbar. Das Leuchten trägt die Zugehörigkeit, der
         * Name beantwortet eine andere Frage.
         */
        const nameSteht = namenFest || gewaehlt
        return (
          <CircleMarker
            // Die Interaktivität gehört in den `key`, so unschön das aussieht.
            // Leaflet wertet `options.interactive` GENAU EINMAL aus, beim Anlegen
            // des Pfades (`SVG.js:103` ruft dann `addInteractiveTarget`), und
            // react-leaflet zieht später nur `setStyle(pathOptions)` nach
            // (`@react-leaflet/core/lib/path.js`) — `interactive` ist keine
            // Style-Eigenschaft und käme nie an. Ein bloßer Prop-Wechsel wäre
            // also wirkungslos gewesen, in beide Richtungen: beim Zeichnen
            // hätten die Marker weiter Kartenklicks geschluckt (bei Söder 196
            // Stück, es käme kein Grenzpunkt zustande), und wäre die Karte
            // während des Zeichnens erstmals aufgebaut worden, blieben die
            // Objekte danach dauerhaft unanklickbar. Der Key erzwingt den
            // Neuaufbau.
            //
            // **Er kippt seit C-43 häufiger, und das ist in Kauf genommen**
            // (Fremdprüfung Codex 18.08.2026, P4): früher nur beim Wechsel des
            // Zeichenmodus, jetzt zusätzlich beim Betreten und Verlassen des
            // Standgruppen-Reiters sowie am Anfang und Ende einer
            // Standbearbeitung. Bei Söder sind das ~196 CircleMarker samt
            // Tooltips je Wechsel.
            //
            // Getragen wird das von der Häufigkeit: alle vier sind BEWUSSTE
            // Handlungen, die ein Mensch pro Sitzung eine Handvoll Mal macht.
            // Der teure Fall war ein anderer und bleibt geschlossen — **`busy`
            // kippt den Key nicht**, ein Speichervorgang baut die Marker also
            // nicht zweimal neu auf. Genau daran ist Schnitt 1 gescheitert, und
            // deshalb sitzt der Doppelklick-Riegel in `umschalten()` statt an
            // der Prop (s. `arbeitsbereich.tsx`).
            key={`${p.id}|${aufAuswahl ? 'waehlbar' : 'starr'}`}
            center={[p.lat, p.lng]}
            radius={5}
            interactive={!!aufAuswahl}
            eventHandlers={aufAuswahl ? { click: () => aufAuswahl(p.id) } : undefined}
            pathOptions={{
              // **Nur `pathOptions`, kein wechselnder `radius`:** react-leaflet
              // zieht Style-Eigenschaften per `setStyle` nach, und darauf ist hier
              // Verlass. Ein Größenwechsel wäre eine zweite Mechanik für dasselbe
              // Ziel — Farbe und Deckkraft tragen es allein.
              // **Stufe 1 von zwei: Zugehörigkeit überhaupt.** Jeder Stand in
              // irgendeiner Gruppe bekommt den Forest-Rand; die angewählte
              // Gruppe zusätzlich mehr Gewicht und den Ring weiter unten.
              color: inIrgendeiner ? FOREST : '#FFFFFF',
              weight: inGruppe ? 3 : inIrgendeiner ? 2 : 1.5,
              // Alles, worauf ein Schütze sitzt, bekommt den Akzent — der Rest tritt zurück.
              fillColor: istStand(p.typ) ? ACCENT : NEUTRAL,
              fillOpacity: gedimmt ? GEDIMMT : 0.9,
              opacity: gedimmt ? GEDIMMT : 1,
            }}
          >
            {/* Das `key` erzwingt ein Neubinden: Leaflet liest `permanent` nur
                beim Anlegen des Tooltips, ein bloßer Prop-Wechsel bliebe wirkungslos. */}
            <Tooltip
              key={nameSteht ? 'fest' : 'hover'}
              permanent={nameSteht}
              direction="top"
              offset={[0, -6]}
              className="zentrale-karte-label"
            >
              {p.name}
            </Tooltip>
          </CircleMarker>
        )
      })}

      {/* **Stufe 2 von zwei: die angewählte Gruppe** (Reiter-Umbau 18.08.2026).
          Derselbe Mechanismus wie der Auswahlring darunter, nur in Forest und
          etwas enger — beide sind damit gleichzeitig lesbar, wenn ein Stand
          zugleich ausgewählt und Gruppenmitglied ist.

          **Ein Ring statt einer fünften Farbe**, weil Mengen sich überlappen:
          ein Stand in „Sauberg" UND „Betonstraße" hat keine eindeutige Farbe,
          wohl aber eine eindeutige Antwort auf „gehört er zu der, die ich gerade
          ansehe?". Der Rand am Marker trägt die erste Stufe, der Ring die
          zweite.

          Nur wenn es überhaupt mehr als die angewählte Gruppe gibt, wäre der
          Ring verzichtbar — er steht trotzdem immer, damit die Anzeige beim
          Anlegen der zweiten Gruppe nicht ihre Bedeutung wechselt. */}
      {gruppe &&
        punkte
          .filter((p) => gruppe.staende.has(p.id))
          .map((p) => (
            <CircleMarker
              key={`gruppe-${p.id}`}
              center={[p.lat, p.lng]}
              radius={8}
              interactive={false}
              pathOptions={{ color: FOREST, weight: 2, fill: false }}
            />
          ))}

      {/* Der Auswahlring liegt als eigener, nicht anklickbarer Kreis zuletzt im
          Baum und damit über allen Markern. Ein zweites Merkmal neben der Farbe:
          der Marker selbst behält seine Sitz-/Kein-Sitz-Färbung, die Auswahl
          würde sie sonst überschreiben und eine Information verdecken. */}
      {punkte
        .filter((p) => p.id === auswahlId || markiert?.has(p.id))
        .map((p) => (
          <CircleMarker
            key={`auswahl-${p.id}`}
            center={[p.lat, p.lng]}
            radius={11}
            interactive={false}
            pathOptions={{ color: BRONZE, weight: 2.5, fill: false }}
          />
        ))}
    </>
  )
}

/**
 * Revierkarte des Bereichs „Revier" — bis zum 08.08.2026 stand sie auf der
 * ÜBERSICHT, und dieser Satz sagte das auch; sie ist umgezogen, als der Bereich
 * seine eigene Route bekam.
 *
 * Objekte sind CircleMarker statt SVG-Pins: bei 196
 * Objekten (Revier Söder) ist das spürbar billiger, und der Pin trägt hier keine
 * Information, die der Name nicht auch trägt. Objekte bearbeiten kommt später;
 * hier ist bisher nur die Grenze editierbar.
 *
 * Einbindung über revierkarte.tsx (dynamic, ssr:false) — react-leaflet fasst
 * beim Import `window` an.
 */
export default function RevierkarteMap({
  grenze,
  punkte,
  zeichnen,
  setzen,
  aufRechteck,
  auswahlId = null,
  markiert,
  gruppe,
  aufAuswahl,
  randRechts = 0,
}: KarteProps & {
  /** Standgruppen zum Anzeigen/Bearbeiten, zwei Stufen — s. `Objekte`. */
  gruppe?: {
    alle: ReadonlySet<string>
    staende: ReadonlySet<string>
    bearbeiten: boolean
  }
  zeichnen?: ZeichenProps
  /** Setzmodus (Schritt 3b) — schließt `zeichnen` aus, beide wollen den Klick. */
  setzen?: SetzProps
  /**
   * Rechteckauswahl (C-45): Anfang und Ende des Zugs, in Ziehrichtung — der
   * Empfänger normalisiert. Nur gesetzt, wenn ein Zug Stände einsammeln soll.
   *
   * **Eine Funktion, kein Objekt mit einem Feld** (Ponytail 19.08.2026). Der
   * erste Entwurf hatte ein `RechteckProps` nach dem Vorbild von `zeichnen`
   * und `setzen` — die tragen aber drei bis fünf Felder, hier wäre die Hülle
   * eine Hülle um nichts. Das Vorbild ist `aufAuswahl` zwei Zeilen weiter, und
   * die Namensgleichheit ist der Punkt: es ist derselbe Rückkanal, nur für
   * mehrere Stände auf einmal.
   *
   * **Optional, und hier ist das keine tote Flexibilität** (anders als bei
   * `gruppen` in `revierkarte.tsx`, wo P3 sie zu Recht gestrichen hat): der
   * Treiben-Bereich importiert diese Datei direkt und übergibt sie nicht. Ohne
   * sie wird der Layer gar nicht gerendert, es läuft kein Effekt, und
   * `dragging` bleibt unangetastet — der zweite Aufrufer merkt von C-45
   * nichts.
   */
  aufRechteck?: (a: Ort, b: Ort) => void
  auswahlId?: string | null
  /** Mehrfachauswahl der Treiben-Karte (4b) — s. `Objekte`. */
  markiert?: ReadonlySet<string>
  aufAuswahl?: (id: string) => void
  /** Breite, die die Objektspalte rechts überdeckt — Zuschlag für `fitBounds`. */
  randRechts?: number
}) {
  const gewaehlt = punkte.find((p) => p.id === auswahlId)

  /**
   * Wer wählt hier aus — und wer nicht.
   *
   * Ein benannter Wert statt derselben Bedingung an vier Stellen. Genau daran
   * ist dieser Code schon zweimal gescheitert: ein Riegel, der als Ausdruck am
   * Aufrufer steht, wird beim nächsten Aufrufer vergessen. Zeichnen und Setzen
   * verbrauchen beide den Kartenklick, also darf in beiden Fällen kein Marker
   * dazwischenkommen — bei Söder wären das 196 Stück, die jeden Klick
   * schluckten, und es käme nie eine Position zustande.
   */
  const waehlbar = zeichnen || setzen ? undefined : aufAuswahl
  return (
    <MapContainer
      center={[51.2, 10.4]} // Platzhalter bis Ausschnitt greift
      zoom={6}
      zoomControl
      // Wheel-Zoom an. War kurzzeitig aus, um das Seiten-Scrollen zu schützen —
      // ein Problem, das niemand hatte, gegen ein Zoom-Problem, das jeder sofort
      // hatte. Karten zoomen am Rad, das ist die Erwartung.
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url={BKG_TOPPLUS.url}
        attribution={BKG_TOPPLUS.attribution}
        maxZoom={BKG_TOPPLUS.maxZoom}
      />

      {/* Beim Bearbeiten zeigt der Zeichenlayer den Entwurf — die gespeicherte
          Grenze daneben stehen zu lassen, wären zwei Wahrheiten in einem Bild. */}
      {!zeichnen && grenze && grenze.length > 0 && (
        <Polygon
          positions={grenze as L.LatLngExpression[][]}
          // **`interactive={false}` ist Pflicht, nicht Kosmetik.** Leaflet gibt
          // den Kartenklick NICHT weiter, wenn ein interaktiver Layer getroffen
          // wurde (`Map._findEventTargets` nimmt die Karte nur auf, wenn sonst
          // nichts traf). Die Fläche hat `fillOpacity: 0.07` und ist damit ein
          // Klickziel über dem gesamten Revier — im Setzmodus wäre innerhalb der
          // Grenze also KEINE Position setzbar, und zwar lautlos.
          //
          // Beim Zeichnen fiel das nie auf, weil die gespeicherte Grenze dort
          // gar nicht gezeichnet wird. Im Testrevier ist es dagegen sehr wohl
          // zu sehen: `Test 5` trägt seit dem 27.07.2026 eine gezeichnete Grenze
          // von 7,4 ha (nachgemessen 28.07.), und innerhalb dieser Fläche wäre
          // ohne diesen Prop keine Position setzbar. Genau dort gehört der Fall
          // also geprüft — nicht am grenzenlosen Revier.
          //
          // Dauerhaft aus, nicht nur im Setzmodus: die Fläche hat keinen
          // Klick-Handler und braucht auch keinen. Und `interactive` wertet
          // Leaflet nur beim Anlegen des Pfades aus — ein Umschalten bräuchte
          // denselben `key`-Neuaufbau wie bei den Markern, für nichts.
          interactive={false}
          pathOptions={{ color: ACCENT, weight: 2.5, fillColor: ACCENT, fillOpacity: 0.07 }}
        />
      )}

      {zeichnen && (
        <BoundaryDrawLayer
          drawPoints={zeichnen.punkte}
          onMapClick={zeichnen.aufKlick}
          onVertexDrag={zeichnen.aufZug}
          onVertexDelete={zeichnen.aufLoeschen}
          onMidpointInsert={zeichnen.aufEinfuegen}
        />
      )}

      {setzen && (
        <SetzLage
          kandidat={setzen.kandidat}
          ursprung={setzen.ursprung}
          aufOrt={setzen.aufOrt}
        />
      )}

      {/* **Der Ausschluss steht HIER und nicht beim Aufrufer** — dieselbe
          Begründung wie bei `waehlbar` weiter unten: ein Riegel, der als
          Ausdruck am Aufrufer steht, wird beim nächsten Aufrufer vergessen.
          Zeichnen und Setzen verbrauchen den Zug ebenso wie den Klick; ein
          Auswahlrechteck darüber nähme dem Grenzeneditor das Ziehen seiner
          Stützpunkte. Heute stellt kein Aufrufer diese Kombination her, und
          genau deshalb fiele es niemandem auf. */}
      {aufRechteck && !zeichnen && !setzen && <RechteckWahl aufWahl={aufRechteck} />}

      {/* Während des Zeichnens ist die Auswahl aus: ein Klick soll dann einen
          Grenzpunkt setzen, nicht ein Objekt auswählen — der Marker würde das
          Klickereignis sonst abfangen. Im Setzmodus gilt dasselbe.
          Der Auswahlring bleibt beim Setzen dagegen stehen: er zeigt, WELCHES
          Objekt gerade verschoben wird, und schluckt als `interactive={false}`
          keinen Klick. */}
      <Objekte
        punkte={punkte}
        auswahlId={zeichnen ? null : auswahlId}
        markiert={markiert}
        // Beim Zeichnen und Setzen tritt die Gruppenanzeige ab: dort gehört die
        // Aufmerksamkeit dem Entwurf, und ein abgeblendetes Revier machte das
        // Zielen auf einen Grenzpunkt schwerer, nicht leichter.
        gruppe={zeichnen || setzen ? undefined : gruppe}
        aufAuswahl={waehlbar}
      />
      <ZuAuswahl
        id={zeichnen ? null : auswahlId}
        lat={gewaehlt?.lat}
        lng={gewaehlt?.lng}
      />
      {/* Bewusst nur die GESPEICHERTE Grenze und die Objekte: bekäme `Ausschnitt`
          den Entwurf, liefe fitBounds bei jedem gesetzten Punkt erneut und die
          Karte würde unter der Hand wegrutschen. */}
      <Ausschnitt grenze={grenze} punkte={punkte} randRechts={randRechts} />
    </MapContainer>
  )
}
