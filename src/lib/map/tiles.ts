/**
 * Zentrale Tile-Layer-Konfiguration für Leaflet-Karten.
 *
 * Aktuell nur der Default-Layer (BKG TopPlus, bundesweit). Bewusst ein
 * eigenes Modul, damit spätere Erweiterungen — Internationalisierung
 * (z.B. Polen), Provider-Wechsel, Migration der Hunt-Karte (MapContent)
 * weg vom NI-only-Layer — ein Ein-Datei-Change bleiben. PointMap liest
 * den Default-Layer hieraus, statt ihn inline zu hardcoden.
 */

export type MapTileLayer = {
  url: string
  attribution: string
  maxZoom?: number
}

/** BKG TopPlus Open — amtliche topographische Karte, deutschlandweit. */
export const BKG_TOPPLUS: MapTileLayer = {
  url: 'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png',
  attribution: '© BKG (2025) dl-de/by-2-0',
  maxZoom: 18,
}

/** Default-Layer für einfache Punkt-Anzeigen (Detail-Karten). */
export const DEFAULT_TILE_LAYER: MapTileLayer = BKG_TOPPLUS
