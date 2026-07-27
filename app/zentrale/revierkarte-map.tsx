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
import { istStand } from './objekte'

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
function Ausschnitt({ grenze, punkte }: KarteProps) {
  const map = useMap()
  const letzteLage = useRef('')

  useEffect(() => {
    const beobachter = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    beobachter.observe(map.getContainer())
    return () => beobachter.disconnect()
  }, [map])

  useEffect(() => {
    map.invalidateSize()
    // Grenze UND Objekte: Stände können außerhalb der gezeichneten Grenze
    // liegen (nicht jedes Revier ist sauber vermessen) und wären sonst
    // beim ersten Blick nicht im Bild.
    const ecken: [number, number][] = [
      ...(grenze?.flat() ?? []),
      ...punkte.map((p) => [p.lat, p.lng] as [number, number]),
    ]
    if (ecken.length === 0) return

    // Auf die LAGE prüfen, nicht auf die Objektidentität der Props. Nach jedem
    // Speichern zieht `router.refresh()` die Server-Komponente nach und liefert
    // frische Arrays — ein Effekt, der nur an `punkte` hängt, hätte die Karte
    // seit Schritt 3 bei jedem umbenannten Objekt auf das ganze Revier
    // zurückgeworfen, mitten aus dem Hineinzoomen heraus. Nur eine echte
    // Ortsänderung darf den Ausschnitt neu setzen.
    // Sortiert, nicht bloß verkettet: der `map_objects`-SELECT hat kein
    // ORDER BY, Postgres darf die Zeilen also nach jedem Refresh anders
    // liefern. Ohne die Sortierung änderte sich die Signatur allein durch die
    // Reihenfolge — und ein bloßes Umbenennen hätte den Zoom des Nutzers
    // zurückgesetzt, obwohl sich kein Punkt bewegt hat. Von Codex gefunden,
    // 27.07.2026.
    const lage = ecken
      .map(([lat, lng]) => `${lat},${lng}`)
      .sort()
      .join(';')
    if (lage === letzteLage.current) return
    letzteLage.current = lage

    map.fitBounds(L.latLngBounds(ecken), { padding: [24, 24] })
  }, [map, grenze, punkte])
  return null
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
  aufAuswahl,
}: {
  punkte: Punkt[]
  auswahlId: string | null
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
        const gewaehlt = p.id === auswahlId
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
        .filter((p) => p.id === auswahlId)
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
 * Revierkarte der Übersicht. Objekte sind CircleMarker statt SVG-Pins: bei 196
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
  auswahlId = null,
  aufAuswahl,
}: KarteProps & {
  zeichnen?: ZeichenProps
  auswahlId?: string | null
  aufAuswahl?: (id: string) => void
}) {
  const gewaehlt = punkte.find((p) => p.id === auswahlId)
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

      {/* Während des Zeichnens ist die Auswahl aus: ein Klick soll dann einen
          Grenzpunkt setzen, nicht ein Objekt auswählen — der Marker würde das
          Klickereignis sonst abfangen. */}
      <Objekte
        punkte={punkte}
        auswahlId={zeichnen ? null : auswahlId}
        aufAuswahl={zeichnen ? undefined : aufAuswahl}
      />
      <ZuAuswahl
        id={zeichnen ? null : auswahlId}
        lat={gewaehlt?.lat}
        lng={gewaehlt?.lng}
      />
      {/* Bewusst nur die GESPEICHERTE Grenze und die Objekte: bekäme `Ausschnitt`
          den Entwurf, liefe fitBounds bei jedem gesetzten Punkt erneut und die
          Karte würde unter der Hand wegrutschen. */}
      <Ausschnitt grenze={grenze} punkte={punkte} />
    </MapContainer>
  )
}
