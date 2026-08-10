'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  TileLayer,
  Polygon,
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

const ACCENT = '#4A5A2A'
const NEUTRAL = '#8B8775'
/** Bronze aus den Design Locks. Bewusst nicht der Grün-Akzent: „ausgewählt" soll
 *  sich von „ist ein Sitz" unterscheiden lassen, nicht mit ihm verschwimmen. */
const BRONZE = '#C08E48'

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
  aufAuswahl,
}: {
  punkte: Punkt[]
  auswahlId: string | null
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
        // Der Name des ausgewählten Objekts steht immer, auch weit herausgezoomt:
        // sonst wäre die Auswahl unter Zoom 16 nur ein Ring ohne Auskunft.
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
            // Neuaufbau — er passiert nur beim Wechsel des Zeichenmodus.
            key={`${p.id}|${aufAuswahl ? 'waehlbar' : 'starr'}`}
            center={[p.lat, p.lng]}
            radius={5}
            interactive={!!aufAuswahl}
            eventHandlers={aufAuswahl ? { click: () => aufAuswahl(p.id) } : undefined}
            pathOptions={{
              color: '#FFFFFF',
              weight: 1.5,
              // Alles, worauf ein Schütze sitzt, bekommt den Akzent — der Rest tritt zurück.
              fillColor: istStand(p.typ) ? ACCENT : NEUTRAL,
              fillOpacity: 0.9,
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
  auswahlId = null,
  markiert,
  aufAuswahl,
  randRechts = 0,
}: KarteProps & {
  zeichnen?: ZeichenProps
  /** Setzmodus (Schritt 3b) — schließt `zeichnen` aus, beide wollen den Klick. */
  setzen?: SetzProps
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
